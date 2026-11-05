"""
Telegram transport + notification formatting.

Transport (call_telegram_api / send_telegram_message / send_telegram_document)
never raises: network errors, timeouts and Telegram errors come back as
{"success": False, "message", "error_code"}. 429 rate limits are retried after
Telegram's retry_after, HTML that Telegram can't parse is resent as plain text,
and long messages are split under the 4096-char limit.

Settings live in store_data.extra_info (bot token on store 0 / first store,
chat id per store) and small bot state in db_meta (no schema change).
"""

from typing import List, Dict, Any, Optional, Tuple
import logging
from os import getenv
import os
import re
import requests
import json
import html
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import time
from datetime import datetime, date

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Telegram Bot API configuration
TELEGRAM_BOT_TOKEN = getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_BASE = "https://api.telegram.org/bot"

# Telegram limits
MAX_MESSAGE_CHARS = 3900  # hard limit is 4096 (after entity parsing); keep a margin
MAX_UPLOAD_BYTES = 49 * 1024 * 1024  # bots may upload up to 50 MB

# Database connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")


def _db_connect():
    return psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)


# ─── Formatting helpers ─────────────────────────────────────────────────────


def _e(text) -> str:
    """HTML-escape dynamic text for Telegram HTML parse mode"""
    if text is None:
        return ""
    return html.escape(str(text))


esc = _e


def _to_float(value) -> float:
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    return v


def fmt_money(value) -> str:
    """1234.5 -> '1,234.50 ج.م' (never a raw float, never '-0.00')."""
    v = _to_float(value)
    if abs(v) < 0.005:
        v = 0.0
    return f"{v:,.2f} ج.م"


def fmt_signed_money(value) -> str:
    v = _to_float(value)
    if abs(v) < 0.005:
        return fmt_money(0)
    return ("+" if v > 0 else "") + fmt_money(v)


def fmt_qty(value) -> str:
    """Stock / quantities: integers without decimals, fractions trimmed."""
    v = _to_float(value)
    if abs(v - round(v)) < 1e-9:
        return f"{int(round(v)):,}"
    return f"{v:,.3f}".rstrip("0").rstrip(".")


from clock import _local_zone, local_now  # noqa: E402,F401  (shared store clock)


def _parse_dt(value) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    text = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        try:
            dt = datetime.fromisoformat(text[:19])
        except ValueError:
            return None
    if dt.tzinfo is not None:
        # Times reach us either naive local (DB) or ISO UTC from the browser.
        zone = _local_zone()
        dt = (dt.astimezone(zone) if zone is not None else dt.astimezone()).replace(
            tzinfo=None
        )
    return dt


def fmt_dt(value, with_time: bool = True) -> str:
    dt = _parse_dt(value)
    if dt is None:
        return _e(value) if value else "-"
    return dt.strftime("%Y-%m-%d %H:%M" if with_time else "%Y-%m-%d")


def fmt_size(num_bytes) -> str:
    n = _to_float(num_bytes)
    if n >= 1024 * 1024 * 1024:
        return f"{n / 1024 / 1024 / 1024:.2f} GB"
    if n >= 1024 * 1024:
        return f"{n / 1024 / 1024:.1f} MB"
    if n >= 1024:
        return f"{n / 1024:.0f} KB"
    return f"{int(n)} B"


SEPARATOR = "━━━━━━━━━━━━━━━━━━"


# ─── Settings storage ───────────────────────────────────────────────────────


def _get_preferred_store_id_for_settings(cur) -> Optional[int]:
    """Use store 0 as global settings holder when available, otherwise first store."""
    cur.execute(
        """
        SELECT id
        FROM store_data
        ORDER BY CASE WHEN id = 0 THEN 0 ELSE 1 END, id
        LIMIT 1
        """
    )
    row = cur.fetchone()
    return row["id"] if row else None


def _merge_store_extra_info(cur, store_id: int, values: Dict[str, Any]) -> None:
    """Atomically merge keys into store_data.extra_info (no read-modify-write race)."""
    cur.execute(
        """
        UPDATE store_data
        SET extra_info = COALESCE(extra_info, '{}'::jsonb) || %s::jsonb
        WHERE id = %s
        """,
        (json.dumps(values), store_id),
    )


def meta_get_json(key: str, default: Any = None) -> Any:
    """Read a JSON value from db_meta (key/value table, v18+)."""
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT value FROM db_meta WHERE key = %s", (key,))
            row = cur.fetchone()
            cur.close()
        finally:
            conn.close()
        if not row or row.get("value") is None:
            return default
        return json.loads(row["value"])
    except Exception as e:
        logger.debug(f"db_meta read failed for {key}: {e}")
        return default


def meta_set_json(key: str, value: Any) -> bool:
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO db_meta (key, value) VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                (key, json.dumps(value, ensure_ascii=False, default=str)),
            )
            conn.commit()
            cur.close()
        finally:
            conn.close()
        return True
    except Exception as e:
        logger.warning(f"db_meta write failed for {key}: {e}")
        return False


def save_telegram_bot_token(token: str) -> bool:
    """Persist Telegram bot token in store_data.extra_info so it survives restarts."""
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            store_id = _get_preferred_store_id_for_settings(cur)
            if store_id is None:
                return False
            _merge_store_extra_info(cur, store_id, {"telegram_bot_token": token})
            conn.commit()
            cur.close()
        finally:
            conn.close()
        return True
    except Exception as e:
        logger.error(f"Error saving Telegram bot token: {e}")
        return False


def load_telegram_bot_token() -> str:
    """Load Telegram bot token from DB into memory when not already set."""
    global TELEGRAM_BOT_TOKEN

    if TELEGRAM_BOT_TOKEN:
        return TELEGRAM_BOT_TOKEN

    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            store_id = _get_preferred_store_id_for_settings(cur)
            result = None
            if store_id is not None:
                cur.execute(
                    "SELECT extra_info FROM store_data WHERE id = %s", (store_id,)
                )
                result = cur.fetchone()
            cur.close()
        finally:
            conn.close()

        if result and result.get("extra_info"):
            token = result["extra_info"].get("telegram_bot_token")
            if token:
                TELEGRAM_BOT_TOKEN = token
                return TELEGRAM_BOT_TOKEN
    except Exception as e:
        logger.error(f"Error loading Telegram bot token: {e}")

    return ""


def current_bot_token() -> str:
    return TELEGRAM_BOT_TOKEN or load_telegram_bot_token()


def get_store_telegram_chat_id(store_id: int):
    """Get Telegram chat ID for a specific store"""
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT extra_info FROM store_data WHERE id = %s", (store_id,))
            result = cur.fetchone()
            cur.close()
        finally:
            conn.close()

        if result and result["extra_info"]:
            chat_id = result["extra_info"].get("telegram_chat_id")
            return str(chat_id).strip() if chat_id not in (None, "") else None
        return None
    except Exception as e:
        logger.error(f"Error getting store Telegram chat ID: {e}")
        return None


def get_all_store_chats() -> List[Dict[str, Any]]:
    """Every store with a linked chat: [{store_id, name, chat_id}]."""
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                SELECT id, name, extra_info->>'telegram_chat_id' AS chat_id
                FROM store_data
                WHERE COALESCE(extra_info->>'telegram_chat_id', '') <> ''
                ORDER BY id
                """
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            conn.close()
        return [
            {"store_id": r["id"], "name": r["name"], "chat_id": str(r["chat_id"]).strip()}
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error listing store chats: {e}")
        return []


def save_store_telegram_chat_id(store_id: int, chat_id: str):
    """Save Telegram chat ID for a specific store"""
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            _merge_store_extra_info(
                cur, store_id, {"telegram_chat_id": str(chat_id or "").strip()}
            )
            conn.commit()
            cur.close()
        finally:
            conn.close()
        return True
    except Exception as e:
        logger.error(f"Error saving store Telegram chat ID: {e}")
        return False


# ─── Bot API transport ──────────────────────────────────────────────────────


def _redact(text: Any) -> str:
    """Never let the bot token reach logs or API responses."""
    s = str(text)
    token = TELEGRAM_BOT_TOKEN
    if token:
        s = s.replace(token, "***")
    return re.sub(r"bot\d+:[A-Za-z0-9_-]{20,}", "bot***", s)


def call_telegram_api(
    method: str,
    data: Optional[dict] = None,
    timeout: int = 30,
    files: Optional[Dict[str, Tuple[str, str]]] = None,
    max_retries: int = 2,
    token: Optional[str] = None,
) -> dict:
    """
    Call the Telegram Bot API. Never raises.

    files: {field: (filename, local_path)} -> multipart upload (data sent as
    form fields). 429 is retried after retry_after (capped); a dropped
    connection is retried once for non-polling methods.
    """
    use_token = token or current_bot_token()
    if not use_token:
        return {
            "success": False,
            "message": "Telegram bot token not configured",
            "error_code": None,
        }

    url = f"{TELEGRAM_API_BASE}{use_token}/{method}"
    attempt = 0
    while True:
        try:
            if files:
                handles = {}
                try:
                    for field, (filename, path) in files.items():
                        handles[field] = (filename, open(path, "rb"))
                    form = {
                        k: (json.dumps(v) if isinstance(v, (dict, list)) else str(v))
                        for k, v in (data or {}).items()
                        if v is not None
                    }
                    response = requests.post(
                        url, data=form, files=handles, timeout=timeout
                    )
                finally:
                    for _name, fh in handles.values():
                        try:
                            fh.close()
                        except Exception:
                            pass
            else:
                response = requests.post(url, json=data or {}, timeout=timeout)
            try:
                result = response.json()
            except ValueError:
                result = {
                    "ok": False,
                    "error_code": response.status_code,
                    "description": f"HTTP {response.status_code}",
                }
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            is_timeout = isinstance(e, requests.exceptions.Timeout)
            if method != "getUpdates" and attempt < min(max_retries, 1):
                attempt += 1
                time.sleep(2)
                continue
            msg = (
                "Telegram API request timeout"
                if is_timeout
                else "Cannot connect to Telegram API"
            )
            logger.warning(f"{msg} ({method})")
            return {"success": False, "message": msg, "error_code": None}
        except Exception as e:
            logger.error(f"Unexpected error calling Telegram API {method}: {_redact(e)}")
            return {"success": False, "message": _redact(e), "error_code": None}

        if result.get("ok"):
            return {"success": True, "result": result.get("result")}

        code = result.get("error_code")
        params = result.get("parameters") or {}
        retry_after = params.get("retry_after")
        if code == 429 and attempt < max_retries:
            wait = min(max(int(retry_after or 1), 1), 60)
            logger.warning(f"Telegram rate limit on {method}; retrying in {wait}s")
            time.sleep(wait)
            attempt += 1
            continue

        return {
            "success": False,
            "message": _redact(result.get("description", "Unknown error")),
            "error_code": code,
            "retry_after": retry_after,
        }


def validate_bot_token(token: str = None) -> dict:
    """Validate a Telegram bot token by calling getMe"""
    use_token = (token or "").strip() or current_bot_token()
    if not use_token:
        return {"success": False, "message": "No bot token provided"}
    result = call_telegram_api("getMe", {}, timeout=10, max_retries=0, token=use_token)
    if result.get("success"):
        bot_info = result.get("result") or {}
        return {
            "success": True,
            "bot_username": bot_info.get("username"),
            "bot_name": bot_info.get("first_name"),
        }
    return {"success": False, "message": result.get("message", "Invalid bot token")}


def get_telegram_status() -> dict:
    """Get current Telegram bot status by validating the token"""
    token = current_bot_token()
    if not token:
        return {"connected": False, "bot_username": None}

    result = validate_bot_token(token)
    if result.get("success"):
        return {
            "connected": True,
            "bot_username": result.get("bot_username"),
        }
    return {"connected": False, "bot_username": None}


def chat_info_from_update(update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Pull the chat out of any update kind (message, button press, bot added)."""
    message = (
        update.get("message")
        or update.get("edited_message")
        or (update.get("callback_query") or {}).get("message")
        or update.get("my_chat_member")
        or {}
    )
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if chat_id is None:
        return None
    return {
        "chat_id": str(chat_id),
        "username": chat.get("username"),
        "first_name": chat.get("first_name", "") or "",
        "last_name": chat.get("last_name", "") or "",
        "type": chat.get("type", "private"),
        "title": chat.get("title"),  # For groups
    }


def get_telegram_updates(token: str = None) -> list:
    """
    Chats that recently talked to the bot (for the Settings auto-detect).

    The command worker long-polls getUpdates and confirms every update, so a
    second getUpdates here would both conflict with it (HTTP 409) and find
    nothing. Chats are taken from what the worker has seen; getUpdates is only
    used directly when the worker isn't polling.
    """
    seen: Dict[str, Dict[str, Any]] = {}
    polling = False
    try:
        from telegram_commands import get_recent_chats, is_worker_polling

        polling = is_worker_polling()
        for chat in get_recent_chats():
            seen[str(chat["chat_id"])] = chat
    except Exception as e:
        logger.debug(f"Recent chats unavailable: {e}")

    if not polling:
        result = call_telegram_api(
            "getUpdates",
            {"timeout": 0, "allowed_updates": ["message", "callback_query", "my_chat_member"]},
            timeout=10,
            max_retries=0,
            token=token,
        )
        updates = (result.get("result") or []) if result.get("success") else []
        for update in updates:
            info = chat_info_from_update(update)
            if info and info["chat_id"] not in seen:
                seen[info["chat_id"]] = info

    return list(seen.values())


def split_message(message: str, max_length: int = MAX_MESSAGE_CHARS) -> list:
    """Split a long message into chunks at line boundaries (hard-split long lines)."""
    message = message or ""
    if len(message) <= max_length:
        return [message]

    chunks: List[str] = []
    current = ""
    for line in message.split("\n"):
        while len(line) > max_length:
            if current:
                chunks.append(current.rstrip("\n"))
                current = ""
            chunks.append(line[:max_length])
            line = line[max_length:]
        if len(current) + len(line) + 1 > max_length:
            if current.strip():
                chunks.append(current.rstrip("\n"))
            current = line + "\n"
        else:
            current += line + "\n"

    if current.strip():
        chunks.append(current.rstrip("\n"))
    return chunks


def strip_html(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text or ""))


def send_telegram_message(
    chat_id: str,
    message: str,
    parse_mode: Optional[str] = "HTML",
    reply_markup: Optional[dict] = None,
) -> dict:
    """Send a message (split if long). reply_markup goes on the last chunk."""
    chunks = split_message(message)
    last_result: dict = {"success": False, "message": "Empty message"}

    for index, chunk in enumerate(chunks):
        if not chunk.strip():
            continue
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "text": chunk,
            "disable_web_page_preview": True,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        if reply_markup and index == len(chunks) - 1:
            payload["reply_markup"] = reply_markup

        result = call_telegram_api("sendMessage", payload)
        if (
            not result.get("success")
            and parse_mode
            and "parse" in str(result.get("message", "")).lower()
        ):
            # Broken markup must not lose the message: resend as plain text.
            payload.pop("parse_mode", None)
            payload["text"] = strip_html(chunk)
            result = call_telegram_api("sendMessage", payload)

        last_result = result
        if not result.get("success"):
            return result
        if len(chunks) > 1:
            time.sleep(0.35)

    return last_result


def send_telegram_document(
    chat_id: str,
    file_path: str,
    caption: str = "",
    filename: Optional[str] = None,
) -> dict:
    """Upload a file (<= 50 MB bot limit). Caption is HTML, max 1024 chars."""
    try:
        size = os.path.getsize(file_path)
    except OSError as e:
        return {"success": False, "message": str(e)}
    if size > MAX_UPLOAD_BYTES:
        return {"success": False, "message": "file too large", "too_large": True}

    caption = caption or ""
    if len(caption) > 1000:
        caption = caption[:1000]
    # Upload time grows with size; allow ~10 s per MB on a slow shop link.
    timeout = int(min(900, 60 + size / (100 * 1024)))
    return call_telegram_api(
        "sendDocument",
        {"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
        timeout=timeout,
        files={"document": (filename or os.path.basename(file_path), file_path)},
        max_retries=1,
    )


def send_notification_to_store(store_id: int, message: str) -> bool:
    """Send Telegram notification to a specific store's configured chat"""
    try:
        token = current_bot_token()
        if not token:
            logger.info("Telegram bot token not configured; notification skipped")
            return False

        chat_id = get_store_telegram_chat_id(store_id)
        if not chat_id:
            logger.info(f"No Telegram chat_id configured for store {store_id}")
            return False

        result = send_telegram_message(chat_id, message)

        if result.get("success"):
            logger.info(f"Notification sent to store {store_id}")
            return True
        logger.error(
            f"Failed to send notification to store {store_id}: {result.get('message')}"
        )
        return False

    except Exception as e:
        logger.error(f"Error sending notification to store {store_id}: {_redact(e)}")
        return False


def send_telegram_notification_background(store_id: int, message: str):
    """Background task to send Telegram notification"""
    try:
        success = send_notification_to_store(store_id, message)
        preview = message[:50] + "..." if len(message) > 50 else message
        if success:
            logging.info("Telegram notification %s was sent", preview)
        else:
            logging.info("Telegram notification %s was not sent", preview)
    except Exception as e:
        logging.error("Error in background task sending Telegram notification: %s", e)


# ─── Notification messages ──────────────────────────────────────────────────


def format_excessive_discount_message(
    bill_id: int,
    move_type: str,
    party_name: str,
    bill_time: str,
    wholesale_sum: float,
    bill_total: float,
    actual_discount: float,
    product_details: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> str:
    """Arabic alert for a sale whose discount pushed it below cost."""
    wholesale_sum = _to_float(wholesale_sum)
    bill_total = _to_float(bill_total)
    loss_amount = wholesale_sum - bill_total
    loss_percentage = (loss_amount / wholesale_sum) * 100 if wholesale_sum > 0 else 0

    expected_total = sum(
        _to_float(p.get("quantity")) * _to_float(p.get("sale_price"))
        for p in product_details
    )

    type_mapping = {"sell": "بيع", "BNPL": "بيع آجل", "installment": "بيع بالتقسيط"}
    arabic_type = type_mapping.get(move_type, move_type)

    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    product_lines = []
    for i, product in enumerate(product_details, 1):
        qty = _to_float(product.get("quantity"))
        price = _to_float(product.get("sale_price"))
        product_lines.append(
            f"{i}. {_e(product.get('name'))}\n"
            f"   {fmt_qty(qty)} × {fmt_money(price)} = {fmt_money(qty * price)}"
        )

    return "\n".join(
        [
            "🚨 <b>تنبيه: فاتورة بخصم أقل من التكلفة</b>",
            "",
            f"🆔 <b>رقم الفاتورة:</b> {_e(bill_id)}",
            f"🏪 <b>المتجر:</b> {store_display}",
            f"👨‍💼 <b>الموظف:</b> {user_display}",
            f"📝 <b>نوع العملية:</b> {_e(arabic_type)}",
            f"👤 <b>العميل:</b> {_e(party_name)}",
            f"📅 <b>التاريخ:</b> {fmt_dt(bill_time)}",
            SEPARATOR,
            f"🏷️ إجمالي سعر الشراء: {fmt_money(wholesale_sum)}",
            f"💵 قبل الخصم: {fmt_money(expected_total)}",
            f"🎯 الخصم: {fmt_money(actual_discount)}",
            f"💳 الإجمالي النهائي: {fmt_money(bill_total)}",
            f"⚠️ <b>الخسارة:</b> {fmt_money(loss_amount)} ({loss_percentage:.1f}%)",
            SEPARATOR,
            "🛍️ <b>المنتجات:</b>",
            *product_lines,
            SEPARATOR,
            "📞 يرجى مراجعة الخصم.",
        ]
    )


def format_low_stock_message(
    products_below_zero: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> str:
    """Arabic alert for products that reached zero/negative stock after a sale."""
    current_time = local_now().strftime("%Y-%m-%d %H:%M")
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    lines = [
        "⚠️ <b>تنبيه: منتجات نفد مخزونها</b>",
        "",
        f"🏪 <b>المتجر:</b> {store_display}",
        f"👨‍💼 <b>الموظف:</b> {user_display}",
        f"📅 <b>التاريخ:</b> {current_time}",
        SEPARATOR,
    ]
    for i, product in enumerate(products_below_zero, 1):
        sold = product.get("quantity_sold")
        sold_text = fmt_qty(sold) if sold is not None else "-"
        lines.append(
            f"{i}. {_e(product.get('name'))}\n"
            f"   🛒 المباع الآن: {sold_text} | 📦 المخزون: {fmt_qty(product.get('stock'))}"
        )
    return "\n".join(lines)


def check_stock_levels_after_sale(store_id: int, sold_products: List[Dict[str, Any]]):
    """Products from this sale whose stock is now <= 0."""
    try:
        # Give the stock triggers of the bill transaction a moment to land.
        time.sleep(1)

        if not sold_products:
            return []

        quantities: Dict[int, float] = {}
        for p in sold_products:
            pid = int(p["id"])
            quantities[pid] = quantities.get(pid, 0) + _to_float(p.get("quantity"))

        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                SELECT p.id, p.name, pi.stock
                FROM products p
                JOIN product_inventory pi ON p.id = pi.product_id
                WHERE p.id IN %s AND pi.store_id = %s
                  AND pi.is_deleted = FALSE AND pi.stock <= 0
                ORDER BY p.name
                """,
                (tuple(quantities), store_id),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            conn.close()

        return [
            {
                "name": r["name"],
                "stock": r["stock"],
                "product_id": r["id"],
                "quantity_sold": quantities.get(int(r["id"])),
            }
            for r in rows
        ]

    except Exception as e:
        logger.error(f"Error checking stock levels: {e}")
        return []


def send_low_stock_notification_background(
    store_id: int,
    products_below_zero: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
):
    """Background task: in-app notification + Telegram message for low stock"""
    try:
        if not products_below_zero:
            return

        from notifications import create_low_stock_notification

        create_low_stock_notification(store_id, products_below_zero)

        message = format_low_stock_message(
            products_below_zero=products_below_zero,
            store_name=store_name,
            user_name=user_name,
        )
        send_notification_to_store(store_id, message)
    except Exception as e:
        logging.error(
            "Error in background task sending low stock Telegram notification: %s", e
        )


def check_and_send_low_stock_notification(
    store_id: int,
    sold_products: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
):
    """Background task wrapper that checks stock levels and notifies if needed"""
    try:
        products_below_zero = check_stock_levels_after_sale(store_id, sold_products)
        if products_below_zero:
            send_low_stock_notification_background(
                store_id, products_below_zero, store_name, user_name
            )
    except Exception as e:
        logging.error(f"Error in background stock check task: {e}")


def format_store_transfer_message(
    source_store_name: str,
    destination_store_name: str,
    products: List[Dict[str, Any]],
    transfer_time: str,
    user_name: str = None,
) -> str:
    """Arabic notification for a product move between stores."""
    user_display = _e(user_name) if user_name else "غير محدد"
    lines = [
        "🔄 <b>نقل منتجات بين المتاجر</b>",
        "",
        f"📅 <b>التاريخ:</b> {fmt_dt(transfer_time)}",
        f"👤 <b>المستخدم:</b> {user_display}",
        f"🏪 <b>من:</b> {_e(source_store_name)}",
        f"🏬 <b>إلى:</b> {_e(destination_store_name)}",
        SEPARATOR,
    ]
    total_value = 0.0
    for i, product in enumerate(products, 1):
        qty = _to_float(product.get("quantity"))
        cost = _to_float(product.get("wholesale_price"))
        total_value += qty * cost
        lines.append(f"{i}. {_e(product.get('name', 'منتج'))} — {fmt_qty(qty)}")
    lines.append(SEPARATOR)
    lines.append(f"📦 عدد الأصناف: {len(products)}")
    if total_value:
        lines.append(f"💰 القيمة بسعر الشراء: {fmt_money(total_value)}")
    return "\n".join(lines)


def check_due_installments(store_id: int):
    """
    Installments of this store that are due today or overdue and not fully paid.

    Due date = last payment (or the bill date) + installment_interval days.
    Paid = deposit (installments.paid) + every installments_flow payment,
    total = the bill's lines value (same as the installments page).
    """
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                WITH inst AS (
                    SELECT
                        i.id, i.bill_id, COALESCE(i.paid, 0) AS paid,
                        i.installments_count, i.installment_interval,
                        b.time AS bill_time,
                        COALESCE(ap.name, 'عميل غير معروف') AS party_name,
                        COALESCE(ap.phone, '') AS party_phone
                    FROM installments i
                    JOIN bills b ON b.id = i.bill_id AND b.store_id = i.store_id
                    LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
                    WHERE i.store_id = %s
                ),
                lines AS (
                    SELECT
                        pf.bill_id,
                        ABS(COALESCE(SUM(pf.price * pf.amount), 0)) AS total,
                        json_agg(json_build_object(
                            'name', p.name,
                            'price', ABS(pf.price),
                            'amount', ABS(pf.amount),
                            'total', ABS(pf.price * pf.amount)
                        ) ORDER BY pf.id) AS products
                    FROM products_flow pf
                    JOIN products p ON p.id = pf.product_id
                    WHERE pf.store_id = %s
                      AND pf.bill_id IN (SELECT bill_id FROM inst)
                    GROUP BY pf.bill_id
                ),
                flows AS (
                    SELECT
                        installment_id,
                        COALESCE(SUM(amount), 0) AS flow_sum,
                        MAX(time) AS last_payment,
                        json_agg(json_build_object(
                            'amount', amount, 'time', time::text
                        ) ORDER BY time) AS flow
                    FROM installments_flow
                    WHERE installment_id IN (SELECT id FROM inst)
                    GROUP BY installment_id
                )
                SELECT
                    inst.id, inst.bill_id, inst.paid, inst.installments_count,
                    inst.installment_interval, inst.party_name, inst.party_phone,
                    COALESCE(l.total, 0) AS total,
                    COALESCE(l.products, '[]'::json) AS products,
                    COALESCE(f.flow, '[]'::json) AS flow,
                    inst.paid + COALESCE(f.flow_sum, 0) AS total_paid,
                    COALESCE(f.last_payment, inst.bill_time) AS last_payment_date,
                    COALESCE(f.last_payment, inst.bill_time)
                        + make_interval(days => COALESCE(inst.installment_interval, 0))
                        AS next_due_date
                FROM inst
                LEFT JOIN lines l ON l.bill_id = inst.bill_id
                LEFT JOIN flows f ON f.installment_id = inst.id
                WHERE inst.paid + COALESCE(f.flow_sum, 0) < COALESCE(l.total, 0) - 0.009
                  AND (COALESCE(f.last_payment, inst.bill_time)
                        + make_interval(days => COALESCE(inst.installment_interval, 0)))::date
                      <= CURRENT_DATE
                ORDER BY next_due_date ASC
                """,
                (store_id, store_id),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            conn.close()

        for row in rows:
            row["total"] = _to_float(row.get("total"))
            row["total_paid"] = _to_float(row.get("total_paid"))
            row["paid"] = _to_float(row.get("paid"))
        return rows

    except Exception as e:
        logger.error(f"Error checking due installments: {e}")
        return []


def installment_days_overdue(installment: Dict[str, Any]) -> int:
    due = _parse_dt(installment.get("next_due_date"))
    if due is None:
        return 0
    return max(0, (local_now().date() - due.date()).days)


def format_due_installments_message(
    due_installments: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> str:
    """Shift-open message, with the due/overdue installments if any."""
    current_time = local_now().strftime("%Y-%m-%d %H:%M")
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    lines = [
        "✅ <b>تم فتح شيفت جديد</b>",
        "",
        f"🏪 <b>المتجر:</b> {store_display}",
        f"👨‍💼 <b>المستخدم:</b> {user_display}",
        f"📅 <b>الوقت:</b> {current_time}",
    ]
    if not due_installments:
        return "\n".join(lines)

    total_remaining = sum(
        _to_float(i.get("total")) - _to_float(i.get("total_paid"))
        for i in due_installments
    )
    lines += [
        SEPARATOR,
        f"📅 <b>أقساط مستحقة: {len(due_installments)}</b> — المتبقي {fmt_money(total_remaining)}",
        "",
    ]

    for installment in due_installments:
        total = _to_float(installment.get("total"))
        total_paid = _to_float(installment.get("total_paid"))
        days = installment_days_overdue(installment)
        status = f"متأخر {days} يوم ⚠️" if days > 0 else "مستحق اليوم"
        lines.append(
            f"🔸 <b>{_e(installment.get('party_name'))}</b>"
            + (f" — {_e(installment.get('party_phone'))}" if installment.get("party_phone") else "")
        )
        lines.append(
            f"   قسط #{_e(installment.get('id'))} (فاتورة #{_e(installment.get('bill_id'))}) • "
            f"{fmt_dt(installment.get('next_due_date'), with_time=False)} • {status}"
        )
        lines.append(
            f"   الإجمالي {fmt_money(total)} • المدفوع {fmt_money(total_paid)} • "
            f"<b>المتبقي {fmt_money(total - total_paid)}</b>"
        )
        products = installment.get("products") or []
        if isinstance(products, str):
            try:
                products = json.loads(products)
            except ValueError:
                products = []
        if products:
            names = "، ".join(_e(p.get("name")) for p in products[:4])
            more = f" و{len(products) - 4} أخرى" if len(products) > 4 else ""
            lines.append(f"   🛍️ {names}{more}")
        lines.append("")

    lines.append("⚠️ <b>يرجى متابعة العملاء لتحصيل المبالغ المستحقة</b>")
    return "\n".join(lines)


def send_due_installments_notification_background(
    store_id: int,
    store_name: str = None,
    user_name: str = None,
):
    """Shift open: in-app notifications for due installments + Telegram message."""
    try:
        due_installments = check_due_installments(store_id)

        if due_installments:
            from notifications import create_due_installments_notification

            create_due_installments_notification(store_id, due_installments)

        message = format_due_installments_message(
            due_installments=due_installments,
            store_name=store_name,
            user_name=user_name,
        )
        send_notification_to_store(store_id, message)
    except Exception as e:
        logging.error(
            f"Error in background task sending due installments Telegram notification: {e}"
        )


def check_products_depleted_during_shift(store_id: int, shift_start_time: str):
    """
    Products that reached 0 or below during the shift and had positive stock
    when it started.
    """
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                WITH shift_product_movements AS (
                    SELECT
                        pf.product_id,
                        SUM(pf.amount) AS total_shift_movement,
                        p.name AS product_name
                    FROM products_flow pf
                    JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
                    JOIN products p ON pf.product_id = p.id
                    WHERE pf.store_id = %s
                      AND b.time >= %s
                      AND pf.bill_id > 0
                    GROUP BY pf.product_id, p.name
                    HAVING SUM(pf.amount) < 0
                )
                SELECT
                    spm.product_id,
                    spm.product_name,
                    pi.stock AS current_stock,
                    pi.stock - spm.total_shift_movement AS stock_before_shift,
                    ABS(spm.total_shift_movement) AS consumed_amount
                FROM shift_product_movements spm
                JOIN product_inventory pi
                  ON spm.product_id = pi.product_id AND pi.store_id = %s
                WHERE pi.is_deleted = FALSE
                  AND pi.stock - spm.total_shift_movement > 0
                  AND pi.stock <= 0
                ORDER BY spm.product_name
                """,
                (store_id, shift_start_time, store_id),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            conn.close()
        return rows

    except Exception as e:
        logger.error(f"Error checking products depleted during shift: {e}")
        return []


def get_shift_account_breakdown(store_id: int, since) -> List[Dict[str, Any]]:
    """Per account: movement since `since` and current balance (like /shift-total)."""
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                SELECT
                    pm.name,
                    COALESCE(SUM(at.amount) FILTER (WHERE at.time >= %s), 0) AS shift_total,
                    COALESCE(SUM(at.amount), 0) AS balance
                FROM payment_methods pm
                LEFT JOIN account_transactions at
                    ON at.payment_method_id = pm.id AND at.store_id = %s
                WHERE pm.is_deleted = FALSE
                   OR EXISTS (
                        SELECT 1 FROM account_transactions at2
                        WHERE at2.payment_method_id = pm.id AND at2.store_id = %s
                   )
                GROUP BY pm.id, pm.name, pm.is_default
                HAVING COALESCE(SUM(at.amount), 0) <> 0
                    OR COALESCE(SUM(at.amount) FILTER (WHERE at.time >= %s), 0) <> 0
                ORDER BY pm.is_default DESC, pm.id ASC
                """,
                (since, store_id, store_id, since),
            )
            rows = cur.fetchall()
            cur.close()
        finally:
            conn.close()
        return [
            {
                "method": r["name"],
                "shift_total": _to_float(r["shift_total"]),
                "balance": _to_float(r["balance"]),
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error loading account breakdown: {e}")
        return []


def format_shift_closure_message(
    shift_data: Dict[str, Any],
    store_name: str = None,
    user_name: str = None,
    shift_start_time: str = None,
) -> str:
    """Shift closure summary (the figures come from /logout as before)."""
    # Shift rows are stamped with the store clock (clock.local_now()).
    current_time = local_now().strftime("%Y-%m-%d %H:%M")
    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    shift_duration = "غير محدد"
    formatted_start_time = "غير محدد"
    start_dt = _parse_dt(shift_start_time)
    if start_dt is not None:
        duration = local_now() - start_dt
        hours = int(duration.total_seconds() // 3600)
        minutes = int((duration.total_seconds() % 3600) // 60)
        shift_duration = f"{hours} ساعة و {minutes} دقيقة"
        formatted_start_time = start_dt.strftime("%Y-%m-%d %H:%M")

    sell_total = _to_float(shift_data.get("sell_total"))
    return_total = abs(_to_float(shift_data.get("return_total")))
    installment_total = abs(_to_float(shift_data.get("installment_total")))
    buy_total = abs(_to_float(shift_data.get("buy_total")))
    cash_in = _to_float(shift_data.get("cash_in"))
    cash_out = _to_float(shift_data.get("cash_out"))
    net_cash_flow = _to_float(shift_data.get("net_cash_flow"))
    transaction_count = int(_to_float(shift_data.get("transaction_count")))

    gross_revenue = sell_total - return_total
    avg_transaction = gross_revenue / transaction_count if transaction_count > 0 else 0

    inventory_summary = get_daily_inventory_summary(shift_data.get("store_id"))

    lines = [
        "🔐 <b>تم إغلاق الشيفت</b>",
        "",
        f"🏪 <b>المتجر:</b> {store_display}",
        f"👨‍💼 <b>المستخدم:</b> {user_display}",
        f"🚀 <b>البداية:</b> {formatted_start_time}",
        f"🕐 <b>الإغلاق:</b> {current_time}",
        f"⏱️ <b>المدة:</b> {shift_duration}",
        SEPARATOR,
        "💰 <b>الملخص المالي</b>",
        f"💵 المبيعات: {fmt_money(sell_total)}",
        f"🔄 المرتجعات: {fmt_money(return_total)}",
        f"📈 <b>صافي المبيعات: {fmt_money(gross_revenue)}</b>",
    ]
    if buy_total:
        lines.append(f"🚚 المشتريات: {fmt_money(buy_total)}")
    lines += [
        f"🏦 الأقساط المحصلة: {fmt_money(installment_total)}",
        "",
        "💳 <b>الحركة النقدية</b>",
        f"⬆️ الداخل: {fmt_money(cash_in)}",
        f"⬇️ الخارج: {fmt_money(cash_out)}",
        f"💰 <b>الصافي: {fmt_money(net_cash_flow)}</b>",
    ]

    accounts = shift_data.get("account_breakdown") or []
    if accounts:
        lines += ["", "🏦 <b>الحسابات (حركة الشيفت • الرصيد)</b>"]
        for acc in accounts:
            lines.append(
                f"• {_e(acc['method'])}: {fmt_signed_money(acc['shift_total'])} • {fmt_money(acc['balance'])}"
            )

    lines += [
        SEPARATOR,
        f"🧾 عدد المعاملات: {transaction_count}",
        f"💸 متوسط المعاملة: {fmt_money(avg_transaction)}",
        SEPARATOR,
        "📋 <b>الجرد</b>",
        f"🏷️ قيمة المخزون (شراء): {fmt_money(inventory_summary['wholesale_value'])}",
        f"💰 قيمة المخزون (بيع): {fmt_money(inventory_summary['retail_value'])}",
        f"📦 الأصناف: {fmt_qty(inventory_summary['total_products'])} "
        f"(موجب {fmt_qty(inventory_summary['positive_stock_products'])} • "
        f"صفر/سالب {fmt_qty(inventory_summary['non_positive_stock_products'])})",
    ]
    return "\n".join(lines)


def get_daily_inventory_summary(store_id: int) -> Dict[str, float]:
    """Inventory value (at purchase and sale prices) and product counts."""
    empty = {
        "wholesale_value": 0.0,
        "retail_value": 0.0,
        "total_products": 0,
        "positive_stock_products": 0,
        "non_positive_stock_products": 0,
    }
    if store_id is None:
        return empty
    try:
        conn = _db_connect()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(pi.stock * p.wholesale_price), 0) AS wholesale_value,
                    COALESCE(SUM(pi.stock * p.price), 0) AS retail_value,
                    COUNT(*) AS total_products,
                    COUNT(CASE WHEN pi.stock > 0 THEN 1 END) AS positive_stock_products,
                    COUNT(CASE WHEN pi.stock <= 0 THEN 1 END) AS non_positive_stock_products
                FROM product_inventory pi
                JOIN products p ON pi.product_id = p.id
                WHERE pi.store_id = %s
                  AND pi.is_deleted = FALSE
                """,
                (store_id,),
            )
            result = cur.fetchone()
            cur.close()
        finally:
            conn.close()

        if not result:
            return empty
        return {
            "wholesale_value": _to_float(result["wholesale_value"]),
            "retail_value": _to_float(result["retail_value"]),
            "total_products": int(result["total_products"] or 0),
            "positive_stock_products": int(result["positive_stock_products"] or 0),
            "non_positive_stock_products": int(
                result["non_positive_stock_products"] or 0
            ),
        }

    except Exception as e:
        logger.error(f"Error getting daily inventory summary: {e}")
        return empty


def format_depleted_products_message(
    depleted_products: List[Dict[str, Any]],
    store_name: str = None,
    user_name: str = None,
) -> Optional[str]:
    """Products that ran out during the shift (None when there are none)."""
    if not depleted_products:
        return None

    store_display = _e(store_name) if store_name else "غير محدد"
    user_display = _e(user_name) if user_name else "غير محدد"

    lines = [
        "📦 <b>منتجات نفدت خلال الشيفت</b>",
        "",
        f"🏪 <b>المتجر:</b> {store_display}",
        f"👨‍💼 <b>المستخدم:</b> {user_display}",
        SEPARATOR,
    ]
    for i, product in enumerate(depleted_products, 1):
        lines.append(
            f"{i}. {_e(product.get('product_name', 'منتج'))} — "
            f"استُهلك {fmt_qty(product.get('consumed_amount'))} • "
            f"المخزون {fmt_qty(product.get('current_stock'))}"
        )
    lines += [
        SEPARATOR,
        f"📋 الإجمالي: {len(depleted_products)} منتج",
        "🚚 يرجى تجهيز هذه المنتجات للتوريد",
    ]
    return "\n".join(lines)


def send_shift_closure_notification_background(
    store_id: int,
    shift_data: Dict[str, Any],
    store_name: str = None,
    user_name: str = None,
    shift_start_time: str = None,
):
    """Shift closure: summary message, then depleted products (if any)."""
    try:
        shift_data["store_id"] = store_id
        if shift_start_time and "account_breakdown" not in shift_data:
            shift_data["account_breakdown"] = get_shift_account_breakdown(
                store_id, shift_start_time
            )

        depleted_products = (
            check_products_depleted_during_shift(store_id, shift_start_time)
            if shift_start_time
            else []
        )

        closure_message = format_shift_closure_message(
            shift_data=shift_data,
            store_name=store_name,
            user_name=user_name,
            shift_start_time=shift_start_time,
        )
        send_notification_to_store(store_id, closure_message)

        depleted_message = format_depleted_products_message(
            depleted_products=depleted_products,
            store_name=store_name,
            user_name=user_name,
        )
        if depleted_message:
            time.sleep(1)
            send_notification_to_store(store_id, depleted_message)

    except Exception as e:
        logging.error(
            f"Error in background task sending shift closure Telegram notification: {e}"
        )

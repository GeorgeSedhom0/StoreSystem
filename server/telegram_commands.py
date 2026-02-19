import asyncio
import html
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
from psycopg2.extras import RealDictCursor

from telegram_utils import (
    HOST,
    DATABASE,
    USER,
    PASS,
    get_daily_inventory_summary,
    get_store_telegram_chat_id,
    send_telegram_message,
    call_telegram_api,
)

logger = logging.getLogger(__name__)

_worker_health: Dict[str, Any] = {
    "running": False,
    "last_poll_at": None,
    "last_update_id": None,
    "last_error": None,
}


ARABIC_DIACRITICS_RE = re.compile(r"[\u0617-\u061A\u064B-\u0652]")

BILL_TYPE_AR = {
    "sell": "بيع",
    "buy": "شراء",
    "return": "مرتجع",
    "installment": "تقسيط",
    "BNPL": "آجل",
    "reserve": "حجز",
    "buy-return": "مرتجع شراء",
}


HELP_MESSAGE = """📚 <b>الأوامر المتاحة</b>

1) <b>عرض المتاجر المرتبطة بهذه المحادثة</b>
   المتاجر

2) <b>قيمة المخزون</b>
   قيمة المخزون متجر &lt;رقم&gt; بيع
   قيمة المخزون متجر &lt;رقم&gt; شراء

3) <b>آخر الفواتير</b>
   آخر &lt;عدد&gt; فواتير متجر &lt;رقم&gt;

4) <b>تنبيهات سريعة</b>
   مخزون منخفض متجر &lt;رقم&gt;
    حركة النقد الشيفت متجر &lt;رقم&gt;
    ملخص الشيفت متجر &lt;رقم&gt;

5) <b>تحليلات مالية</b>
    نظرة مالية متجر &lt;رقم&gt;
    تحليل تفصيلي متجر &lt;رقم&gt;

6) <b>مساعدة</b>
   مساعدة"""


def get_telegram_command_worker_health() -> Dict[str, Any]:
    return {
        "running": _worker_health["running"],
        "last_poll_at": _worker_health["last_poll_at"],
        "last_update_id": _worker_health["last_update_id"],
        "last_error": _worker_health["last_error"],
    }


def _db_connect():
    return psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)


def _normalize_text(text: str) -> str:
    normalized = (text or "").strip().lower()
    normalized = ARABIC_DIACRITICS_RE.sub("", normalized)
    normalized = re.sub(r"[إأآٱ]", "ا", normalized)
    normalized = normalized.replace("ى", "ي")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _load_telegram_updates_offset() -> int:
    try:
        conn = _db_connect()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT extra_info
            FROM store_data
            ORDER BY CASE WHEN id = 0 THEN 0 ELSE 1 END, id
            LIMIT 1
            """
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row or not row.get("extra_info"):
            return 0

        value = row["extra_info"].get("telegram_updates_offset")
        if value is None:
            return 0
        return int(value)
    except Exception as e:
        logger.error(f"Error loading Telegram updates offset: {e}")
        return 0


def _save_telegram_updates_offset(offset: int) -> None:
    try:
        conn = _db_connect()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            """
            SELECT id, extra_info
            FROM store_data
            ORDER BY CASE WHEN id = 0 THEN 0 ELSE 1 END, id
            LIMIT 1
            """
        )
        row = cur.fetchone()

        if not row:
            cur.close()
            conn.close()
            return

        extra_info = row["extra_info"] if row["extra_info"] else {}
        extra_info["telegram_updates_offset"] = int(offset)

        cur.execute(
            "UPDATE store_data SET extra_info = %s WHERE id = %s",
            (json.dumps(extra_info), row["id"]),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error saving Telegram updates offset: {e}")


def _fetch_updates_raw(offset: int, timeout_seconds: int = 30) -> List[Dict[str, Any]]:
    result = call_telegram_api(
        "getUpdates",
        {
            "offset": offset,
            "timeout": timeout_seconds,
            "allowed_updates": ["message"],
        },
        timeout=timeout_seconds + 5,
    )
    if not result.get("success"):
        return []
    payload = result.get("result")
    if isinstance(payload, list):
        return payload
    return []


def _list_accessible_stores(chat_id: str) -> List[Dict[str, Any]]:
    try:
        conn = _db_connect()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT id, name
            FROM store_data
            WHERE extra_info->>'telegram_chat_id' = %s
            ORDER BY id
            """,
            (str(chat_id),),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except Exception as e:
        logger.error(f"Error listing stores for chat {chat_id}: {e}")
        return []


def _is_chat_authorized_for_store(chat_id: str, store_id: int) -> bool:
    mapped_chat_id = get_store_telegram_chat_id(store_id)
    return str(mapped_chat_id) == str(chat_id)


def _get_store_name(store_id: int) -> str:
    try:
        conn = _db_connect()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT name FROM store_data WHERE id = %s", (store_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row and row.get("name"):
            return str(row["name"])
        return f"متجر {store_id}"
    except Exception:
        return f"متجر {store_id}"


def _format_datetime_for_msg(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    text = str(value or "")
    return text[:16].replace("T", " ")


def _end_exclusive(end_dt: datetime) -> datetime:
    return end_dt + timedelta(microseconds=1)


def _get_shift_window(store_id: int) -> Dict[str, Any]:
    now = datetime.now()
    try:
        conn = _db_connect()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            """
            SELECT start_date_time
            FROM shifts
            WHERE current = TRUE AND store_id = %s
            LIMIT 1
            """,
            (store_id,),
        )
        current_shift = cur.fetchone()
        if current_shift:
            start = current_shift["start_date_time"]
            cur.close()
            conn.close()
            return {
                "has_shift": True,
                "is_current": True,
                "label": "الشيفت الحالي",
                "start": start,
                "end": now,
            }

        cur.execute(
            """
            SELECT start_date_time, COALESCE(end_date_time, CURRENT_TIMESTAMP) AS end_date_time
            FROM shifts
            WHERE store_id = %s
            ORDER BY start_date_time DESC
            LIMIT 1
            """,
            (store_id,),
        )
        last_shift = cur.fetchone()
        cur.close()
        conn.close()

        if last_shift:
            return {
                "has_shift": True,
                "is_current": False,
                "label": "آخر شيفت مغلق",
                "start": last_shift["start_date_time"],
                "end": last_shift["end_date_time"],
            }

        # Fallback in case no shifts exist
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return {
            "has_shift": False,
            "is_current": False,
            "label": "لا يوجد شيفت مسجل (اليوم حتى الآن)",
            "start": today_start,
            "end": now,
        }
    except Exception as e:
        logger.error(f"Error loading shift window for store {store_id}: {e}")
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return {
            "has_shift": False,
            "is_current": False,
            "label": "تعذر قراءة الشيفت (اليوم حتى الآن)",
            "start": today_start,
            "end": now,
        }


def _get_last_bills(store_id: int, limit: int) -> List[Dict[str, Any]]:
    safe_limit = min(max(limit, 1), 50)
    conn = _db_connect()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT
            b.id,
            b.time,
            b.type,
            b.total,
            b.discount,
            COALESCE(ap.name, 'غير محدد') AS party_name
        FROM bills b
        LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
        WHERE b.store_id = %s
        ORDER BY b.time DESC
        LIMIT %s
        """,
        (store_id, safe_limit),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def _get_low_stock_products(store_id: int, threshold: int = 10, limit: int = 20):
    conn = _db_connect()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT p.name, pi.stock
        FROM product_inventory pi
        JOIN products p ON p.id = pi.product_id
        WHERE pi.store_id = %s
          AND pi.is_deleted = FALSE
          AND pi.stock <= %s
        ORDER BY pi.stock ASC, p.name ASC
        LIMIT %s
        """,
        (store_id, threshold, limit),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def _get_cash_flow_range(
    store_id: int, start_dt: datetime, end_dt: datetime
) -> Dict[str, float]:
    end_exclusive = _end_exclusive(end_dt)
    conn = _db_connect()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN type = 'out' THEN ABS(amount) ELSE 0 END), 0) AS cash_out
        FROM cash_flow
        WHERE store_id = %s
                    AND time >= %s
                AND time < %s
        """,
        (store_id, start_dt, end_exclusive),
    )
    row = cur.fetchone() or {"cash_in": 0, "cash_out": 0}
    cur.close()
    conn.close()

    cash_in = float(row.get("cash_in") or 0)
    cash_out = float(row.get("cash_out") or 0)
    return {
        "cash_in": cash_in,
        "cash_out": cash_out,
        "net": cash_in - cash_out,
    }


def _get_shift_summary(
    store_id: int, start_dt: datetime, end_dt: datetime
) -> Dict[str, float]:
    end_exclusive = _end_exclusive(end_dt)
    conn = _db_connect()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT
        COALESCE(SUM(CASE WHEN b.type = 'sell' AND (b.party_id IS NULL OR ap.type != 'store') THEN b.total ELSE 0 END), 0) AS sell_total,
        COALESCE(SUM(CASE WHEN b.type = 'sell' AND b.party_id IS NOT NULL AND ap.type = 'store' THEN b.total ELSE 0 END), 0) AS sell_total_internal,
            COALESCE(SUM(CASE WHEN type = 'return' THEN ABS(total) ELSE 0 END), 0) AS return_total,
            COALESCE(SUM(CASE WHEN type = 'buy' THEN ABS(total) ELSE 0 END), 0) AS buy_total,
            COALESCE(SUM(CASE WHEN type = 'installment' THEN ABS(total) ELSE 0 END), 0) AS installment_total,
        COUNT(*) FILTER (WHERE b.type = 'sell' AND (b.party_id IS NULL OR ap.type != 'store')) AS bills_count,
        COUNT(*) FILTER (WHERE b.type = 'sell' AND b.party_id IS NOT NULL AND ap.type = 'store') AS internal_sell_bills_count
    FROM bills b
    LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
    WHERE b.store_id = %s
      AND b.time >= %s
      AND b.time < %s
        """,
        (store_id, start_dt, end_exclusive),
    )
    bill_row = cur.fetchone() or {}
    cur.close()
    conn.close()

    cash = _get_cash_flow_range(store_id, start_dt, end_dt)

    sell_total = float(bill_row.get("sell_total") or 0)
    sell_total_internal = float(bill_row.get("sell_total_internal") or 0)
    return_total = float(bill_row.get("return_total") or 0)
    buy_total = float(bill_row.get("buy_total") or 0)
    installment_total = float(bill_row.get("installment_total") or 0)
    bills_count = int(bill_row.get("bills_count") or 0)

    return {
        "sell_total": sell_total,
        "sell_total_internal": sell_total_internal,
        "return_total": return_total,
        "buy_total": buy_total,
        "installment_total": installment_total,
        "bills_count": bills_count,
        "internal_sell_bills_count": int(
            bill_row.get("internal_sell_bills_count") or 0
        ),
        "cash_in": cash["cash_in"],
        "cash_out": cash["cash_out"],
        "cash_net": cash["net"],
    }


def _get_financial_overview(
    store_id: int, start_dt: datetime, end_dt: datetime
) -> Dict[str, float]:
    end_exclusive = _end_exclusive(end_dt)
    cash = _get_cash_flow_range(store_id, start_dt, end_dt)

    conn = _db_connect()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Main sales cards (similar to detailed cards)
    cur.execute(
        """
        SELECT
            COUNT(*) FILTER (WHERE b.type IN ('sell','return')) AS bills_count,
            COALESCE(SUM(b.total) FILTER (WHERE b.type IN ('sell','return')), 0) AS total_sales,
            COALESCE(AVG(b.discount) FILTER (WHERE b.type IN ('sell','return')), 0) AS avg_discount
        FROM bills b
        LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
        WHERE b.store_id = %s
                    AND b.time >= %s AND b.time < %s
          AND (b.party_id IS NULL OR ap.type != 'store')
        """,
        (store_id, start_dt, end_exclusive),
    )
    cards = cur.fetchone() or {"bills_count": 0, "total_sales": 0, "avg_discount": 0}

    # Simple realized profit from sell lines
    cur.execute(
        """
        SELECT COALESCE(SUM((pf.price - pf.wholesale_price) * (-pf.amount)), 0) AS profit
        FROM products_flow pf
        JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
        LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
        WHERE b.store_id = %s
          AND b.type = 'sell'
          AND pf.amount < 0
                    AND b.time >= %s AND b.time < %s
          AND (b.party_id IS NULL OR ap.type != 'store')
        """,
        (store_id, start_dt, end_exclusive),
    )
    profit_row = cur.fetchone() or {"profit": 0}

    # Non-bill cash only (like detailed cards)
    cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS non_bill_in,
            COALESCE(SUM(CASE WHEN type = 'out' THEN -amount ELSE 0 END), 0) AS non_bill_out
        FROM cash_flow
        WHERE store_id = %s
          AND bill_id IS NULL
                    AND time >= %s AND time < %s
        """,
        (store_id, start_dt, end_exclusive),
    )
    non_bill = cur.fetchone() or {"non_bill_in": 0, "non_bill_out": 0}

    cur.close()
    conn.close()

    total_sales = float(cards.get("total_sales") or 0)
    bills_count = int(cards.get("bills_count") or 0)
    avg_bill_total = total_sales / bills_count if bills_count > 0 else 0.0
    profit = float(profit_row.get("profit") or 0)
    non_bill_in = float(non_bill.get("non_bill_in") or 0)
    non_bill_out = float(non_bill.get("non_bill_out") or 0)

    return {
        "cash_in": cash["cash_in"],
        "cash_out": cash["cash_out"],
        "net_cash": cash["net"],
        "profit": profit,
        "total_sales": total_sales,
        "bills_count": bills_count,
        "avg_bill_total": avg_bill_total,
        "avg_discount": float(cards.get("avg_discount") or 0),
        "non_bill_in": non_bill_in,
        "non_bill_out": non_bill_out,
        "total_profit_net": profit + non_bill_in - non_bill_out,
    }


def _get_top_products_overview(
    store_id: int,
    start_dt: datetime,
    end_dt: datetime,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    end_exclusive = _end_exclusive(end_dt)
    conn = _db_connect()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT
            p.name,
            COALESCE(SUM(-pf.amount), 0) AS total_units_sold,
            COALESCE(SUM((-pf.amount) * pf.price), 0) AS total_sales_value,
            COALESCE(SUM((-pf.amount) * (pf.price - pf.wholesale_price)), 0) AS total_profit
        FROM products_flow pf
        JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
        JOIN products p ON p.id = pf.product_id
        LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
        WHERE b.store_id = %s
          AND b.type = 'sell'
          AND pf.amount < 0
                    AND b.time >= %s AND b.time < %s
          AND (b.party_id IS NULL OR ap.type != 'store')
        GROUP BY p.name
        ORDER BY total_sales_value DESC
        LIMIT %s
        """,
        (store_id, start_dt, end_exclusive, limit),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def _parse_command(message_text: str) -> Tuple[str, Dict[str, Any]]:
    text = _normalize_text(message_text)

    if text in {"مساعدة", "الاوامر", "اوامر", "help"}:
        return "help", {}

    if text in {"المتاجر", "متاجر"}:
        return "stores", {}

    inventory_match = re.match(r"^قيمة(?: المخزون)? متجر (\d+) (بيع|شراء)$", text)
    if inventory_match:
        return (
            "inventory_value",
            {
                "store_id": int(inventory_match.group(1)),
                "basis": inventory_match.group(2),
            },
        )

    bills_match = re.match(r"^اخر (\d+) فواتير متجر (\d+)$", text)
    if bills_match:
        return (
            "last_bills",
            {
                "count": int(bills_match.group(1)),
                "store_id": int(bills_match.group(2)),
            },
        )

    low_stock_match = re.match(r"^مخزون منخفض متجر (\d+)$", text)
    if low_stock_match:
        return ("low_stock", {"store_id": int(low_stock_match.group(1))})

    cash_match = re.match(r"^حركة النقد اليوم متجر (\d+)$", text)
    if cash_match:
        return ("cash_today", {"store_id": int(cash_match.group(1))})

    cash_shift_match = re.match(r"^حركة النقد الشيفت متجر (\d+)$", text)
    if cash_shift_match:
        return ("cash_today", {"store_id": int(cash_shift_match.group(1))})

    summary_match = re.match(r"^ملخص(?: اليوم| الشيفت)? متجر (\d+)$", text)
    if summary_match:
        return ("shift_summary", {"store_id": int(summary_match.group(1))})

    financial_match = re.match(r"^(?:نظرة|ملخص) مالية متجر (\d+)$", text)
    if financial_match:
        return ("financial_overview", {"store_id": int(financial_match.group(1))})

    detailed_match = re.match(r"^(?:تحليل|تقرير) تفصيلي متجر (\d+)$", text)
    if detailed_match:
        return ("detailed_overview", {"store_id": int(detailed_match.group(1))})

    return "unknown", {}


def _deny_message(store_id: int) -> str:
    return (
        f"⛔ غير مصرح لك باستخدام أوامر المتجر {store_id}.\n"
        "تأكد أنك تستخدم نفس المحادثة المحفوظة لهذا المتجر."
    )


def _format_currency(amount: float) -> str:
    return f"{amount:.2f} ج.م"


def _handle_command(chat_id: str, command: str, args: Dict[str, Any]) -> str:
    if command == "help":
        return HELP_MESSAGE

    if command == "stores":
        stores = _list_accessible_stores(chat_id)
        if not stores:
            return "لا توجد متاجر مرتبطة بهذه المحادثة حالياً."
        lines = ["🏪 <b>المتاجر المرتبطة:</b>"]
        for store in stores:
            store_name = html.escape(
                str(store.get("name") or f"متجر {store.get('id')}")
            )
            lines.append(f"- متجر {store['id']}: {store_name}")
        return "\n".join(lines)

    if command == "inventory_value":
        store_id = args["store_id"]
        basis = args["basis"]
        if not _is_chat_authorized_for_store(chat_id, store_id):
            return _deny_message(store_id)

        summary = get_daily_inventory_summary(store_id)
        store_name = html.escape(_get_store_name(store_id))

        if basis == "شراء":
            value = float(summary.get("wholesale_value") or 0)
            label = "سعر الشراء"
        else:
            value = float(summary.get("retail_value") or 0)
            label = "سعر البيع"

        total_products = int(summary.get("total_products") or 0)
        return (
            f"📦 <b>قيمة المخزون - {store_name}</b>\n"
            f"الأساس: {label}\n"
            f"القيمة: {_format_currency(value)}\n"
            f"عدد الأصناف: {total_products}"
        )

    if command == "last_bills":
        store_id = args["store_id"]
        count = args["count"]
        if not _is_chat_authorized_for_store(chat_id, store_id):
            return _deny_message(store_id)

        bills = _get_last_bills(store_id, count)
        store_name = html.escape(_get_store_name(store_id))

        if not bills:
            return f"لا توجد فواتير حديثة في {store_name}."

        safe_count = min(max(count, 1), 50)
        lines = [f"🧾 <b>آخر {safe_count} فواتير - {store_name}</b>"]
        for bill in bills:
            bill_id = bill.get("id")
            bill_type_key = str(bill.get("type") or "-")
            bill_type = BILL_TYPE_AR.get(bill_type_key, bill_type_key)
            bill_type = html.escape(str(bill_type))
            party_name = html.escape(str(bill.get("party_name") or "غير محدد"))
            bill_time = _format_datetime_for_msg(bill.get("time"))
            total = float(bill.get("total") or 0)
            discount = float(bill.get("discount") or 0)
            lines.extend(
                [
                    f"\n<b>#{bill_id}</b> • {bill_type}",
                    f"💰 الإجمالي: {_format_currency(total)}",
                    f"🏷️ الخصم: {_format_currency(discount)}",
                    f"👤 الطرف: {party_name}",
                    f"🕒 الوقت: {bill_time}",
                ]
            )
        return "\n".join(lines)

    if command == "low_stock":
        store_id = args["store_id"]
        if not _is_chat_authorized_for_store(chat_id, store_id):
            return _deny_message(store_id)

        rows = _get_low_stock_products(store_id)
        store_name = html.escape(_get_store_name(store_id))
        if not rows:
            return f"✅ لا يوجد مخزون منخفض حالياً في {store_name}."

        lines = [f"⚠️ <b>مخزون منخفض - {store_name}</b>"]
        for row in rows:
            name = html.escape(str(row.get("name") or "منتج"))
            stock = row.get("stock") or 0
            lines.append(f"• {name}: {stock}")
        return "\n".join(lines)

    if command == "cash_today":
        store_id = args["store_id"]
        if not _is_chat_authorized_for_store(chat_id, store_id):
            return _deny_message(store_id)

        shift_window = _get_shift_window(store_id)
        cash = _get_cash_flow_range(
            store_id, shift_window["start"], shift_window["end"]
        )
        store_name = html.escape(_get_store_name(store_id))
        return (
            f"💳 <b>حركة النقد - {store_name}</b>\n"
            f"الفترة: {shift_window['label']}\n"
            f"من: {_format_datetime_for_msg(shift_window['start'])}\n"
            f"إلى: {_format_datetime_for_msg(shift_window['end'])}\n"
            f"داخل: {_format_currency(cash['cash_in'])}\n"
            f"خارج: {_format_currency(cash['cash_out'])}\n"
            f"الصافي: {_format_currency(cash['net'])}"
        )

    if command == "shift_summary":
        store_id = args["store_id"]
        if not _is_chat_authorized_for_store(chat_id, store_id):
            return _deny_message(store_id)

        shift_window = _get_shift_window(store_id)
        summary = _get_shift_summary(
            store_id, shift_window["start"], shift_window["end"]
        )
        store_name = html.escape(_get_store_name(store_id))
        sell_total_all = summary["sell_total"] + summary["sell_total_internal"]
        net_sales = summary["sell_total"] - summary["return_total"]

        return (
            f"📊 <b>ملخص الشيفت - {store_name}</b>\n"
            f"الفترة: {shift_window['label']}\n"
            f"من: {_format_datetime_for_msg(shift_window['start'])}\n"
            f"إلى: {_format_datetime_for_msg(shift_window['end'])}\n"
            f"إجمالي البيع (كله): {_format_currency(sell_total_all)}\n"
            f"إجمالي البيع: {_format_currency(summary['sell_total'])}\n"
            f"بيع داخلي (Store Party): {_format_currency(summary['sell_total_internal'])}\n"
            f"المرتجعات: {_format_currency(summary['return_total'])}\n"
            f"صافي المبيعات: {_format_currency(net_sales)}\n"
            f"المشتريات: {_format_currency(summary['buy_total'])}\n"
            f"الأقساط: {_format_currency(summary['installment_total'])}\n"
            f"عدد فواتير البيع العادي: {summary['bills_count']}\n"
            f"عدد فواتير البيع الداخلي: {summary['internal_sell_bills_count']}\n"
            f"صافي النقد: {_format_currency(summary['cash_net'])}"
        )

    if command == "financial_overview":
        store_id = args["store_id"]
        if not _is_chat_authorized_for_store(chat_id, store_id):
            return _deny_message(store_id)

        shift_window = _get_shift_window(store_id)
        overview = _get_financial_overview(
            store_id, shift_window["start"], shift_window["end"]
        )
        store_name = html.escape(_get_store_name(store_id))

        return (
            f"🏦 <b>النظرة المالية - {store_name}</b>\n"
            f"الفترة: {shift_window['label']}\n"
            f"من: {_format_datetime_for_msg(shift_window['start'])}\n"
            f"إلى: {_format_datetime_for_msg(shift_window['end'])}\n"
            f"\n💵 إجمالي المبيعات: {_format_currency(overview['total_sales'])}\n"
            f"📈 الربح (تقريبي): {_format_currency(overview['profit'])}\n"
            f"💳 صافي النقد: {_format_currency(overview['net_cash'])}\n"
            f"🧾 عدد الفواتير: {overview['bills_count']}\n"
            f"🏷️ متوسط الخصم: {overview['avg_discount']:.2f}\n"
            f"📦 متوسط الفاتورة: {_format_currency(overview['avg_bill_total'])}"
        )

    if command == "detailed_overview":
        store_id = args["store_id"]
        if not _is_chat_authorized_for_store(chat_id, store_id):
            return _deny_message(store_id)

        shift_window = _get_shift_window(store_id)
        overview = _get_financial_overview(
            store_id, shift_window["start"], shift_window["end"]
        )
        top_products = _get_top_products_overview(
            store_id, shift_window["start"], shift_window["end"], limit=3
        )
        store_name = html.escape(_get_store_name(store_id))

        lines = [
            f"📋 <b>تقرير تفصيلي سريع - {store_name}</b>",
            f"الفترة: {shift_window['label']}",
            f"من: {_format_datetime_for_msg(shift_window['start'])}",
            f"إلى: {_format_datetime_for_msg(shift_window['end'])}",
            "",
            f"💵 المبيعات: {_format_currency(overview['total_sales'])}",
            f"📈 الربح: {_format_currency(overview['profit'])}",
            f"➕ نقد غير مرتبط بفواتير: {_format_currency(overview['non_bill_in'])}",
            f"➖ صرف غير مرتبط بفواتير: {_format_currency(overview['non_bill_out'])}",
            f"✅ صافي ربح شامل: {_format_currency(overview['total_profit_net'])}",
            "",
            "🔥 أفضل 3 منتجات:",
        ]

        if top_products:
            for idx, product in enumerate(top_products, 1):
                name = html.escape(str(product.get("name") or "منتج"))
                units = float(product.get("total_units_sold") or 0)
                sales = float(product.get("total_sales_value") or 0)
                profit = float(product.get("total_profit") or 0)
                lines.append(
                    f"{idx}) {name} | كمية: {units:.0f} | مبيعات: {_format_currency(sales)} | ربح: {_format_currency(profit)}"
                )
        else:
            lines.append("لا يوجد بيانات مبيعات كافية للفترة.")

        return "\n".join(lines)

    return "❓ الأمر غير معروف.\nاكتب: مساعدة\nلرؤية كل الأوامر المتاحة."


def _process_single_update(update: Dict[str, Any]) -> None:
    message = update.get("message") or {}
    text = message.get("text")
    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    if not text or chat_id is None:
        return

    command, args = _parse_command(str(text))
    response = _handle_command(str(chat_id), command, args)
    send_telegram_message(str(chat_id), response)


async def telegram_command_worker_loop() -> None:
    _worker_health["running"] = True
    _worker_health["last_error"] = None

    try:
        offset = await asyncio.to_thread(_load_telegram_updates_offset)

        while True:
            try:
                _worker_health["last_poll_at"] = datetime.utcnow().isoformat()
                updates = await asyncio.to_thread(_fetch_updates_raw, offset, 25)

                if not updates:
                    await asyncio.sleep(1)
                    continue

                for update in updates:
                    update_id = int(update.get("update_id", 0))
                    if update_id <= 0:
                        continue

                    await asyncio.to_thread(_process_single_update, update)
                    offset = update_id + 1
                    _worker_health["last_update_id"] = update_id
                    await asyncio.to_thread(_save_telegram_updates_offset, offset)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                _worker_health["last_error"] = str(e)
                logger.error(f"Error in Telegram command worker cycle: {e}")
                await asyncio.sleep(5)

    except asyncio.CancelledError:
        logger.info("Telegram command worker stopped")
        raise
    finally:
        _worker_health["running"] = False

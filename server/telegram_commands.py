"""
Telegram bot: command parsing, reports and the long-polling worker.

Input is matched tolerantly: Arabic or English, with or without a leading
slash, `/cmd@BotName` in groups, Arabic/Persian digits, extra spaces, emoji
from the reply keyboard, hamza/ta-marbuta/alef-maqsura variants, filler words
before the command ("عايز مبيعات اليوم") and typos (difflib). Unknown input
gets the closest commands as buttons.

Authorization is unchanged: a chat can use a store's commands only if it is
the chat saved for that store in Settings -> تليجرام. With several linked
stores the bot asks which one (or "متجر 2" in the message picks it).

Anything that writes (adding a cash movement) is never executed from a fuzzy
guess: it always asks for confirmation with buttons first.

Numbers follow the app: sales/returns/purchases like the detailed analytics,
profit from the shared FIFO module, accounts = SUM(account_transactions).
"""

import asyncio
import difflib
import json
import logging
import re
import secrets
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from psycopg2.extras import RealDictCursor

import telegram_utils as tu
from telegram_utils import (
    esc,
    fmt_dt,
    fmt_money,
    fmt_qty,
    fmt_signed_money,
    fmt_size,
    SEPARATOR,
)

logger = logging.getLogger(__name__)

_worker_health: Dict[str, Any] = {
    "running": False,
    "state": "stopped",
    "last_poll_at": None,
    "last_update_id": None,
    "last_error": None,
    "last_error_at": None,
    "commands_registered": False,
    "bot_username": None,
}

_recent_chats: Dict[str, Dict[str, Any]] = {}
_recent_lock = threading.Lock()
_recent_saved_at = 0.0

_pending: Dict[str, Dict[str, Any]] = {}
_pending_lock = threading.Lock()
PENDING_TTL = timedelta(minutes=10)

FAR_FUTURE = datetime(2999, 1, 1)

BILL_TYPE_AR = {
    "sell": "بيع",
    "buy": "شراء",
    "return": "مرتجع",
    "installment": "تقسيط",
    "BNPL": "آجل",
    "reserve": "حجز",
    "buy-return": "مرتجع شراء",
}

PARTY_TYPE_AR = {
    "customer": "عميل",
    "supplier": "مورد",
    "store": "متجر",
    "owner": "صاحب المحل",
}

ATTENDANCE_AR = {
    "present": "✅ حاضر",
    "absent": "❌ غائب",
    "half": "🌓 نصف يوم",
    "leave": "🏖️ إجازة",
}


# ─── Health / recent chats (used by the Settings page) ──────────────────────


def get_telegram_command_worker_health() -> Dict[str, Any]:
    return dict(_worker_health)


def is_worker_polling() -> bool:
    if _worker_health.get("state") != "polling":
        return False
    try:
        last = datetime.fromisoformat(_worker_health.get("last_poll_at") or "")
    except ValueError:
        return False
    return datetime.now() - last < timedelta(seconds=120)


def _remember_chat(info: Optional[Dict[str, Any]]) -> None:
    global _recent_saved_at
    if not info:
        return
    is_new = False
    with _recent_lock:
        if not _recent_chats:
            stored = tu.meta_get_json("telegram_recent_chats", [])
            for chat in stored if isinstance(stored, list) else []:
                if isinstance(chat, dict) and chat.get("chat_id"):
                    _recent_chats[str(chat["chat_id"])] = chat
        is_new = info["chat_id"] not in _recent_chats
        _recent_chats[info["chat_id"]] = {
            **info,
            "last_seen": datetime.now().isoformat(timespec="seconds"),
        }
        if len(_recent_chats) > 20:
            oldest = sorted(_recent_chats.values(), key=lambda c: c.get("last_seen", ""))
            for chat in oldest[: len(_recent_chats) - 20]:
                _recent_chats.pop(chat["chat_id"], None)
        snapshot = list(_recent_chats.values())
    if is_new or time.time() - _recent_saved_at > 60:
        _recent_saved_at = time.time()
        tu.meta_set_json("telegram_recent_chats", snapshot)


def get_recent_chats() -> List[Dict[str, Any]]:
    with _recent_lock:
        if _recent_chats:
            chats = list(_recent_chats.values())
        else:
            stored = tu.meta_get_json("telegram_recent_chats", [])
            chats = [c for c in stored if isinstance(c, dict)] if isinstance(stored, list) else []
    return sorted(chats, key=lambda c: c.get("last_seen", ""), reverse=True)


# ─── Normalization ──────────────────────────────────────────────────────────

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_DIACRITICS_RE = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")


def normalize(text: str) -> str:
    t = (text or "").translate(_DIGITS)
    t = t.replace("ـ", "")  # tatweel
    t = _DIACRITICS_RE.sub("", t)
    t = re.sub("[إأآٱ]", "ا", t)
    t = t.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    t = t.replace("٫", ".").replace("٬", "")
    t = t.lower()
    t = re.sub(r"(?<=\d),(?=\d{3}\b)", "", t)  # 1,500 -> 1500
    # Emoji / punctuation -> space (keep '#', ':', '.', '-', '/', '@', '+').
    t = re.sub(r"[^\w\s#:.\-/@+]", " ", t)
    t = t.replace("_", " ")
    t = re.sub(r"\s+", " ", t).strip()
    t = t.strip(".:-")
    return t.strip()


def _strip_command_prefix(text: str) -> str:
    """'/today@MyBot extra' -> 'today extra'; '@MyBot today' -> 'today'."""
    t = text.strip()
    t = re.sub(r"^@\w+\s+", "", t)
    t = re.sub(r"^/+", "", t)
    t = re.sub(r"^([^\s@]+)@\w+", r"\1", t)
    return t.strip()


_NUMBER_RE = re.compile(r"^\d+(?:\.\d+)?$")


def _is_number(token: str) -> bool:
    return bool(_NUMBER_RE.match(token))


_STORE_RE = re.compile(
    r"(?:^|\s)(?:في\s+)?(?:لل|ل|ال)?(?:متجر|محل|فرع)\s*(?:رقم\s*)?#?(\d+)(?=\s|$)"
    r"|(?:^|\s)(?:store|shop|branch)\s*#?(\d+)(?=\s|$)"
)


def _extract_store(text: str) -> Tuple[str, Optional[int]]:
    m = _STORE_RE.search(text)
    if not m:
        return text, None
    store_id = int(m.group(1) or m.group(2))
    return re.sub(r"\s+", " ", (text[: m.start()] + " " + text[m.end():])).strip(), store_id


_PERIODS: List[Tuple[str, str]] = [
    ("الشهر الماضي", "lastmonth"),
    ("الشهر اللي فات", "lastmonth"),
    ("last month", "lastmonth"),
    ("اخر 7 ايام", "week"),
    ("7 ايام", "week"),
    ("هذا الشهر", "month"),
    ("الشهر ده", "month"),
    ("this month", "month"),
    ("this week", "week"),
    ("النهارده", "today"),
    ("النهاردة", "today"),
    ("اليوم", "today"),
    ("today", "today"),
    ("امبارح", "yesterday"),
    ("البارحه", "yesterday"),
    ("امس", "yesterday"),
    ("yesterday", "yesterday"),
    ("الاسبوع", "week"),
    ("اسبوع", "week"),
    ("week", "week"),
    ("الشهر", "month"),
    ("شهر", "month"),
    ("month", "month"),
]


def _extract_period(text: str) -> Tuple[str, Optional[str]]:
    padded = f" {text} "
    for phrase, key in _PERIODS:
        needle = f" {phrase} "
        if needle in padded:
            padded = padded.replace(needle, " ", 1)
            return re.sub(r"\s+", " ", padded).strip(), key
    return text, None


def period_bounds(period: Optional[str], now: Optional[datetime] = None) -> Tuple[datetime, datetime, str]:
    now = now or tu.local_now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "yesterday":
        return today - timedelta(days=1), today, "أمس " + (today - timedelta(days=1)).strftime("%Y-%m-%d")
    if period == "week":
        return today - timedelta(days=6), today + timedelta(days=1), "آخر 7 أيام"
    if period == "month":
        return today.replace(day=1), today + timedelta(days=1), "هذا الشهر " + today.strftime("%Y-%m")
    if period == "lastmonth":
        first_this = today.replace(day=1)
        first_prev = (first_this - timedelta(days=1)).replace(day=1)
        return first_prev, first_this, "الشهر الماضي " + first_prev.strftime("%Y-%m")
    return today, today + timedelta(days=1), "اليوم " + today.strftime("%Y-%m-%d")


# ─── Command registry ───────────────────────────────────────────────────────


@dataclass
class Reply:
    text: str
    markup: Optional[dict] = None


@dataclass
class Ctx:
    chat_id: str
    raw: str = ""
    text: str = ""  # normalized, store + period removed
    text_full: str = ""  # normalized, store removed (period kept)
    rest: str = ""  # normalized words after the command
    rest_raw: str = ""  # original words after the command
    numbers: List[float] = field(default_factory=list)
    period: Optional[str] = None
    store_id: Optional[int] = None
    store_name: str = ""
    linked: List[Dict[str, Any]] = field(default_factory=list)
    note: str = ""


@dataclass
class Command:
    key: str
    slash: str
    title: str
    aliases: List[str]
    handler: Callable[[Ctx], List[Reply]]
    needs_store: bool = True
    needs_link: bool = True
    example: str = ""


COMMANDS: List[Command] = []
_ALIASES: List[Tuple[List[str], str]] = []  # (alias words, key), longest first


def _register(cmd: Command) -> None:
    COMMANDS.append(cmd)


def _build_alias_index() -> None:
    _ALIASES.clear()
    for cmd in COMMANDS:
        for alias in [cmd.slash, cmd.key] + cmd.aliases:
            words = normalize(alias).split()
            if words and (words, cmd.key) not in _ALIASES:
                _ALIASES.append((words, cmd.key))
    _ALIASES.sort(key=lambda a: len(a[0]), reverse=True)


def _command(key: str) -> Optional[Command]:
    for cmd in COMMANDS:
        if cmd.key == key:
            return cmd
    return None


def _match_exact(words: List[str]) -> Optional[Tuple[str, int, int]]:
    """Longest alias found as consecutive words; prefers the earliest position."""
    for start in range(min(len(words), 4)):
        for alias_words, key in _ALIASES:
            n = len(alias_words)
            if words[start : start + n] == alias_words:
                return key, start, n
    return None


def _fuzzy_candidates(words: List[str], limit: int = 3) -> List[Tuple[float, str]]:
    scores: Dict[str, float] = {}
    for alias_words, key in _ALIASES:
        n = len(alias_words)
        for start in range(min(len(words), 3)):
            chunk = " ".join(words[start : start + n])
            if not chunk:
                continue
            ratio = difflib.SequenceMatcher(None, chunk, " ".join(alias_words)).ratio()
            if len(chunk) <= 3 and ratio < 1:
                ratio *= 0.8  # very short words match too easily
            if ratio > scores.get(key, 0):
                scores[key] = ratio
    ranked = sorted(((s, k) for k, s in scores.items()), reverse=True)
    return ranked[:limit]


# ─── DB helpers ─────────────────────────────────────────────────────────────


@contextmanager
def _cursor(commit: bool = False):
    conn = tu._db_connect()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cur
            if commit:
                conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
    finally:
        conn.close()


def _f(value) -> float:
    return tu._to_float(value)


def _linked_stores(chat_id: str) -> List[Dict[str, Any]]:
    return [
        {"id": s["store_id"], "name": s["name"] or f"متجر {s['store_id']}"}
        for s in tu.get_all_store_chats()
        if str(s["chat_id"]) == str(chat_id)
    ]


def _default_store_map() -> Dict[str, int]:
    data = tu.meta_get_json("telegram_chat_default_store", {})
    return data if isinstance(data, dict) else {}


def _set_default_store(chat_id: str, store_id: int) -> None:
    data = _default_store_map()
    data[str(chat_id)] = int(store_id)
    tu.meta_set_json("telegram_chat_default_store", data)


def _not_linked_text(chat_id: str) -> str:
    return (
        "🔒 <b>هذه المحادثة غير مرتبطة بأي متجر.</b>\n"
        f"معرف المحادثة: <code>{esc(chat_id)}</code>\n\n"
        "للربط: افتح البرنامج ← الإعدادات ← تليجرام، والصق هذا المعرف في "
        "«معرف المحادثة» ثم اضغط حفظ (أو استخدم «كشف تلقائي»)."
    )


def _shift_window(cur, store_id: int) -> Dict[str, Any]:
    cur.execute(
        """
        SELECT s.start_date_time, s.end_date_time, s.current, u.username
        FROM shifts s
        LEFT JOIN users u ON u.id = s.user_id
        WHERE s.store_id = %s
        ORDER BY (s.current IS TRUE) DESC, s.start_date_time DESC NULLS LAST
        LIMIT 1
        """,
        (store_id,),
    )
    row = cur.fetchone()
    # Shift rows are stamped with the store clock (clock.local_now()).
    now = tu.local_now()
    if row and row["current"]:
        return {
            "label": "الشيفت الحالي",
            "start": row["start_date_time"],
            "end": FAR_FUTURE,
            "end_display": now,
            "user": row["username"],
            "current": True,
        }
    if row:
        end = row["end_date_time"] or now
        return {
            "label": "آخر شيفت (مغلق)",
            "start": row["start_date_time"],
            "end": end,
            "end_display": end,
            "user": row["username"],
            "current": False,
        }
    start, end, _ = period_bounds("today")
    return {
        "label": "لا يوجد شيفت مسجل — اليوم",
        "start": start,
        "end": end,
        "end_display": now,
        "user": None,
        "current": False,
    }


def _period_summary(cur, store_id: int, start: datetime, end: datetime) -> Dict[str, Any]:
    """Sales figures for [start, end) — same rules as the detailed analytics."""
    cur.execute(
        """
        SELECT
            COALESCE(SUM(b.total) FILTER (WHERE b.type = 'sell' AND is_customer), 0) AS sell_total,
            COUNT(*) FILTER (WHERE b.type = 'sell' AND is_customer) AS sell_count,
            COALESCE(SUM(b.total) FILTER (WHERE b.type = 'return' AND is_customer), 0) AS return_total,
            COUNT(*) FILTER (WHERE b.type = 'return' AND is_customer) AS return_count,
            COALESCE(SUM(b.discount) FILTER (WHERE b.type = 'sell' AND is_customer), 0) AS discount_total,
            COALESCE(SUM(b.total) FILTER (WHERE b.type = 'sell' AND is_store), 0) AS internal_sell_total,
            COUNT(*) FILTER (WHERE b.type = 'sell' AND is_store) AS internal_sell_count,
            COALESCE(-SUM(b.total) FILTER (WHERE b.type IN ('buy', 'buy-return') AND is_customer), 0) AS purchases,
            COUNT(*) FILTER (WHERE b.type = 'BNPL' AND is_customer) AS bnpl_count,
            COUNT(*) FILTER (WHERE b.type = 'installment' AND is_customer) AS installment_count,
            COUNT(*) FILTER (WHERE b.type = 'reserve' AND is_customer) AS reserve_count
        FROM (
            -- Same party rule as the analytics: (party_id IS NULL OR type != 'store').
            SELECT b.*,
                   (b.party_id IS NULL OR ap.type != 'store') AS is_customer,
                   (b.party_id IS NOT NULL AND ap.type = 'store') AS is_store
            FROM bills b
            LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
            WHERE b.store_id = %s AND b.time >= %s AND b.time < %s
        ) b
        """,
        (store_id, start, end),
    )
    s = cur.fetchone() or {}

    cur.execute(
        """
        SELECT
            COALESCE(-SUM(pf.price * pf.amount) FILTER (WHERE b.type = 'BNPL'), 0) AS bnpl_value,
            COALESCE(-SUM(pf.price * pf.amount) FILTER (WHERE b.type = 'installment'), 0) AS installment_value
        FROM products_flow pf
        JOIN bills b ON pf.bill_id = b.id AND pf.store_id = b.store_id
        LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
        WHERE pf.store_id = %s AND b.id > 0
          AND b.time >= %s AND b.time < %s
          AND b.type IN ('BNPL', 'installment')
          AND (b.party_id IS NULL OR ap.type != 'store')
        """,
        (store_id, start, end),
    )
    deferred = cur.fetchone() or {}

    cur.execute(
        """
        SELECT
            elem->>'name' AS method,
            COALESCE(SUM((elem->>'amount')::numeric
                * CASE WHEN b.type = 'return' THEN -1 ELSE 1 END), 0) AS total
        FROM bills b
        LEFT JOIN assosiated_parties ap ON b.party_id = ap.id
        CROSS JOIN LATERAL jsonb_array_elements(b.payments) elem
        WHERE b.store_id = %s AND b.time >= %s AND b.time < %s
          AND b.type IN ('sell', 'return') AND b.payments IS NOT NULL
          AND jsonb_typeof(b.payments) = 'array'
          AND (b.party_id IS NULL OR ap.type != 'store')
        GROUP BY elem->>'name'
        ORDER BY total DESC
        """,
        (store_id, start, end),
    )
    methods = [
        {"method": r["method"] or "غير معروف", "total": _f(r["total"])}
        for r in cur.fetchall()
        if abs(_f(r["total"])) >= 0.005
    ]

    cur.execute(
        """
        SELECT
            COALESCE(SUM(cf.amount) FILTER (WHERE cf.amount > 0), 0) AS cash_in,
            COALESCE(-SUM(cf.amount) FILTER (WHERE cf.amount < 0), 0) AS cash_out,
            COALESCE(-SUM(cf.amount) FILTER (
                WHERE cf.amount < 0 AND cf.bill_id IS NULL
                  AND (cf.party_id IS NULL OR ap.type NOT IN ('store', 'owner'))
            ), 0) AS expenses
        FROM cash_flow cf
        LEFT JOIN assosiated_parties ap ON cf.party_id = ap.id
        WHERE cf.store_id = %s AND cf.time >= %s AND cf.time < %s
        """,
        (store_id, start, end),
    )
    cash = cur.fetchone() or {}

    from profit_fifo import compute_fifo_profit

    try:
        per_product = compute_fifo_profit(cur, store_id, start, end)
        profit = sum(_f(p["total_profit"]) for p in per_product.values())
    except Exception as e:
        logger.warning(f"FIFO profit failed for Telegram report: {e}")
        profit = None

    sell_total = _f(s.get("sell_total"))
    return_total = _f(s.get("return_total"))  # stored negative
    return {
        "sell_total": sell_total,
        "sell_count": int(s.get("sell_count") or 0),
        "return_total": abs(return_total),
        "return_count": int(s.get("return_count") or 0),
        "net_sales": sell_total + return_total,
        "discount_total": _f(s.get("discount_total")),
        "internal_sell_total": _f(s.get("internal_sell_total")),
        "internal_sell_count": int(s.get("internal_sell_count") or 0),
        "purchases": _f(s.get("purchases")),
        "bnpl_count": int(s.get("bnpl_count") or 0),
        "bnpl_value": _f(deferred.get("bnpl_value")),
        "installment_count": int(s.get("installment_count") or 0),
        "installment_value": _f(deferred.get("installment_value")),
        "reserve_count": int(s.get("reserve_count") or 0),
        "methods": methods,
        "cash_in": _f(cash.get("cash_in")),
        "cash_out": _f(cash.get("cash_out")),
        "expenses": _f(cash.get("expenses")),
        "profit": profit,
    }


def _summary_lines(s: Dict[str, Any]) -> List[str]:
    lines = [
        f"💵 المبيعات: <b>{fmt_money(s['sell_total'])}</b> ({s['sell_count']} فاتورة)",
    ]
    if s["return_count"]:
        lines.append(f"🔄 المرتجعات: {fmt_money(s['return_total'])} ({s['return_count']})")
    lines.append(f"📈 <b>صافي المبيعات: {fmt_money(s['net_sales'])}</b>")
    if s["sell_count"] + s["return_count"] > 0:
        avg = s["net_sales"] / max(1, s["sell_count"])
        lines.append(f"🧾 متوسط الفاتورة: {fmt_money(avg)}")
    if s["discount_total"]:
        lines.append(f"🏷️ الخصومات: {fmt_money(s['discount_total'])}")
    if s["profit"] is not None:
        lines.append(f"💹 ربح المبيعات (FIFO): <b>{fmt_money(s['profit'])}</b>")
    if s["bnpl_count"]:
        lines.append(f"⏳ آجل: {s['bnpl_count']} فاتورة بقيمة {fmt_money(s['bnpl_value'])}")
    if s["installment_count"]:
        lines.append(
            f"📅 تقسيط: {s['installment_count']} فاتورة بقيمة {fmt_money(s['installment_value'])}"
        )
    if s["internal_sell_count"]:
        lines.append(
            f"🏬 بيع لمتاجر أخرى: {fmt_money(s['internal_sell_total'])} ({s['internal_sell_count']})"
        )
    if s["purchases"]:
        lines.append(f"🚚 المشتريات: {fmt_money(s['purchases'])}")
    if s["methods"]:
        lines.append("")
        lines.append("💳 <b>طرق الدفع (بيع - مرتجع)</b>")
        for m in s["methods"]:
            lines.append(f"• {esc(m['method'])}: {fmt_money(m['total'])}")
    lines += [
        "",
        "💰 <b>حركة النقد</b>",
        f"⬆️ داخل: {fmt_money(s['cash_in'])} • ⬇️ خارج: {fmt_money(s['cash_out'])}",
        f"الصافي: <b>{fmt_signed_money(s['cash_in'] - s['cash_out'])}</b>",
    ]
    if s["expenses"]:
        lines.append(f"🧾 منها مصروفات: {fmt_money(s['expenses'])}")
    return lines


# ─── Handlers ───────────────────────────────────────────────────────────────

MAIN_KEYBOARD = {
    "keyboard": [
        [{"text": "📊 مبيعات اليوم"}, {"text": "🕒 الشيفت"}],
        [{"text": "🏦 الحسابات"}, {"text": "💵 الخزنة"}],
        [{"text": "📉 النواقص"}, {"text": "🏆 الأكثر مبيعاً"}],
        [{"text": "📅 الأقساط"}, {"text": "🧾 آخر الفواتير"}],
        [{"text": "👥 الحضور"}, {"text": "💾 نسخة احتياطية"}],
        [{"text": "❓ مساعدة"}],
    ],
    "resize_keyboard": True,
    "is_persistent": True,
}


def _help_text() -> str:
    return "\n".join(
        [
            "🤖 <b>بوت المتجر — الأوامر</b>",
            "اكتب بالعربي أو الإنجليزي، بشرطة / أو بدونها، أو استخدم الأزرار.",
            "",
            "📊 <b>التقارير</b>",
            "• مبيعات اليوم — /today  <i>(أو: امس، الاسبوع، الشهر)</i>",
            "• ملخص الشيفت — /shift",
            "• الخزنة وآخر الحركات — /cash",
            "• أرصدة الحسابات — /accounts",
            "• الأكثر مبيعاً — /top  <i>(مثال: الاكثر مبيعا الاسبوع)</i>",
            "",
            "📦 <b>المخزون</b>",
            "• النواقص — /low  <i>(مثال: نواقص 3)</i>",
            "• قيمة المخزون — /stock",
            "",
            "🧾 <b>الفواتير والعملاء</b>",
            "• آخر الفواتير — /bills  <i>(مثال: اخر 10 فواتير)</i>",
            "• فاتورة برقمها — /bill 125  أو  #125",
            "• بحث عن عميل/مورد — /search احمد",
            "• الأقساط المستحقة — /installments",
            "",
            "👥 الحضور اليوم — /attendance",
            "💵 حركة نقدية (بتأكيد) — <i>صرف 150 كهرباء</i> أو <i>داخل 500 طرف 12 حساب فودافون</i>",
            "💾 النسخ الاحتياطي — /backup",
            "🏪 المتاجر — /stores  •  معرف المحادثة — /id",
            "",
            "لأكثر من متجر أضف رقم المتجر: <i>مبيعات اليوم متجر 2</i>",
            "أو اكتب <i>متجر 2</i> لجعله المتجر الافتراضي لهذه المحادثة.",
        ]
    )


def h_help(ctx: Ctx) -> List[Reply]:
    if not ctx.linked:
        return [
            Reply(
                "👋 أهلاً! هذا بوت برنامج المتجر.\n\n" + _not_linked_text(ctx.chat_id),
            )
        ]
    return [Reply(_help_text(), MAIN_KEYBOARD)]


def h_chat_id(ctx: Ctx) -> List[Reply]:
    linked = "، ".join(esc(s["name"]) for s in ctx.linked) or "لا يوجد"
    return [
        Reply(
            f"🆔 معرف هذه المحادثة: <code>{esc(ctx.chat_id)}</code>\n"
            f"🏪 المتاجر المرتبطة: {linked}"
        )
    ]


def h_stores(ctx: Ctx) -> List[Reply]:
    if not ctx.linked:
        return [Reply(_not_linked_text(ctx.chat_id))]
    default = _default_store_map().get(str(ctx.chat_id))
    lines = ["🏪 <b>المتاجر المرتبطة بهذه المحادثة</b>"]
    for s in ctx.linked:
        mark = " ⭐ (الافتراضي)" if default == s["id"] or len(ctx.linked) == 1 else ""
        lines.append(f"• متجر {s['id']}: {esc(s['name'])}{mark}")
    if len(ctx.linked) > 1:
        lines.append("\nاكتب <i>متجر رقم</i> لاختيار المتجر الافتراضي.")
    return [Reply("\n".join(lines))]


def _header(icon: str, title: str, ctx: Ctx, sub: str = "") -> List[str]:
    lines = [f"{icon} <b>{title} — {esc(ctx.store_name)}</b>"]
    if sub:
        lines.append(f"🗓️ {sub}")
    if ctx.note:
        lines.insert(0, ctx.note)
    lines.append(SEPARATOR)
    return lines


def h_sales(ctx: Ctx) -> List[Reply]:
    start, end, label = period_bounds(ctx.period)
    with _cursor() as cur:
        s = _period_summary(cur, ctx.store_id, start, end)
    lines = _header("📊", "المبيعات", ctx, esc(label))
    lines += _summary_lines(s)
    return [Reply("\n".join(lines))]


def h_shift(ctx: Ctx) -> List[Reply]:
    if ctx.period:
        return h_sales(ctx)
    with _cursor() as cur:
        w = _shift_window(cur, ctx.store_id)
        s = _period_summary(cur, ctx.store_id, w["start"], w["end"])
        cur.execute(
            """
            SELECT COALESCE(SUM(f.amount), 0) AS total, COUNT(*) AS cnt
            FROM installments_flow f
            JOIN installments i ON i.id = f.installment_id
            WHERE i.store_id = %s AND f.time >= %s AND f.time < %s
            """,
            (ctx.store_id, w["start"], w["end"]),
        )
        inst = cur.fetchone() or {}
    accounts = tu.get_shift_account_breakdown(ctx.store_id, w["start"])

    duration = w["end_display"] - w["start"] if w["start"] else timedelta(0)
    hours = int(duration.total_seconds() // 3600)
    minutes = int((duration.total_seconds() % 3600) // 60)
    lines = _header("🕒", w["label"], ctx)
    lines.append(f"🚀 من {fmt_dt(w['start'])} إلى {fmt_dt(w['end_display'])} ({hours} س {minutes} د)")
    if w["user"]:
        lines.append(f"👤 الكاشير: {esc(w['user'])}")
    lines.append("")
    lines += _summary_lines(s)
    if int(inst.get("cnt") or 0):
        lines.append(f"🏦 أقساط محصلة: {fmt_money(inst.get('total'))} ({int(inst['cnt'])})")
    if accounts:
        lines += ["", "🏦 <b>الحسابات (حركة الشيفت • الرصيد)</b>"]
        for a in accounts:
            lines.append(
                f"• {esc(a['method'])}: {fmt_signed_money(a['shift_total'])} • {fmt_money(a['balance'])}"
            )
    return [Reply("\n".join(lines))]


def h_cash(ctx: Ctx) -> List[Reply]:
    with _cursor() as cur:
        w = _shift_window(cur, ctx.store_id)
        cur.execute(
            """
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS cash_in,
                COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS cash_out
            FROM cash_flow
            WHERE store_id = %s AND time >= %s AND time < %s
            """,
            (ctx.store_id, w["start"], w["end"]),
        )
        mv = cur.fetchone() or {}
        cur.execute(
            """
            SELECT total FROM cash_flow
            WHERE store_id = %s AND time IS NOT NULL
            ORDER BY time DESC, id DESC
            LIMIT 1
            """,
            (ctx.store_id,),
        )
        total_row = cur.fetchone()
        cur.execute(
            """
            SELECT cf.time, cf.amount, cf.description, ap.name AS party_name,
                (SELECT string_agg(DISTINCT pm.name, '، ')
                 FROM account_transactions at
                 JOIN payment_methods pm ON pm.id = at.payment_method_id
                 WHERE at.cash_flow_id = cf.id AND at.store_id = cf.store_id) AS accounts
            FROM cash_flow cf
            LEFT JOIN assosiated_parties ap ON ap.id = cf.party_id
            WHERE cf.store_id = %s AND cf.time IS NOT NULL
            ORDER BY cf.time DESC, cf.id DESC
            LIMIT 8
            """,
            (ctx.store_id,),
        )
        recent = cur.fetchall()

    cash_in, cash_out = _f(mv.get("cash_in")), _f(mv.get("cash_out"))
    lines = _header("💵", "الخزنة", ctx, esc(w["label"]))
    lines += [
        f"⬆️ داخل: {fmt_money(cash_in)}",
        f"⬇️ خارج: {fmt_money(cash_out)}",
        f"الصافي: <b>{fmt_signed_money(cash_in - cash_out)}</b>",
    ]
    if total_row is not None:
        lines.append(f"🏦 إجمالي النقدية بكل الحسابات: <b>{fmt_money(total_row['total'])}</b>")
    if recent:
        lines += ["", "🧾 <b>آخر الحركات</b>"]
        for r in recent:
            amount = _f(r["amount"])
            icon = "⬆️" if amount >= 0 else "⬇️"
            extra = []
            if r.get("party_name"):
                extra.append(esc(r["party_name"]))
            if r.get("accounts"):
                extra.append(esc(r["accounts"]))
            extra_text = f" ({' • '.join(extra)})" if extra else ""
            lines.append(
                f"{icon} {fmt_money(abs(amount))} — {esc(r.get('description') or '-')}{extra_text}"
                f"\n    <i>{fmt_dt(r['time'])}</i>"
            )
    return [Reply("\n".join(lines))]


def h_accounts(ctx: Ctx) -> List[Reply]:
    with _cursor() as cur:
        cur.execute(
            """
            SELECT pm.id, pm.name, pm.is_default, pm.is_deleted,
                COALESCE((SELECT SUM(at.amount) FROM account_transactions at
                          WHERE at.payment_method_id = pm.id AND at.store_id = %s), 0) AS balance
            FROM payment_methods pm
            WHERE pm.is_deleted = FALSE
               OR EXISTS (SELECT 1 FROM account_transactions at
                          WHERE at.payment_method_id = pm.id AND at.store_id = %s)
            ORDER BY pm.is_default DESC, pm.id ASC
            """,
            (ctx.store_id, ctx.store_id),
        )
        accounts = cur.fetchall()
        cur.execute(
            """
            SELECT sd.id, sd.name, COALESCE(SUM(cf.amount), 0) AS balance
            FROM store_data sd
            JOIN assosiated_parties ap ON ap.extra_info->>'store_id' = sd.id::text
            LEFT JOIN cash_flow cf
                ON cf.store_id = %s AND cf.party_id = ap.id AND cf.bill_id IS NULL
            WHERE sd.id <> %s
            GROUP BY sd.id, sd.name
            ORDER BY sd.id
            """,
            (ctx.store_id, ctx.store_id),
        )
        inter = [r for r in cur.fetchall() if abs(_f(r["balance"])) >= 0.005]

    total = sum(_f(a["balance"]) for a in accounts)
    lines = _header("🏦", "الحسابات", ctx)
    for a in accounts:
        tag = " ⭐" if a["is_default"] else (" (محذوف)" if a["is_deleted"] else "")
        lines.append(f"• {esc(a['name'])}{tag}: <b>{fmt_money(a['balance'])}</b>")
    lines.append(SEPARATOR)
    lines.append(f"💰 الإجمالي: <b>{fmt_money(total)}</b>")
    if inter:
        lines += ["", "🔁 <b>الأرصدة بين المتاجر</b>"]
        for r in inter:
            bal = _f(r["balance"])
            who = "نحن مدينون لـ" if bal > 0 else "مدين لنا:"
            lines.append(f"• {who} {esc(r['name'])}: {fmt_money(abs(bal))}")
    return [Reply("\n".join(lines))]


def h_low(ctx: Ctx) -> List[Reply]:
    threshold = int(ctx.numbers[0]) if ctx.numbers else 10
    threshold = max(0, min(threshold, 100000))
    with _cursor() as cur:
        cur.execute(
            """
            SELECT p.name, pi.stock, COUNT(*) OVER () AS total_count
            FROM product_inventory pi
            JOIN products p ON p.id = pi.product_id
            WHERE pi.store_id = %s AND pi.is_deleted = FALSE AND pi.stock <= %s
            ORDER BY pi.stock ASC, p.name ASC
            LIMIT 40
            """,
            (ctx.store_id, threshold),
        )
        rows = cur.fetchall()
    if not rows:
        return [Reply(f"✅ لا توجد منتجات مخزونها {threshold} أو أقل في {esc(ctx.store_name)}.")]
    total = int(rows[0]["total_count"])
    lines = _header("📉", "النواقص", ctx, f"المخزون ≤ {threshold} • {total} منتج")
    for r in rows:
        stock = _f(r["stock"])
        icon = "🔴" if stock <= 0 else "🟠"
        lines.append(f"{icon} {esc(r['name'])}: <b>{fmt_qty(stock)}</b>")
    if total > len(rows):
        lines.append(f"… و{total - len(rows)} منتج آخر. استخدم حدًا أصغر، مثال: نواقص 0")
    return [Reply("\n".join(lines))]


def h_inventory(ctx: Ctx) -> List[Reply]:
    s = tu.get_daily_inventory_summary(ctx.store_id)
    lines = _header("📦", "قيمة المخزون", ctx)
    lines += [
        f"🏷️ بسعر الشراء: <b>{fmt_money(s['wholesale_value'])}</b>",
        f"💰 بسعر البيع: <b>{fmt_money(s['retail_value'])}</b>",
        f"📈 الربح المتوقع: {fmt_money(s['retail_value'] - s['wholesale_value'])}",
        f"📦 الأصناف: {fmt_qty(s['total_products'])} (موجب {fmt_qty(s['positive_stock_products'])} • "
        f"صفر/سالب {fmt_qty(s['non_positive_stock_products'])})",
    ]
    return [Reply("\n".join(lines))]


def _payments_text(payments: Any) -> str:
    if isinstance(payments, str):
        try:
            payments = json.loads(payments)
        except ValueError:
            return ""
    if not isinstance(payments, list) or not payments:
        return ""
    parts = [
        f"{esc(p.get('name') or 'غير معروف')} {fmt_money(p.get('amount'))}"
        for p in payments
        if isinstance(p, dict) and abs(_f(p.get("amount"))) >= 0.005
    ]
    return " + ".join(parts)


def h_bills(ctx: Ctx) -> List[Reply]:
    count = int(ctx.numbers[0]) if ctx.numbers else 5
    count = max(1, min(count, 25))
    with _cursor() as cur:
        cur.execute(
            """
            SELECT b.id, b.time, b.type, b.total, b.discount, b.payments,
                   COALESCE(ap.name, '') AS party_name,
                   (SELECT -SUM(pf.price * pf.amount) FROM products_flow pf
                    WHERE pf.bill_id = b.id AND pf.store_id = b.store_id) AS lines_total
            FROM bills b
            LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
            WHERE b.store_id = %s AND b.id > 0 AND b.time IS NOT NULL
            ORDER BY b.time DESC, b.id DESC
            LIMIT %s
            """,
            (ctx.store_id, count),
        )
        bills = cur.fetchall()
    if not bills:
        return [Reply(f"لا توجد فواتير في {esc(ctx.store_name)}.")]
    lines = _header("🧾", f"آخر {len(bills)} فواتير", ctx)
    for b in bills:
        btype = BILL_TYPE_AR.get(b["type"], b["type"] or "-")
        total = _f(b["total"])
        if b["type"] in ("BNPL", "installment", "reserve") and abs(total) < 0.005:
            amount = f"قيمة الأصناف {fmt_money(abs(_f(b['lines_total'])))}"
        else:
            amount = fmt_money(abs(total))
        lines.append(f"<b>#{b['id']}</b> • {esc(btype)} • <b>{amount}</b>")
        details = [fmt_dt(b["time"])]
        if b["party_name"]:
            details.append(f"👤 {esc(b['party_name'])}")
        if _f(b["discount"]):
            details.append(f"خصم {fmt_money(b['discount'])}")
        pay = _payments_text(b["payments"])
        if pay:
            details.append(f"💳 {pay}")
        lines.append("    " + " • ".join(details))
    lines.append("\nللتفاصيل: <i>فاتورة رقم</i> مثال: /bill " + str(bills[0]["id"]))
    return [Reply("\n".join(lines))]


def h_bill(ctx: Ctx) -> List[Reply]:
    if not ctx.numbers:
        return [Reply("اكتب رقم الفاتورة. مثال: <code>فاتورة 125</code> أو <code>#125</code>")]
    bill_id = int(ctx.numbers[0])
    with _cursor() as cur:
        cur.execute(
            """
            SELECT b.id, b.store_id, b.time, b.type, b.total, b.discount, b.note,
                   b.payments, ap.name AS party_name, ap.phone AS party_phone
            FROM bills b
            LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
            WHERE b.id = %s AND b.store_id = %s
            """,
            (bill_id, ctx.store_id),
        )
        bill = cur.fetchone()
        if not bill or bill_id <= 0:
            others = [s for s in ctx.linked if s["id"] != ctx.store_id]
            found_in = []
            for s in others:
                cur.execute(
                    "SELECT 1 FROM bills WHERE id = %s AND store_id = %s",
                    (bill_id, s["id"]),
                )
                if cur.fetchone():
                    found_in.append(s)
            hint = ""
            if found_in:
                hint = "\nموجودة في: " + "، ".join(
                    f"{esc(s['name'])} (اكتب: فاتورة {bill_id} متجر {s['id']})" for s in found_in
                )
            return [Reply(f"❓ لا توجد فاتورة رقم {bill_id} في {esc(ctx.store_name)}.{hint}")]

        cur.execute(
            """
            SELECT p.name, pf.amount, pf.price, pf.package_units, pf.package_name
            FROM products_flow pf
            JOIN products p ON p.id = pf.product_id
            WHERE pf.bill_id = %s AND pf.store_id = %s
            ORDER BY pf.id
            """,
            (bill_id, ctx.store_id),
        )
        items = cur.fetchall()
        cur.execute(
            "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM bill_corrections WHERE store_id = %s AND bill_id = %s",
            (ctx.store_id, bill_id),
        )
        corrections = cur.fetchone() or {}
        cur.execute(
            """
            SELECT CASE WHEN left_bill_id = %s AND left_store_id = %s
                        THEN right_store_id ELSE left_store_id END AS other_store,
                   CASE WHEN left_bill_id = %s AND left_store_id = %s
                        THEN right_bill_id ELSE left_bill_id END AS other_bill
            FROM bills_pairs
            WHERE (left_bill_id = %s AND left_store_id = %s)
               OR (right_bill_id = %s AND right_store_id = %s)
            LIMIT 1
            """,
            (bill_id, ctx.store_id) * 4,
        )
        pair = cur.fetchone()
        pair_store_name = None
        if pair:
            cur.execute("SELECT name FROM store_data WHERE id = %s", (pair["other_store"],))
            r = cur.fetchone()
            pair_store_name = r["name"] if r else f"متجر {pair['other_store']}"

    btype = BILL_TYPE_AR.get(bill["type"], bill["type"] or "-")
    lines = _header("🧾", f"فاتورة #{bill_id}", ctx)
    lines.append(f"📝 النوع: {esc(btype)}")
    lines.append(f"📅 التاريخ: {fmt_dt(bill['time'])}")
    if bill["party_name"]:
        phone = f" — {esc(bill['party_phone'])}" if bill.get("party_phone") else ""
        lines.append(f"👤 الطرف: {esc(bill['party_name'])}{phone}")
    lines.append("")
    lines_total = 0.0
    for i, it in enumerate(items, 1):
        qty = abs(_f(it["amount"]))
        price = _f(it["price"])
        lines_total += qty * price
        units = int(it["package_units"] or 0)
        if units > 1 and qty % units == 0:
            # Stored per unit; show packages × package price (same total).
            qty_text = f"{fmt_qty(qty / units)} {esc(it['package_name'] or 'عبوة')} ({units})"
            shown_price = price * units
        else:
            qty_text = fmt_qty(qty)
            shown_price = price
        lines.append(
            f"{i}. {esc(it['name'])}\n    {qty_text} × {fmt_money(shown_price)} = {fmt_money(qty * price)}"
        )
    if not items:
        lines.append("(لا توجد أصناف)")
    lines.append(SEPARATOR)
    lines.append(f"قيمة الأصناف: {fmt_money(lines_total)}")
    if _f(bill["discount"]):
        lines.append(f"🏷️ الخصم: {fmt_money(bill['discount'])}")
    lines.append(f"💰 <b>الإجمالي: {fmt_money(abs(_f(bill['total'])))}</b>")
    pay = _payments_text(bill["payments"])
    if pay:
        lines.append(f"💳 الدفع: {pay}")
    if bill.get("note"):
        lines.append(f"🗒️ ملاحظة: {esc(bill['note'])}")
    if pair:
        lines.append(
            f"🔗 مرتبطة بفاتورة #{pair['other_bill']} في {esc(pair_store_name)}"
        )
    n = int(corrections.get("n") or 0)
    if n:
        lines.append(f"✏️ تم تصحيحها {n} مرة (آخرها {fmt_dt(corrections.get('last'))})")
    return [Reply("\n".join(lines))]


def h_top(ctx: Ctx) -> List[Reply]:
    from profit_fifo import compute_fifo_profit

    period = ctx.period or "month"
    start, end, label = period_bounds(period)
    with _cursor() as cur:
        per_product = compute_fifo_profit(cur, ctx.store_id, start, end)
        ranked = sorted(
            per_product.values(), key=lambda p: _f(p["total_sales_value"]), reverse=True
        )[:10]
        names: Dict[int, str] = {}
        if ranked:
            cur.execute(
                "SELECT id, name FROM products WHERE id IN %s",
                (tuple(p["product_id"] for p in ranked),),
            )
            names = {int(r["id"]): r["name"] for r in cur.fetchall()}
    lines = _header("🏆", "الأكثر مبيعاً", ctx, esc(label))
    ranked = [p for p in ranked if _f(p["total_units_sold"]) > 0]
    if not ranked:
        lines.append("لا توجد مبيعات في هذه الفترة.")
        return [Reply("\n".join(lines))]
    for i, p in enumerate(ranked, 1):
        lines.append(
            f"{i}. <b>{esc(names.get(p['product_id'], p['product_id']))}</b>\n"
            f"    {fmt_qty(p['total_units_sold'])} قطعة • {fmt_money(p['total_sales_value'])} • "
            f"ربح {fmt_money(p['total_profit'])}"
        )
    lines.append("\n<i>غيّر الفترة: الاكثر مبيعا اليوم / الاسبوع / الشهر الماضي</i>")
    return [Reply("\n".join(lines))]


def h_installments(ctx: Ctx) -> List[Reply]:
    due = tu.check_due_installments(ctx.store_id)
    if not due:
        return [Reply(f"✅ لا توجد أقساط مستحقة أو متأخرة في {esc(ctx.store_name)}.")]
    total_remaining = sum(_f(i["total"]) - _f(i["total_paid"]) for i in due)
    lines = _header(
        "📅", "الأقساط المستحقة", ctx, f"{len(due)} قسط • المتبقي {fmt_money(total_remaining)}"
    )
    for inst in due[:30]:
        days = tu.installment_days_overdue(inst)
        status = f"🔴 متأخر {days} يوم" if days > 0 else "🟡 مستحق اليوم"
        remaining = _f(inst["total"]) - _f(inst["total_paid"])
        phone = f" — {esc(inst['party_phone'])}" if inst.get("party_phone") else ""
        lines.append(
            f"• <b>{esc(inst['party_name'])}</b>{phone}\n"
            f"    {status} • متبقي <b>{fmt_money(remaining)}</b> من {fmt_money(inst['total'])} "
            f"• فاتورة #{inst['bill_id']}"
        )
    if len(due) > 30:
        lines.append(f"… و{len(due) - 30} قسط آخر")
    return [Reply("\n".join(lines))]


def h_search(ctx: Ctx) -> List[Reply]:
    query = ctx.rest_raw.strip() or ctx.rest.strip()
    if not query:
        return [Reply("اكتب الاسم أو الهاتف بعد الأمر. مثال: <code>بحث احمد</code>")]
    like = f"%{query}%"
    with _cursor() as cur:
        cur.execute(
            """
            SELECT id, name, phone, bar_code, type
            FROM assosiated_parties
            WHERE translate(lower(COALESCE(name, '')), 'أإآىة', 'ااايه')
                    LIKE translate(lower(%s), 'أإآىة', 'ااايه')
               OR COALESCE(phone, '') LIKE %s
               OR COALESCE(bar_code, '') = %s
            ORDER BY
                CASE WHEN lower(COALESCE(name, '')) = lower(%s) OR phone = %s THEN 0 ELSE 1 END,
                name ASC, id ASC
            LIMIT 15
            """,
            (like, like, query, query, query),
        )
        rows = cur.fetchall()
    if not rows:
        return [Reply(f"لا توجد نتائج لـ «{esc(query)}».")]
    lines = [f"👥 <b>نتائج البحث ({len(rows)})</b>", SEPARATOR]
    for r in rows:
        kind = PARTY_TYPE_AR.get(r["type"] or "", r["type"] or "")
        parts = [f"ID {r['id']}"]
        if r.get("phone"):
            parts.append(f"📞 {esc(r['phone'])}")
        if r.get("bar_code"):
            parts.append(f"باركود {esc(r['bar_code'])}")
        lines.append(f"• <b>{esc(r['name'] or '-')}</b> {('— ' + esc(kind)) if kind else ''}")
        lines.append("    " + " • ".join(parts))
    return [Reply("\n".join(lines))]


def h_attendance(ctx: Ctx) -> List[Reply]:
    today = tu.local_now().date()
    js_weekday = (today.weekday() + 1) % 7
    with _cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.name, e.off_days, e.track_attendance,
                   a.status, a.check_in, a.check_out
            FROM employee e
            LEFT JOIN employee_attendance a ON a.employee_id = e.id AND a.day = %s
            WHERE e.store_id = %s
              AND (e.started_on IS NULL OR e.started_on::date <= %s)
              AND (e.stopped_on IS NULL OR e.stopped_on::date > %s)
            ORDER BY e.name
            """,
            (today, ctx.store_id, today, today),
        )
        employees = cur.fetchall()
        month_start = today.replace(day=1)
        cur.execute(
            """
            SELECT COALESCE(SUM(s.amount + COALESCE(s.bonus, 0) - COALESCE(s.deductions, 0)), 0) AS paid,
                   COUNT(*) AS cnt
            FROM salaries s
            JOIN employee e ON e.id = s.employee_id
            WHERE e.store_id = %s AND s.time >= %s
            """,
            (ctx.store_id, month_start),
        )
        sal = cur.fetchone() or {}
    if not employees:
        return [Reply(f"لا يوجد موظفون نشطون في {esc(ctx.store_name)}.")]
    counts: Dict[str, int] = {}
    lines = _header("👥", "الحضور", ctx, today.strftime("%Y-%m-%d"))
    for e in employees:
        if e["status"]:
            label = ATTENDANCE_AR.get(e["status"], e["status"])
        elif js_weekday in [int(x) for x in (e["off_days"] or [])]:
            label = "🛌 إجازة أسبوعية"
        elif e["track_attendance"] is False:
            label = "— بدون متابعة"
        else:
            label = "⚪ غير مسجل"
        counts[label] = counts.get(label, 0) + 1
        times = []
        if e["check_in"]:
            times.append(f"دخول {e['check_in'].strftime('%H:%M')}")
        if e["check_out"]:
            times.append(f"خروج {e['check_out'].strftime('%H:%M')}")
        lines.append(f"• {esc(e['name'])}: {label}" + (f" ({'، '.join(times)})" if times else ""))
    lines.append(SEPARATOR)
    lines.append(" • ".join(f"{k}: {v}" for k, v in counts.items()))
    if int(sal.get("cnt") or 0):
        lines.append(f"💸 رواتب مدفوعة هذا الشهر: {fmt_money(sal.get('paid'))} ({int(sal['cnt'])} دفعة)")
    return [Reply("\n".join(lines))]


def h_backup(ctx: Ctx) -> List[Reply]:
    import backup_scheduler as bs

    wants_now = any(w in ctx.text.split() for w in ("الان", "now", "جديد", "دلوقتي", "حالا"))
    if wants_now:
        return h_backup_now(ctx)
    ov = bs.get_overview()
    st = ov["status"] or {}
    s = ov["settings"]
    lines = ["💾 <b>النسخ الاحتياطي</b>", SEPARATOR]
    lines.append(
        "⚙️ التلقائي: "
        + (f"مفعّل يوميًا {esc(s['time'])}" if s["enabled"] else "متوقف")
        + (" + بعد إغلاق الشيفت" if s["enabled"] and s["after_shift_close"] else "")
    )
    if ov["running"].get("running"):
        lines.append("⏳ يوجد نسخ قيد التشغيل الآن…")
    if st.get("last_success_at"):
        lines.append(
            f"✅ آخر نسخة ناجحة: {fmt_dt(st['last_success_at'])} • {fmt_size(st.get('last_size'))}"
        )
    if st.get("last_result") == "failed":
        lines.append(f"❌ آخر محاولة فشلت ({fmt_dt(st.get('last_failure_at'))}): {esc(st.get('last_error'))}")
    if ov.get("next_run_at") and s["enabled"]:
        lines.append(f"🕒 القادمة: {fmt_dt(ov['next_run_at'])}")
    lines.append(f"📁 المجلد: <code>{esc(ov['dir'])}</code>")
    lines.append(f"🗂️ عدد النسخ المحفوظة: {len(ov['backups'])}")
    if ov.get("persistence_warning"):
        lines.append(f"⚠️ {esc(ov['persistence_warning'])}")
    if not ov["pg_dump_found"]:
        lines.append("⚠️ لم يتم العثور على pg_dump على السيرفر")
    markup = {"inline_keyboard": [[{"text": "💾 نسخ الآن", "callback_data": "bk|now"}]]}
    return [Reply("\n".join(lines), markup)]


def h_backup_now(ctx: Ctx) -> List[Reply]:
    import backup_scheduler as bs

    if not bs.find_pg_dump():
        return [Reply("⚠️ لم يتم العثور على pg_dump على السيرفر، لا يمكن إنشاء نسخة.")]
    if not bs.start_backup_in_background("manual", notify_chat_ids=[str(ctx.chat_id)]):
        return [Reply("⏳ يوجد نسخ احتياطي قيد التشغيل بالفعل، ستصلك النتيجة عند انتهائه.")]
    return [Reply("⏳ جاري إنشاء نسخة احتياطية… سيصلك الملف هنا عند الانتهاء.")]


# ── Cash movement (with confirmation) ──

IN_WORDS = {"داخل", "دخل", "وارد", "ايداع", "ايراد", "قبض", "in", "income", "deposit"}
OUT_WORDS = {"خارج", "خرج", "صادر", "صرف", "مصروف", "مصاريف", "مصروفات", "سحب", "دفع", "out", "expense", "withdraw"}
FILLER_WORDS = {"اضف", "اضافه", "سجل", "add", "حركه", "نقديه", "نقدي", "كاش", "فلو", "cash", "flow", "مبلغ", "بمبلغ", "جنيه", "ج", "egp"}
PARTY_MARKS = {"طرف", "للطرف", "party", "عميل", "مورد", "للعميل", "للمورد"}
ACCOUNT_MARKS = {"حساب", "بحساب", "الحساب", "account", "عبر", "طريقه"}
DESC_MARKS = {"وصف", "الوصف", "desc", "description", "بيان", "ملاحظه", "note", "سبب"}


def _resolve_party(cur, ident: str) -> Tuple[Optional[Dict[str, Any]], str]:
    ident = ident.strip()
    if not ident:
        return None, ""
    norm = normalize(ident)
    if _is_number(norm):
        cur.execute(
            "SELECT id, name, phone, bar_code, type, extra_info FROM assosiated_parties WHERE id = %s",
            (int(float(norm)),),
        )
        row = cur.fetchone()
        if row:
            return row, ""
    cur.execute(
        """
        SELECT id, name, phone, bar_code, type, extra_info FROM assosiated_parties
        WHERE COALESCE(phone, '') = %s OR COALESCE(bar_code, '') = %s OR lower(bar_code) = lower(%s)
        LIMIT 1
        """,
        (norm, ident, ident),
    )
    row = cur.fetchone()
    if row:
        return row, ""
    cur.execute(
        """
        SELECT id, name, phone, bar_code, type, extra_info FROM assosiated_parties
        WHERE translate(lower(COALESCE(name, '')), 'أإآىة', 'ااايه')
              LIKE translate(lower(%s), 'أإآىة', 'ااايه')
        ORDER BY CASE WHEN translate(lower(name), 'أإآىة', 'ااايه')
                           = translate(lower(%s), 'أإآىة', 'ااايه') THEN 0 ELSE 1 END, id
        LIMIT 5
        """,
        (f"%{ident}%", ident),
    )
    rows = cur.fetchall()
    if len(rows) == 1 or (rows and normalize(rows[0]["name"] or "") == norm):
        return rows[0], ""
    if rows:
        options = "، ".join(f"{esc(r['name'])} (ID {r['id']})" for r in rows)
        return None, f"يوجد أكثر من طرف مطابق: {options}. استخدم رقم الـ ID."
    return None, f"لم يتم العثور على طرف «{esc(ident)}». استخدم ID أو الهاتف أو الباركود."


def _resolve_account(cur, name: str) -> Tuple[Optional[Dict[str, Any]], str]:
    cur.execute(
        "SELECT id, name, is_default FROM payment_methods WHERE is_deleted = FALSE ORDER BY is_default DESC, id"
    )
    methods = cur.fetchall()
    if not methods:
        return None, "لا توجد حسابات (طرق دفع) مفعّلة."
    if not name.strip():
        return methods[0], ""
    target = normalize(name)
    best, best_score = None, 0.0
    for m in methods:
        candidate = normalize(m["name"] or "")
        score = 1.0 if candidate == target else difflib.SequenceMatcher(None, candidate, target).ratio()
        if target and (target in candidate or candidate in target):
            score = max(score, 0.85)
        if score > best_score:
            best, best_score = m, score
    if best is not None and best_score >= 0.6:
        return best, ""
    available = "، ".join(esc(m["name"]) for m in methods)
    return None, f"لم يتم العثور على حساب «{esc(name)}». الحسابات المتاحة: {available}"


def _parse_cash_command(raw: str) -> Dict[str, Any]:
    tokens = _strip_command_prefix(raw).split()
    fields: Dict[str, List[str]] = {"party": [], "account": [], "desc": [], "free": []}
    current = "free"
    move_type = None
    amount = None
    skip_next_number = False
    for tok in tokens:
        n = normalize(tok)
        if not n:
            continue
        if skip_next_number:
            skip_next_number = False
            if _is_number(n):
                continue
        if n in ("متجر", "المتجر", "محل", "فرع", "store", "shop"):
            skip_next_number = True
            continue
        if re.match(r"^(?:ال)?(?:متجر|محل|فرع)\d+$", n):
            continue
        if move_type is None and n in IN_WORDS:
            move_type = "in"
            continue
        if move_type is None and n in OUT_WORDS:
            move_type = "out"
            continue
        if n in PARTY_MARKS:
            current = "party"
            continue
        if n in ACCOUNT_MARKS:
            current = "account"
            continue
        if n in DESC_MARKS:
            current = "desc"
            continue
        if current == "free" and n in FILLER_WORDS and not fields["free"]:
            continue
        if current == "party" and fields["party"] and _is_number(normalize(fields["party"][0])):
            current = "free"  # "طرف 15 ايجار" -> the id, then free text
        if amount is None and current in ("free", "desc") and _is_number(n):
            amount = float(n)
            continue
        fields[current].append(tok)
    description = " ".join(fields["desc"] or fields["free"]).strip()
    return {
        "move_type": move_type,
        "amount": amount,
        "party": " ".join(fields["party"]).strip(),
        "account": " ".join(fields["account"]).strip(),
        "description": description,
    }


def h_cash_add(ctx: Ctx) -> List[Reply]:
    p = _parse_cash_command(ctx.raw)
    usage = (
        "الصيغة: <code>داخل 500 طرف 12 حساب فودافون وصف دفعة</code>\n"
        "أو: <code>صرف 150 كهرباء</code>"
    )
    if p["move_type"] is None:
        return [Reply("حدد نوع الحركة: <b>داخل</b> أو <b>خارج/صرف</b>.\n" + usage)]
    if p["amount"] is None or p["amount"] <= 0:
        return [Reply("اكتب مبلغًا أكبر من صفر.\n" + usage)]
    if p["amount"] > 100_000_000:
        return [Reply("المبلغ كبير جدًا، تأكد منه.")]

    with _cursor() as cur:
        party = None
        if p["party"]:
            party, err = _resolve_party(cur, p["party"])
            if not party:
                return [Reply("⚠️ " + err)]
        account, err = _resolve_account(cur, p["account"])
        if not account:
            return [Reply("⚠️ " + err)]

    description = p["description"] or ("إيراد من تليجرام" if p["move_type"] == "in" else "مصروف من تليجرام")
    token = secrets.token_hex(6)
    with _pending_lock:
        now = datetime.now()
        for k in [k for k, v in _pending.items() if v["expires"] < now]:
            _pending.pop(k, None)
        _pending[token] = {
            "chat_id": str(ctx.chat_id),
            "store_id": ctx.store_id,
            "store_name": ctx.store_name,
            "move_type": p["move_type"],
            "amount": float(p["amount"]),
            "party_id": int(party["id"]) if party else None,
            "party_name": party["name"] if party else None,
            "method_id": int(account["id"]),
            "method_name": account["name"],
            "description": description[:300],
            "expires": now + PENDING_TTL,
        }
    lines = [
        "💵 <b>تأكيد إضافة حركة نقدية</b>",
        SEPARATOR,
        f"🏪 المتجر: {esc(ctx.store_name)}",
        f"↕️ النوع: {'⬆️ داخل' if p['move_type'] == 'in' else '⬇️ خارج'}",
        f"💰 المبلغ: <b>{fmt_money(p['amount'])}</b>",
        f"🏦 الحساب: {esc(account['name'])}",
        f"👤 الطرف: {esc(party['name']) + ' (ID ' + str(party['id']) + ')' if party else '—'}",
        f"📝 الوصف: {esc(description)}",
        "",
        "⏳ التأكيد صالح لمدة 10 دقائق.",
    ]
    markup = {
        "inline_keyboard": [
            [
                {"text": "✅ تأكيد", "callback_data": f"ok|{token}"},
                {"text": "❌ إلغاء", "callback_data": f"no|{token}"},
            ]
        ]
    }
    return [Reply("\n".join(lines), markup)]


def _insert_cash_movement(pending: Dict[str, Any]) -> None:
    """Same rows as POST /cash-flow (incl. the mirror row for a store party)."""
    amount = pending["amount"]
    move_type = pending["move_type"]
    signed = amount if move_type == "in" else -amount
    now_iso = tu.local_now().isoformat()
    with _cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO cash_flow (store_id, time, amount, type, description, party_id, payment_method_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                pending["store_id"],
                now_iso,
                signed,
                move_type,
                pending["description"],
                pending["party_id"],
                pending["method_id"],
            ),
        )
        if pending["party_id"]:
            cur.execute(
                "SELECT (extra_info->>'store_id')::BIGINT AS store_id FROM assosiated_parties WHERE id = %s",
                (pending["party_id"],),
            )
            row = cur.fetchone()
            other_store = row["store_id"] if row else None
            if other_store is not None and int(other_store) != int(pending["store_id"]):
                cur.execute(
                    "SELECT id FROM assosiated_parties WHERE extra_info->>'store_id' = %s LIMIT 1",
                    (str(pending["store_id"]),),
                )
                src = cur.fetchone()
                reverse_type = "out" if move_type == "in" else "in"
                cur.execute(
                    """
                    INSERT INTO cash_flow (store_id, time, amount, type, description, party_id, payment_method_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        int(other_store),
                        now_iso,
                        amount if reverse_type == "in" else -amount,
                        reverse_type,
                        pending["description"],
                        src["id"] if src else None,
                        None,
                    ),
                )


# ─── Registry ───────────────────────────────────────────────────────────────

_register(Command("help", "help", "المساعدة", ["start", "ابدا", "مساعده", "مساعدة", "الاوامر", "اوامر", "القائمه", "قائمه", "menu", "commands", "الاوامر المتاحه"], h_help, needs_store=False, needs_link=False))
_register(Command("chatid", "id", "معرف المحادثة", ["chatid", "chat id", "معرفي", "معرف المحادثه", "رقم المحادثه", "الايدي"], h_chat_id, needs_store=False, needs_link=False))
_register(Command("stores", "stores", "المتاجر المرتبطة", ["المتاجر", "متاجر", "الفروع", "فروع"], h_stores, needs_store=False, needs_link=False))
_register(Command("sales", "today", "مبيعات اليوم", ["sales", "report", "مبيعات", "المبيعات", "مبيعات اليوم", "تقرير", "تقرير اليوم", "يوميه", "اليوميه", "نظره ماليه", "ملخص مالي", "تحليل تفصيلي", "تقرير تفصيلي", "الايراد", "ايراد"], h_sales))
_register(Command("shift", "shift", "ملخص الشيفت", ["الشيفت", "شيفت", "ملخص الشيفت", "ملخص", "الورديه", "ورديه", "ملخص الورديه", "تقفيل"], h_shift))
_register(Command("cash", "cash", "الخزنة وحركة النقد", ["الخزنه", "خزنه", "الخزينه", "النقديه", "الكاش", "كاش", "الدرج", "حركه النقد", "حركه النقد الشيفت", "حركه الخزنه", "النقدي"], h_cash))
_register(Command("accounts", "accounts", "أرصدة الحسابات", ["balance", "balances", "الحسابات", "حسابات", "الارصده", "ارصده", "رصيد", "الرصيد", "طرق الدفع", "المحافظ"], h_accounts))
_register(Command("low", "low", "النواقص", ["lowstock", "low stock", "نواقص", "النواقص", "مخزون منخفض", "ناقص", "الناقص", "قرب يخلص", "خلصان"], h_low))
_register(Command("inventory", "stock", "قيمة المخزون", ["inventory", "المخزون", "مخزون", "قيمه المخزون", "قيمه", "جرد", "الجرد", "البضاعه"], h_inventory))
_register(Command("bills", "bills", "آخر الفواتير", ["last", "فواتير", "الفواتير", "اخر فواتير", "اخر الفواتير", "احدث الفواتير"], h_bills))
_register(Command("bill", "bill", "تفاصيل فاتورة", ["فاتوره", "الفاتوره", "فاتوره رقم", "invoice"], h_bill))
_register(Command("top", "top", "الأكثر مبيعاً", ["best", "الاكثر مبيعا", "اكثر مبيعا", "الاعلي مبيعا", "افضل المنتجات", "افضل منتجات", "افضل الاصناف", "الاكثر بيعا"], h_top))
_register(Command("installments", "installments", "الأقساط المستحقة", ["due", "اقساط", "الاقساط", "اقساط متاخره", "الاقساط المستحقه", "الاقساط المتاخره", "المتاخرات", "تقسيط"], h_installments))
_register(Command("search", "search", "بحث عن طرف", ["find", "party", "بحث", "ابحث", "بحث اطراف", "اطراف", "الاطراف", "عميل", "مورد", "دور علي"], h_search, needs_store=False))
_register(Command("attendance", "attendance", "حضور الموظفين", ["employees", "الحضور", "حضور", "الموظفين", "موظفين", "الغياب", "غياب"], h_attendance))
_register(Command("backup", "backup", "النسخ الاحتياطي", ["نسخه احتياطيه", "نسخ احتياطي", "النسخ الاحتياطي", "النسخه الاحتياطيه", "باك اب", "باكاب", "باك اب الان"], h_backup, needs_store=False))
_register(Command("backupnow", "backupnow", "نسخة احتياطية الآن", ["backup now", "نسخ الان", "نسخه الان", "نسخه احتياطيه الان", "اعمل نسخه"], h_backup_now, needs_store=False))
_register(Command("cashadd", "add", "إضافة حركة نقدية", ["cash in", "cash out", "اضف", "اضافه", "سجل", "اضف حركه", "حركه نقديه", "اضف حركه نقديه", "كاش فلو"] + sorted(IN_WORDS | OUT_WORDS), h_cash_add))
_build_alias_index()

BOT_COMMANDS = [
    ("start", "القائمة الرئيسية"),
    ("today", "مبيعات اليوم"),
    ("shift", "ملخص الشيفت"),
    ("cash", "الخزنة وآخر الحركات"),
    ("accounts", "أرصدة الحسابات"),
    ("low", "النواقص"),
    ("stock", "قيمة المخزون"),
    ("bills", "آخر الفواتير"),
    ("bill", "تفاصيل فاتورة برقمها"),
    ("top", "الأكثر مبيعاً"),
    ("installments", "الأقساط المستحقة"),
    ("search", "بحث عن عميل/مورد"),
    ("attendance", "حضور الموظفين اليوم"),
    ("backup", "النسخ الاحتياطي"),
    ("stores", "المتاجر المرتبطة"),
    ("id", "معرف المحادثة"),
    ("help", "كل الأوامر"),
]


def command_catalog() -> List[Dict[str, str]]:
    """For the Settings page: what the bot understands."""
    examples = {
        "sales": "مبيعات امس",
        "low": "نواقص 3",
        "bills": "اخر 10 فواتير",
        "bill": "#125",
        "top": "الاكثر مبيعا الاسبوع",
        "search": "بحث احمد",
        "cashadd": "صرف 150 كهرباء",
    }
    # Properly spelled forms for display (the registry holds normalized ones).
    display = {
        "help": ["مساعدة", "الأوامر"],
        "chatid": ["معرف المحادثة"],
        "stores": ["المتاجر"],
        "sales": ["مبيعات اليوم", "مبيعات أمس", "مبيعات الشهر"],
        "shift": ["الشيفت", "الوردية"],
        "cash": ["الخزنة", "حركة النقد"],
        "accounts": ["الحسابات", "الأرصدة"],
        "low": ["النواقص", "مخزون منخفض"],
        "inventory": ["المخزون", "قيمة المخزون", "جرد"],
        "bills": ["آخر الفواتير"],
        "bill": ["فاتورة 125"],
        "top": ["الأكثر مبيعاً"],
        "installments": ["الأقساط", "الأقساط المتأخرة"],
        "search": ["بحث", "عميل"],
        "attendance": ["الحضور", "الموظفين"],
        "backup": ["نسخة احتياطية"],
        "backupnow": ["نسخ الآن"],
        "cashadd": ["داخل", "خارج", "صرف", "مصروف"],
    }
    return [
        {
            "key": cmd.key,
            "slash": "/" + cmd.slash,
            "title": cmd.title,
            "aliases": display.get(cmd.key, []),
            "example": examples.get(cmd.key, ""),
        }
        for cmd in COMMANDS
    ]


# ─── Dispatch ───────────────────────────────────────────────────────────────


def _store_choice_markup(key: str, stores: List[Dict[str, Any]], arg: str = "") -> dict:
    rows = []
    for s in stores[:10]:
        rows.append([{"text": f"🏪 {s['name']}", "callback_data": f"run|{key}|{s['id']}|{arg}"[:64]}])
    return {"inline_keyboard": rows}


def _run(cmd: Command, ctx: Ctx) -> List[Reply]:
    if cmd.needs_link and not ctx.linked:
        return [Reply(_not_linked_text(ctx.chat_id))]
    if cmd.needs_store:
        linked_ids = [s["id"] for s in ctx.linked]
        if ctx.store_id is not None:
            if ctx.store_id not in linked_ids:
                return [
                    Reply(
                        f"⛔ غير مصرح لهذه المحادثة باستخدام المتجر {ctx.store_id}.\n"
                        "المتاجر المسموحة: "
                        + ("، ".join(f"{esc(s['name'])} ({s['id']})" for s in ctx.linked) or "لا يوجد")
                    )
                ]
        elif len(ctx.linked) == 1:
            ctx.store_id = ctx.linked[0]["id"]
        else:
            default = _default_store_map().get(str(ctx.chat_id))
            if default in linked_ids:
                ctx.store_id = default
            else:
                arg = str(int(ctx.numbers[0])) if ctx.numbers else ""
                if cmd.key == "cashadd":
                    return [Reply("هذه المحادثة مرتبطة بأكثر من متجر. أعد كتابة الأمر مع رقم المتجر، مثال: <code>صرف 150 كهرباء متجر 1</code>")]
                return [
                    Reply(
                        f"🏪 اختر المتجر لـ «{esc(cmd.title)}»:\n"
                        "<i>(أو اكتب: متجر رقم، لجعله الافتراضي)</i>",
                        _store_choice_markup(cmd.key, ctx.linked, arg),
                    )
                ]
        ctx.store_name = next(
            (s["name"] for s in ctx.linked if s["id"] == ctx.store_id), f"متجر {ctx.store_id}"
        )
    return cmd.handler(ctx)


def handle_text(chat_id: str, text: str) -> List[Reply]:
    """Parse one message and produce the replies (no sending)."""
    chat_id = str(chat_id)
    raw = _strip_command_prefix(text or "")
    norm = normalize(raw)
    linked = _linked_stores(chat_id)

    if not norm:
        return [Reply("اكتب <b>مساعدة</b> لعرض الأوامر.")] if linked else h_help(Ctx(chat_id=chat_id))

    # "#125" -> bill 125
    m = re.match(r"^#\s*(\d+)(.*)$", norm)
    if m:
        norm = f"bill {m.group(1)} {m.group(2)}".strip()

    text_no_store, store_id = _extract_store(norm)
    text_core, period = _extract_period(text_no_store)
    words = text_core.split()
    numbers = [float(w) for w in words if _is_number(w)]
    key_words = [w for w in words if not _is_number(w)]

    ctx = Ctx(
        chat_id=chat_id,
        raw=raw,
        text=text_core,
        text_full=text_no_store,
        numbers=numbers,
        period=period,
        store_id=store_id,
        linked=linked,
    )

    if not key_words:
        if period:
            return _run(_command("sales"), ctx)
        if store_id is not None:
            if store_id not in [s["id"] for s in linked]:
                return [Reply(f"⛔ هذه المحادثة غير مرتبطة بالمتجر {store_id}.")]
            _set_default_store(chat_id, store_id)
            name = next(s["name"] for s in linked if s["id"] == store_id)
            return [Reply(f"✅ تم اختيار <b>{esc(name)}</b> كمتجر افتراضي لهذه المحادثة.", MAIN_KEYBOARD)]
        if numbers:
            return [Reply("أرقام فقط؟ للفاتورة اكتب <code>#رقم</code>، وللحركة النقدية مثل <code>صرف 150 كهرباء</code>.")]

    match = _match_exact(key_words)
    if match:
        key, start, n = match
        cmd = _command(key)
        ctx.rest = " ".join(key_words[start + n :])
        raw_words = raw.split()
        # Drop the command words from the original text (word counts line up
        # closely enough; used only for free-text arguments like a name).
        ctx.rest_raw = " ".join(
            w for w in raw_words[start + n :] if not re.match(r"^(?:متجر|store)$", normalize(w))
        )
        ctx.rest_raw = _extract_store(ctx.rest_raw)[0]
        return _run(cmd, ctx)

    candidates = _fuzzy_candidates(key_words)
    if candidates and candidates[0][0] >= 0.8 and (
        len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= 0.05
    ):
        cmd = _command(candidates[0][1])
        if cmd.key != "cashadd":  # never write money on a guess
            ctx.note = f"🔎 <i>فهمت طلبك: {esc(cmd.title)}</i>"
            ctx.rest = " ".join(key_words[1:])
            ctx.rest_raw = " ".join(raw.split()[1:])
            return _run(cmd, ctx)

    suggestions = [(_command(k)) for s, k in candidates if s >= 0.5][:3]
    if suggestions:
        arg = str(int(numbers[0])) if numbers else ""
        rows = [
            [
                {
                    "text": f"{c.title} (/{c.slash})",
                    "callback_data": f"run|{c.key}|{store_id if store_id is not None else ''}|{arg}"[:64],
                }
            ]
            for c in suggestions
            if c.key != "cashadd"
        ]
        return [
            Reply(
                f"❓ لم أفهم «{esc(raw[:60])}». هل تقصد:",
                {"inline_keyboard": rows} if rows else None,
            )
        ]
    return [Reply(f"❓ لم أفهم «{esc(raw[:60])}».\nاكتب <b>مساعدة</b> أو /help لعرض الأوامر.")]


def handle_callback(chat_id: str, data: str) -> List[Reply]:
    chat_id = str(chat_id)
    parts = (data or "").split("|")
    kind = parts[0]
    linked = _linked_stores(chat_id)

    if kind == "run" and len(parts) >= 2:
        cmd = _command(parts[1])
        if not cmd:
            return [Reply("الأمر غير متاح.")]
        store_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
        numbers = [float(parts[3])] if len(parts) > 3 and _is_number(parts[3]) else []
        ctx = Ctx(chat_id=chat_id, store_id=store_id, numbers=numbers, linked=linked)
        return _run(cmd, ctx)

    if kind == "bk":
        if not linked:
            return [Reply(_not_linked_text(chat_id))]
        return h_backup_now(Ctx(chat_id=chat_id, linked=linked))

    if kind in ("ok", "no") and len(parts) >= 2:
        with _pending_lock:
            pending = _pending.pop(parts[1], None)
        if not pending or pending["chat_id"] != chat_id:
            return [Reply("⌛ انتهت صلاحية هذا الطلب أو تم تنفيذه. أعد كتابة الأمر.")]
        if kind == "no":
            return [Reply("❌ تم الإلغاء، لم تُسجل أي حركة.")]
        if pending["expires"] < datetime.now():
            return [Reply("⌛ انتهت صلاحية التأكيد (10 دقائق). أعد كتابة الأمر.")]
        if pending["store_id"] not in [s["id"] for s in linked]:
            return [Reply("⛔ لم تعد هذه المحادثة مرتبطة بهذا المتجر.")]
        try:
            _insert_cash_movement(pending)
        except Exception as e:
            logger.error(f"Telegram cash movement failed: {e}")
            return [Reply("⚠️ تعذر تسجيل الحركة، لم يتم حفظ أي شيء. حاول مرة أخرى.")]
        return [
            Reply(
                "✅ <b>تم تسجيل الحركة</b>\n"
                f"{'⬆️ داخل' if pending['move_type'] == 'in' else '⬇️ خارج'} "
                f"{fmt_money(pending['amount'])} • {esc(pending['method_name'])}\n"
                f"🏪 {esc(pending['store_name'])} • 📝 {esc(pending['description'])}"
            )
        ]

    return [Reply("الزر غير صالح. اكتب مساعدة.")]


def _safe(fn: Callable[[], List[Reply]]) -> List[Reply]:
    try:
        return fn()
    except Exception as e:
        logger.exception("Telegram command failed: %s", tu._redact(e))
        return [Reply("⚠️ حدث خطأ أثناء تنفيذ الأمر. حاول مرة أخرى أو اكتب مساعدة.")]


def _send_replies(chat_id: str, replies: List[Reply]) -> None:
    for reply in replies:
        result = tu.send_telegram_message(str(chat_id), reply.text, reply_markup=reply.markup)
        if not result.get("success"):
            logger.warning(f"Telegram reply to {chat_id} failed: {result.get('message')}")


def process_update(update: Dict[str, Any]) -> None:
    """Handle one update end to end (parse, run, reply). Never raises."""
    try:
        _remember_chat(tu.chat_info_from_update(update))
        callback = update.get("callback_query")
        if callback:
            message = callback.get("message") or {}
            chat_id = (message.get("chat") or {}).get("id")
            tu.call_telegram_api(
                "answerCallbackQuery", {"callback_query_id": callback.get("id")}, timeout=10, max_retries=0
            )
            if chat_id is None:
                return
            data = callback.get("data") or ""
            replies = _safe(lambda: handle_callback(str(chat_id), data))
            if data.startswith(("ok|", "no|")) and message.get("message_id"):
                tu.call_telegram_api(
                    "editMessageReplyMarkup",
                    {"chat_id": chat_id, "message_id": message["message_id"], "reply_markup": {"inline_keyboard": []}},
                    timeout=10,
                    max_retries=0,
                )
            _send_replies(str(chat_id), replies)
            return

        message = update.get("message") or {}
        text = message.get("text")
        chat_id = (message.get("chat") or {}).get("id")
        if chat_id is None or not text:
            return
        replies = _safe(lambda: handle_text(str(chat_id), str(text)))
        _send_replies(str(chat_id), replies)
    except Exception as e:
        logger.exception("Failed to process Telegram update %s: %s", update.get("update_id"), tu._redact(e))


# ─── Worker ─────────────────────────────────────────────────────────────────


def register_bot_commands() -> bool:
    me = tu.call_telegram_api("getMe", {}, timeout=10, max_retries=0)
    if me.get("success"):
        _worker_health["bot_username"] = (me.get("result") or {}).get("username")
    result = tu.call_telegram_api(
        "setMyCommands",
        {"commands": [{"command": c, "description": d} for c, d in BOT_COMMANDS]},
        timeout=15,
        max_retries=1,
    )
    return bool(result.get("success"))


def _load_offset(bot_id: str) -> int:
    data = tu.meta_get_json("telegram_updates_offset", None)
    if isinstance(data, dict) and str(data.get("bot_id")) == bot_id:
        try:
            return int(data.get("offset") or 0)
        except (TypeError, ValueError):
            return 0
    if data is None:
        # Older versions kept the offset in store_data.extra_info.
        try:
            with _cursor() as cur:
                cur.execute(
                    "SELECT extra_info FROM store_data ORDER BY CASE WHEN id = 0 THEN 0 ELSE 1 END, id LIMIT 1"
                )
                row = cur.fetchone()
            value = ((row or {}).get("extra_info") or {}).get("telegram_updates_offset")
            return int(value or 0)
        except Exception:
            return 0
    return 0


def _save_offset(bot_id: str, offset: int) -> None:
    tu.meta_set_json("telegram_updates_offset", {"bot_id": bot_id, "offset": int(offset)})


def _set_error(state: str, message: str) -> None:
    _worker_health["state"] = state
    _worker_health["last_error"] = message
    _worker_health["last_error_at"] = datetime.now().isoformat(timespec="seconds")


async def telegram_command_worker_loop() -> None:
    _worker_health["running"] = True
    _worker_health["last_error"] = None
    bot_id: Optional[str] = None
    offset = 0
    backoff = 2
    try:
        while True:
            try:
                token = await asyncio.to_thread(tu.current_bot_token)
                if not token:
                    _worker_health["state"] = "no_token"
                    bot_id = None
                    await asyncio.sleep(15)
                    continue

                this_bot = token.split(":", 1)[0]
                if this_bot != bot_id:
                    bot_id = this_bot
                    offset = await asyncio.to_thread(_load_offset, bot_id)
                    _worker_health["commands_registered"] = False
                if not _worker_health["commands_registered"]:
                    _worker_health["commands_registered"] = await asyncio.to_thread(register_bot_commands)

                _worker_health["last_poll_at"] = datetime.now().isoformat(timespec="seconds")
                result = await asyncio.to_thread(
                    tu.call_telegram_api,
                    "getUpdates",
                    {
                        "offset": offset,
                        "timeout": 25,
                        "allowed_updates": ["message", "callback_query", "my_chat_member"],
                    },
                    35,
                    None,
                    0,
                )
                if not result.get("success"):
                    code = result.get("error_code")
                    if code == 409:
                        _set_error(
                            "conflict",
                            "نسخة أخرى من البرنامج تستخدم نفس البوت (تعارض getUpdates). "
                            "استخدم بوتًا مختلفًا لكل سيرفر.",
                        )
                        await asyncio.sleep(30)
                    elif code in (401, 404):
                        _set_error("invalid_token", "رمز البوت غير صالح")
                        await asyncio.sleep(60)
                    elif code == 429:
                        _set_error("rate_limited", "تجاوز حد الطلبات")
                        await asyncio.sleep(min(60, int(result.get("retry_after") or 5)))
                    else:
                        _set_error("error", str(result.get("message") or "خطأ في الاتصال"))
                        await asyncio.sleep(backoff)
                        backoff = min(60, backoff * 2)
                    continue

                backoff = 2
                _worker_health["state"] = "polling"
                updates = result.get("result") or []
                if not updates:
                    continue
                for update in updates:
                    update_id = int(update.get("update_id", 0) or 0)
                    if update_id <= 0:
                        continue
                    await asyncio.to_thread(process_update, update)
                    offset = max(offset, update_id + 1)
                    _worker_health["last_update_id"] = update_id
                await asyncio.to_thread(_save_offset, bot_id, offset)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                _set_error("error", tu._redact(e))
                logger.error(f"Error in Telegram command worker cycle: {tu._redact(e)}")
                await asyncio.sleep(5)
    except asyncio.CancelledError:
        logger.info("Telegram command worker stopped")
        raise
    finally:
        _worker_health["running"] = False
        _worker_health["state"] = "stopped"

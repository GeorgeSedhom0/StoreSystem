"""
Data purge (حذف السجلات القديمة): delete all history before a cutoff while
every balance the app shows stays exactly the same.

Spec: docs/specs/v28-data-purge.md. In short:

- A bill *unit* (bill + its edit twin -<id> + its transfer partner) is deleted
  as a whole when its positive bills are before the cutoff, all its cash /
  installment-payment rows are before the cutoff, and nothing in it is still
  open (BNPL, unpaid installment, live reservation).
- What was deleted is replaced by opening rows at OPENING_TIME (1970-01-01):
  cash per (store, party, bill-linked or not), ledger per (store, account), and
  FIFO cost layers per (store, product). Same sums, outside every dated report.
- The delete / insert total triggers and the stock trigger are skipped with a
  transaction-local flag (update_db_28.py); the purge shifts the few running
  totals that need it itself, so old drift is kept, never "fixed".
- Six checks run before commit; any difference rolls everything back.

Preview runs the same code and rolls back (REPEATABLE READ, no store locks, so
sales keep working). Apply takes the store locks.

Weekly schedule: settings/status in db_meta, a loop like the backup scheduler.
A due slot (the cutoff) is announced for PENDING_SECONDS before it runs and can
be cancelled. Missed slots collapse into one run.
"""

import asyncio
import json
import logging
import os
import threading
from collections import deque
from datetime import datetime, timedelta
from os import getenv
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import RealDictCursor, execute_values
from pydantic import BaseModel

import backup_scheduler as bs
import telegram_utils as tu
from analytics_utils import Database
from auth_middleware import get_current_user
from bill_corrections import SETTLE_DESC, _lock_stores
from clock import local_now
from profit_fifo import compute_fifo_profit

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

logger = logging.getLogger(__name__)
router = APIRouter(tags=["purge"])

PAGE_PATH = "/data-purge"
OPENING_TIME = datetime(1970, 1, 1)
OPENING_DESC = "رصيد مرحّل"
PURGE_LOCK = (781_235, 0)
TOLERANCE = 0.01
FAR_FUTURE = datetime(2999, 1, 1)

SETTINGS_KEY = "purge_settings"
STATUS_KEY = "purge_status"
PENDING_SECONDS = 120
STARTUP_DELAY_SECONDS = 90
TICK_SECONDS = 30
STALE_DATA_DAYS = 30

CONFIRM_WITH_BACKUP = "حذف"
CONFIRM_WITHOUT_BACKUP = "حذف بدون نسخة"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "enabled": False,
    "weekday": 6,  # Python weekday: 0 = Monday ... 6 = Sunday
    "time": "12:00",
    "with_backup": True,
}

_run_lock = threading.Lock()
_state: Dict[str, Any] = {"running": False, "started_at": None, "source": None, "cutoff": None}
_pending: Dict[str, Any] = {}


class PurgeError(Exception):
    pass


class PurgeCheckFailed(PurgeError):
    def __init__(self, failures: List[str]):
        self.failures = failures
        super().__init__("فشل التحقق من الأرصدة، لم يُحذف شيء: " + "؛ ".join(failures[:5]))


# ─── Access ─────────────────────────────────────────────────────────────────


def require_purge_access(current_user: dict = Depends(get_current_user)):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
            SELECT 1 FROM scopes s JOIN pages p ON p.id = ANY(s.pages)
            WHERE s.id = %s AND p.path = %s
            """,
            (current_user.get("scope_id"), PAGE_PATH),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="ليس لديك صلاحية حذف السجلات")
    return current_user


# ─── Snapshot / checks ──────────────────────────────────────────────────────


def _num(x) -> float:
    return float(x or 0)


def _snapshot(cur, cutoff: datetime, stores: List[int]) -> Dict[str, Dict[Any, float]]:
    snap: Dict[str, Dict[Any, float]] = {}

    cur.execute(
        """
        SELECT store_id, party_id, (bill_id IS NULL) AS nb, SUM(amount) AS s
        FROM cash_flow GROUP BY 1, 2, 3
        """
    )
    snap["cash"] = {(r["store_id"], r["party_id"], r["nb"]): _num(r["s"]) for r in cur.fetchall()}

    cur.execute(
        "SELECT store_id, payment_method_id, SUM(amount) AS s FROM account_transactions GROUP BY 1, 2"
    )
    snap["accounts"] = {(r["store_id"], r["payment_method_id"]): _num(r["s"]) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT DISTINCT ON (store_id) store_id, total FROM cash_flow
        WHERE time IS NOT NULL ORDER BY store_id, time DESC, id DESC
        """
    )
    snap["drawer"] = {r["store_id"]: _num(r["total"]) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT store_id, product_id, SUM(amount) AS s FROM products_flow
        WHERE bill_id >= -1 GROUP BY 1, 2
        """
    )
    snap["flow"] = {(r["store_id"], r["product_id"]): _num(r["s"]) for r in cur.fetchall()}

    cur.execute("SELECT store_id, product_id, stock FROM product_inventory")
    snap["stock"] = {(r["store_id"], r["product_id"]): _num(r["stock"]) for r in cur.fetchall()}

    cur.execute(
        "SELECT store_id, SUM(amount) AS s FROM cash_flow WHERE time >= %s GROUP BY 1",
        (cutoff,),
    )
    snap["after_cutoff"] = {r["store_id"]: _num(r["s"]) for r in cur.fetchall()}

    snap["profit"] = {}
    for store_id in stores:
        result = compute_fifo_profit(cur, store_id, cutoff, FAR_FUTURE)
        snap["profit"][store_id] = sum(v["total_profit"] for v in result.values())
    return snap


CHECK_LABELS = {
    "cash": "حركات النقدية (متجر/طرف)",
    "accounts": "أرصدة الحسابات",
    "drawer": "رصيد الخزنة",
    "flow": "حركة المنتجات",
    "stock": "المخزون",
    "after_cutoff": "الحركات بعد تاريخ الحذف",
    "profit": "أرباح المبيعات بعد تاريخ الحذف",
}


def _compare(before: Dict, after: Dict) -> Tuple[List[str], Dict[str, bool]]:
    failures: List[str] = []
    ok: Dict[str, bool] = {}
    for name, b in before.items():
        a = after.get(name, {})
        bad = []
        for key in set(b) | set(a):
            x, y = b.get(key, 0.0), a.get(key, 0.0)
            if abs(x - y) > max(TOLERANCE, 1e-9 * max(abs(x), abs(y))):
                bad.append((key, x, y))
        ok[name] = not bad
        for key, x, y in bad[:3]:
            failures.append(f"{CHECK_LABELS.get(name, name)} {key}: {x:.2f} ← {y:.2f}")
    return failures, ok


# ─── FIFO opening layers ────────────────────────────────────────────────────


def _fifo_state(rows) -> Tuple[List[List[float]], float]:
    """Replay stock movements the way profit_fifo does (same layer rules) and
    return (layers [[cost, qty], ...] oldest first, deficit)."""
    layers: deque = deque()
    deficit = 0.0
    for amount, cost in rows:
        amount = float(amount or 0)
        cost = float(cost or 0)
        if amount > 0:
            filled = min(deficit, amount)
            deficit -= filled
            if amount - filled > 1e-9:
                layers.append([cost, amount - filled])
        elif amount < 0:
            need = -amount
            while need > 1e-9 and layers:
                take = min(layers[0][1], need)
                layers[0][1] -= take
                need -= take
                if layers[0][1] <= 1e-9:
                    layers.popleft()
            if need > 1e-9:
                deficit += need
    return [list(x) for x in layers], deficit


# ─── The purge ──────────────────────────────────────────────────────────────


def _select_units(cur, cutoff: datetime) -> Dict[str, int]:
    """Fill temp table purge_bills with every bill (incl. twins) to delete.
    Returns counts of what is kept because it is still open / crosses the cutoff."""
    cur.execute(
        """
        CREATE TEMP TABLE purge_block ON COMMIT DROP AS
        SELECT b.store_id, b.id,
               (b.type = 'BNPL') AS bnpl,
               (b.type = 'reserve' AND EXISTS (
                    SELECT 1 FROM reserved_products rp
                    WHERE rp.store_id = b.store_id AND rp.bill_id = b.id)) AS reserve,
               EXISTS (
                    SELECT 1 FROM installments i
                    WHERE i.store_id = b.store_id AND i.bill_id = b.id
                      AND COALESCE(i.paid, 0) + COALESCE((
                            SELECT SUM(f.amount) FROM installments_flow f WHERE f.installment_id = i.id), 0)
                          < ABS(COALESCE((
                            SELECT SUM(pf.price * pf.amount) FROM products_flow pf
                            WHERE pf.store_id = b.store_id AND pf.bill_id = b.id), 0)) - 0.01
               ) AS installment,
               (EXISTS (
                    SELECT 1 FROM cash_flow cf
                    WHERE cf.store_id = b.store_id AND cf.bill_id = b.id
                      AND (cf.time IS NULL OR cf.time >= %(cutoff)s))
                OR EXISTS (
                    SELECT 1 FROM installments i JOIN installments_flow f ON f.installment_id = i.id
                    WHERE i.store_id = b.store_id AND i.bill_id = b.id
                      AND (f.time IS NULL OR f.time >= %(cutoff)s))) AS crosses
        FROM bills b
        WHERE b.id > 0 AND b.time < %(cutoff)s
        """,
        {"cutoff": cutoff},
    )
    cur.execute(
        """
        SELECT COUNT(*) FILTER (WHERE bnpl) AS bnpl,
               COUNT(*) FILTER (WHERE reserve) AS reserve,
               COUNT(*) FILTER (WHERE installment) AS installment,
               COUNT(*) FILTER (WHERE crosses AND NOT (bnpl OR reserve OR installment)) AS crosses
        FROM purge_block
        """
    )
    kept = {k: int(v or 0) for k, v in cur.fetchone().items()}

    cur.execute(
        """
        CREATE TEMP TABLE purge_bills ON COMMIT DROP AS
        SELECT store_id, id FROM purge_block
        WHERE NOT (bnpl OR reserve OR installment OR crosses)
        """
    )
    cur.execute("CREATE INDEX ON purge_bills (store_id, id)")
    # A transfer is deleted only together with its partner. Repeat until stable
    # (a bill can be in more than one pair).
    pairs_dropped = 0
    while True:
        cur.execute(
            """
            DELETE FROM purge_bills pb
            WHERE EXISTS (
                SELECT 1 FROM bills_pairs p
                WHERE (p.left_store_id = pb.store_id AND p.left_bill_id = pb.id
                       AND NOT EXISTS (SELECT 1 FROM purge_bills x
                                       WHERE x.store_id = p.right_store_id AND x.id = p.right_bill_id))
                   OR (p.right_store_id = pb.store_id AND p.right_bill_id = pb.id
                       AND NOT EXISTS (SELECT 1 FROM purge_bills x
                                       WHERE x.store_id = p.left_store_id AND x.id = p.left_bill_id))
            )
            """
        )
        if cur.rowcount <= 0:
            break
        pairs_dropped += cur.rowcount
    kept["transfer_partner"] = pairs_dropped

    # Edit twins (-<id>) go with their bill. Bill 1 has no twin: -1 is the
    # per-store placeholder bill and is never deleted.
    cur.execute(
        """
        INSERT INTO purge_bills (store_id, id)
        SELECT b.store_id, b.id FROM bills b
        JOIN purge_bills pb ON pb.store_id = b.store_id AND b.id = -pb.id
        WHERE pb.id > 1
        """
    )
    return kept


def _purge_in_tx(cur, cutoff: datetime, stores: List[int]) -> Dict[str, Any]:
    counts: Dict[str, Any] = {}

    for s in stores:
        cur.execute("INSERT INTO bills (id, store_id) VALUES (-1, %s) ON CONFLICT DO NOTHING", (s,))

    before = _snapshot(cur, cutoff, stores)
    cur.execute("SET LOCAL openstore.purge = 'on'")

    counts["kept_open"] = _select_units(cur, cutoff)
    cur.execute("SELECT COUNT(*) AS n FROM purge_bills WHERE id > 0")
    counts["bills"] = int(cur.fetchone()["n"])

    # ── Cash rows to delete ────────────────────────────────────────────────
    # Bill-less rows before the cutoff, except settle / off-store forwarding
    # rows that belong to a bill that stays (same time, matching description).
    cur.execute(
        """
        CREATE TEMP TABLE purge_cash ON COMMIT DROP AS
        SELECT cf.store_id, cf.id, cf.time, cf.amount, cf.party_id, cf.bill_id
        FROM cash_flow cf
        WHERE cf.time < %(cutoff)s AND (
              EXISTS (SELECT 1 FROM purge_bills pb WHERE pb.store_id = cf.store_id AND pb.id = cf.bill_id)
           OR cf.bill_id = -1
           OR (cf.bill_id IS NULL AND NOT (
                  (cf.description = %(settle)s
                   OR cf.description LIKE 'تحصيل (%%) لحساب متجر آخر'
                   OR cf.description LIKE 'رد (%%) من حساب متجر آخر')
                  AND EXISTS (
                      SELECT 1 FROM bills b
                      WHERE b.id > 0 AND b.time = cf.time
                        AND NOT EXISTS (SELECT 1 FROM purge_bills pb
                                        WHERE pb.store_id = b.store_id AND pb.id = b.id))))
        )
        """,
        {"cutoff": cutoff, "settle": SETTLE_DESC},
    )
    cur.execute("CREATE INDEX ON purge_cash (store_id, id)")
    # Shown counts leave out earlier opening rows (they are folded every time).
    cur.execute("SELECT COUNT(*) AS n FROM purge_cash WHERE time <> %s", (OPENING_TIME,))
    counts["cash_rows"] = int(cur.fetchone()["n"])

    # The running total is anchored on the last deleted row L of each store:
    # every row after L is untouched, so the new order (opening rows, then the
    # kept rows that sorted before L) must arrive exactly at L.total. Old
    # drift after L is therefore kept as it was, never "fixed".
    cur.execute(
        """
        CREATE TEMP TABLE purge_chain ON COMMIT DROP AS
        WITH last_del AS (
            SELECT DISTINCT ON (pc.store_id) pc.store_id, pc.id, pc.time, cf.total
            FROM purge_cash pc JOIN cash_flow cf ON cf.store_id = pc.store_id AND cf.id = pc.id
            ORDER BY pc.store_id, pc.time DESC, pc.id DESC
        )
        SELECT l.store_id, l.time AS l_time, l.id AS l_id,
               COALESCE(l.total, 0) - COALESCE((
                   SELECT SUM(cf.amount) FROM cash_flow cf
                   WHERE cf.store_id = l.store_id AND cf.time IS NOT NULL
                     AND (cf.time, cf.id) < (l.time, l.id)
                     AND NOT EXISTS (SELECT 1 FROM purge_cash pc
                                     WHERE pc.store_id = cf.store_id AND pc.id = cf.id)), 0) AS chain_end
        FROM last_del l
        """
    )
    cur.execute("SELECT store_id, chain_end FROM purge_chain")
    chain_end = {int(r["store_id"]): _num(r["chain_end"]) for r in cur.fetchall()}

    # Ledger rows: those of deleted cash rows, plus account-to-account
    # transfers and earlier opening rows (no cash row) before the cutoff.
    cur.execute(
        """
        CREATE TEMP TABLE purge_acc ON COMMIT DROP AS
        SELECT at.id, at.store_id, at.payment_method_id, at.amount
        FROM account_transactions at
        WHERE EXISTS (SELECT 1 FROM purge_cash pc
                      WHERE pc.store_id = at.store_id AND pc.id = at.cash_flow_id)
           OR (at.cash_flow_id IS NULL AND at.time < %s)
        """,
        (cutoff,),
    )

    # ── Running totals of kept rows that sort before L ────────────────────
    # They now follow the opening rows: chain_end + their own running sum,
    # which ends exactly at L.total.
    cur.execute(
        """
        WITH k AS (
            SELECT cf.store_id, cf.id,
                   pch.chain_end + SUM(COALESCE(cf.amount, 0)) OVER (
                       PARTITION BY cf.store_id ORDER BY cf.time, cf.id) AS new_total
            FROM cash_flow cf
            JOIN purge_chain pch ON pch.store_id = cf.store_id
            WHERE cf.time IS NOT NULL AND (cf.time, cf.id) < (pch.l_time, pch.l_id)
              AND NOT EXISTS (SELECT 1 FROM purge_cash pc
                              WHERE pc.store_id = cf.store_id AND pc.id = cf.id)
        )
        UPDATE cash_flow c SET total = k.new_total
        FROM k
        WHERE c.store_id = k.store_id AND c.id = k.id
          AND c.total IS DISTINCT FROM k.new_total
        """
    )
    counts["totals_shifted"] = cur.rowcount

    # ── FIFO layers of the deleted stock movements ─────────────────────────
    cur.execute(
        """
        SELECT pf.store_id, pf.product_id, pf.amount, pf.wholesale_price
        FROM products_flow pf
        LEFT JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
        WHERE pf.bill_id >= -1 AND (
              EXISTS (SELECT 1 FROM purge_bills pb WHERE pb.store_id = pf.store_id AND pb.id = pf.bill_id)
           OR (pf.bill_id = -1 AND pf.time < %s))
        ORDER BY pf.store_id, pf.product_id, COALESCE(b.time, pf.time), pf.id
        """,
        (cutoff,),
    )
    opening_flow: List[tuple] = []
    group_key = None
    group_rows: List[tuple] = []

    def _flush():
        if group_key is None:
            return
        layers, deficit = _fifo_state(group_rows)
        for cost, qty in layers:
            opening_flow.append((group_key[0], group_key[1], cost, int(round(qty))))
        if deficit > 1e-9:
            opening_flow.append((group_key[0], group_key[1], group_rows[-1][1] or 0, -int(round(deficit))))

    for r in cur.fetchall():
        key = (r["store_id"], r["product_id"])
        if key != group_key:
            _flush()
            group_key, group_rows = key, []
        group_rows.append((r["amount"], r["wholesale_price"]))
    _flush()

    # ── Deletes ────────────────────────────────────────────────────────────
    cur.execute(
        """
        CREATE TEMP TABLE purge_corr ON COMMIT DROP AS
        SELECT bc.id FROM bill_corrections bc
        WHERE EXISTS (SELECT 1 FROM purge_bills pb WHERE pb.store_id = bc.store_id AND pb.id = bc.bill_id)
           OR EXISTS (SELECT 1 FROM purge_bills pb WHERE pb.store_id = bc.pair_store_id AND pb.id = bc.pair_bill_id)
        """
    )
    cur.execute(
        """
        UPDATE bill_corrections SET reverts_id = NULL
        WHERE reverts_id IN (SELECT id FROM purge_corr) AND id NOT IN (SELECT id FROM purge_corr)
        """
    )
    cur.execute(
        """
        UPDATE bill_corrections SET reverted_by = NULL
        WHERE reverted_by IN (SELECT id FROM purge_corr) AND id NOT IN (SELECT id FROM purge_corr)
        """
    )
    cur.execute("UPDATE bill_corrections SET reverts_id = NULL, reverted_by = NULL WHERE id IN (SELECT id FROM purge_corr)")
    cur.execute("DELETE FROM bill_corrections WHERE id IN (SELECT id FROM purge_corr)")

    cur.execute("DELETE FROM account_transactions WHERE id IN (SELECT id FROM purge_acc)")
    cur.execute(
        """
        DELETE FROM cash_flow cf USING purge_cash pc
        WHERE cf.store_id = pc.store_id AND cf.id = pc.id
        """
    )
    cur.execute(
        """
        DELETE FROM installments_flow WHERE installment_id IN (
            SELECT i.id FROM installments i JOIN purge_bills pb
            ON pb.store_id = i.store_id AND pb.id = i.bill_id)
        """
    )
    cur.execute(
        """
        DELETE FROM installments i USING purge_bills pb
        WHERE pb.store_id = i.store_id AND pb.id = i.bill_id
        """
    )
    counts["installments"] = cur.rowcount
    cur.execute(
        """
        DELETE FROM bills_collections bc USING purge_bills pb
        WHERE pb.store_id = bc.store_id AND pb.id = bc.bill_id
        """
    )
    cur.execute(
        """
        DELETE FROM bills_pairs p
        WHERE EXISTS (SELECT 1 FROM purge_bills pb WHERE pb.store_id = p.left_store_id AND pb.id = p.left_bill_id)
           OR EXISTS (SELECT 1 FROM purge_bills pb WHERE pb.store_id = p.right_store_id AND pb.id = p.right_bill_id)
        """
    )
    cur.execute(
        """
        WITH d AS (
            DELETE FROM products_flow pf
            WHERE EXISTS (SELECT 1 FROM purge_bills pb WHERE pb.store_id = pf.store_id AND pb.id = pf.bill_id)
               OR (pf.bill_id = -1 AND pf.time < %s)
            RETURNING pf.time
        )
        SELECT COUNT(*) FILTER (WHERE time <> %s) AS n FROM d
        """,
        (cutoff, OPENING_TIME),
    )
    counts["product_rows"] = int(cur.fetchone()["n"])
    cur.execute(
        """
        DELETE FROM bills b USING purge_bills pb
        WHERE pb.store_id = b.store_id AND pb.id = b.id
        """
    )

    # Salaries: keep each employee's latest one (it drives the next pay
    # period and the double-pay guard). Attendance up to that period is done.
    cur.execute(
        """
        DELETE FROM salaries s
        WHERE s.time < %s AND s.id <> (
            SELECT s2.id FROM salaries s2 WHERE s2.employee_id IS NOT DISTINCT FROM s.employee_id
            ORDER BY s2.period_end DESC NULLS LAST, s2.time DESC NULLS LAST, s2.id DESC LIMIT 1)
        """,
        (cutoff,),
    )
    counts["salaries"] = cur.rowcount
    cur.execute(
        """
        DELETE FROM employee_attendance a
        WHERE a.day < %s::date AND a.day <= (
            SELECT MAX(s.period_end) FROM salaries s WHERE s.employee_id = a.employee_id)
        """,
        (cutoff,),
    )
    counts["attendance"] = cur.rowcount

    cur.execute(
        "DELETE FROM shifts WHERE end_date_time < %s AND current IS NOT TRUE",
        (cutoff,),
    )
    counts["shifts"] = cur.rowcount
    cur.execute(
        """
        UPDATE shifts SET start_date_time = %(c)s
        WHERE start_date_time < %(c)s AND (end_date_time IS NULL OR end_date_time >= %(c)s)
        """,
        {"c": cutoff},
    )
    counts["shifts_moved"] = cur.rowcount
    cur.execute("DELETE FROM notifications WHERE created_at < %s", (cutoff,))
    counts["notifications"] = cur.rowcount
    cur.execute(
        "DELETE FROM restock_requests WHERE status = 'closed' AND closed_at < %s",
        (cutoff,),
    )
    counts["restock_requests"] = cur.rowcount

    # ── Opening rows ───────────────────────────────────────────────────────
    cur.execute(
        """
        SELECT store_id, party_id, (bill_id IS NULL) AS nb, SUM(amount) AS s
        FROM purge_cash GROUP BY 1, 2, 3
        HAVING ABS(COALESCE(SUM(amount), 0)) > 1e-9
        ORDER BY 1, 3, 2 NULLS FIRST
        """
    )
    groups = cur.fetchall()
    by_store: Dict[int, List[dict]] = {}
    for g in groups:
        by_store.setdefault(int(g["store_id"]), []).append(g)
    new_cash_ids: List[Tuple[int, int]] = []
    for store, end in chain_end.items():
        rows = by_store.get(store, [])
        # Chain so the last opening row ends exactly at `end`.
        running = end - sum(float(g["s"]) for g in rows)
        if not rows and abs(end) > 1e-9:
            # Everything deleted nets to 0 but the old total wasn't 0 (drift):
            # keep it on a zero-amount row (the mirror ignores amount 0).
            rows = [{"s": 0.0, "nb": True, "party_id": None}]
        for g in rows:
            amount = float(g["s"])
            running += amount
            cur.execute(
                """
                INSERT INTO cash_flow (store_id, time, amount, type, bill_id, description, total, party_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                """,
                (store, OPENING_TIME, amount, "in" if amount >= 0 else "out",
                 None if g["nb"] else -1, OPENING_DESC, running, g["party_id"]),
            )
            new_cash_ids.append((store, int(cur.fetchone()["id"])))
    if new_cash_ids:
        # The mirror trigger booked these on the default account; the ledger
        # gets its own per-account opening rows below instead.
        execute_values(
            cur,
            """
            DELETE FROM account_transactions at USING (VALUES %s) AS v(store_id, id)
            WHERE at.store_id = v.store_id AND at.cash_flow_id = v.id
            """,
            new_cash_ids,
        )
    counts["opening_cash_rows"] = len(new_cash_ids)

    cur.execute(
        """
        INSERT INTO account_transactions (store_id, payment_method_id, cash_flow_id, amount, source, time)
        SELECT store_id, payment_method_id, NULL, SUM(amount), 'opening', %s
        FROM purge_acc GROUP BY store_id, payment_method_id
        HAVING ABS(SUM(amount)) > 1e-9
        """,
        (OPENING_TIME,),
    )
    counts["opening_account_rows"] = cur.rowcount

    if opening_flow:
        execute_values(
            cur,
            """
            INSERT INTO products_flow (store_id, bill_id, product_id, wholesale_price, price, amount, time)
            VALUES %s
            """,
            [(s, -1, p, cost, cost, qty, OPENING_TIME) for (s, p, cost, qty) in opening_flow if qty != 0],
        )
    counts["opening_product_rows"] = len(opening_flow)

    cur.execute("SET LOCAL openstore.purge = 'off'")
    after = _snapshot(cur, cutoff, stores)
    failures, ok = _compare(before, after)
    counts["checks"] = ok
    if failures:
        raise PurgeCheckFailed(failures)
    return counts


def _connect():
    conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
    return conn, conn.cursor(cursor_factory=RealDictCursor)


def _all_stores(cur) -> List[int]:
    cur.execute("SELECT id FROM store_data ORDER BY id")
    return [int(r["id"]) for r in cur.fetchall()]


def _execute(cutoff: datetime, apply: bool) -> Dict[str, Any]:
    conn, cur = _connect()
    try:
        if not apply:
            conn.set_session(isolation_level="REPEATABLE READ")
        cur.execute("SELECT pg_try_advisory_xact_lock(%s, %s) AS ok", PURGE_LOCK)
        if not cur.fetchone()["ok"]:
            raise PurgeError("يوجد حذف سجلات قيد التشغيل بالفعل")
        stores = _all_stores(cur)
        if apply:
            _lock_stores(cur, stores)
            cur.execute("SET LOCAL statement_timeout = 0")
            cur.execute("SET LOCAL lock_timeout = '30s'")
        else:
            cur.execute("SET LOCAL statement_timeout = '10min'")
        counts = _purge_in_tx(cur, cutoff, stores)
        if apply:
            conn.commit()
        else:
            conn.rollback()
        return counts
    except BaseException:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        finally:
            conn.close()


def preview(cutoff: datetime) -> Dict[str, Any]:
    if cutoff > local_now():
        raise PurgeError("لا يمكن اختيار وقت في المستقبل")
    try:
        counts = _execute(cutoff, apply=False)
        return {"ok": True, "counts": counts, "failures": []}
    except PurgeCheckFailed as e:
        return {"ok": False, "counts": {}, "failures": e.failures}


# ─── Log / status ───────────────────────────────────────────────────────────


def _log_start(source, slot, cutoff, with_backup, user) -> Optional[int]:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO data_purges (created_at, source, slot, cutoff, with_backup, user_id, username, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'running') RETURNING id
                """,
                (local_now(), source, slot, cutoff, with_backup,
                 (user or {}).get("id"), (user or {}).get("username")),
            )
            return int(cur.fetchone()["id"])
    except Exception as e:
        logger.error(f"Could not log purge start: {e}")
        return None


def _log_end(purge_id, status, counts=None, error=None, backup_file=None) -> None:
    if purge_id is None:
        return
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE data_purges SET status = %s, counts = %s, error = %s,
                       backup_file = COALESCE(%s, backup_file), finished_at = %s
                WHERE id = %s
                """,
                (status, json.dumps(counts, default=str) if counts is not None else None,
                 error, backup_file, local_now(), purge_id),
            )
    except Exception as e:
        logger.error(f"Could not log purge end: {e}")


def mark_stale_runs_failed() -> None:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                "UPDATE data_purges SET status = 'failed', error = 'توقف البرنامج أثناء التنفيذ' WHERE status = 'running'"
            )
    except Exception as e:
        logger.warning(f"Could not clean stale purge rows: {e}")


def _notify(text: str) -> None:
    try:
        if not tu.current_bot_token():
            return
        for chat_id in bs.backup_chat_ids():
            tu.send_telegram_message(chat_id, text)
    except Exception as e:
        logger.warning(f"Purge Telegram notice failed: {e}")


def _fmt(dt: Optional[datetime]) -> str:
    return dt.strftime("%Y-%m-%d %H:%M") if dt else "-"


def run_purge(
    cutoff: datetime,
    with_backup: bool,
    source: str = "manual",
    user: Optional[dict] = None,
    slot: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Apply a purge (blocking). Never raises; returns {success, ...}."""
    if not _run_lock.acquire(blocking=False):
        return {"success": False, "error": "يوجد حذف سجلات قيد التشغيل بالفعل"}
    _state.update(running=True, started_at=local_now().isoformat(timespec="seconds"),
                  source=source, cutoff=cutoff.isoformat(timespec="minutes"))
    purge_id = None
    backup_path = None
    try:
        if cutoff > local_now():
            raise PurgeError("لا يمكن اختيار وقت في المستقبل")
        purge_id = _log_start(source, slot, cutoff, with_backup, user)

        if with_backup:
            folder, _src = bs.resolve_backup_dir()
            started = local_now()
            name = f"openstore-{bs._db_name_safe()}-{started.strftime('%Y%m%d-%H%M%S')}-purge.sql.gz"
            backup_path = os.path.join(folder, name)
            try:
                os.makedirs(folder, exist_ok=True)
                # Not added to the backup manifest: retention never deletes it.
                bs.dump_database(backup_path, compress=True)
            except Exception as e:
                raise PurgeError(f"فشل النسخ الاحتياطي قبل الحذف، لم يُحذف شيء: {e}") from e

        counts = _execute(cutoff, apply=True)
        _log_end(purge_id, "done", counts, backup_file=backup_path)
        result = {"success": True, "purge_id": purge_id, "counts": counts, "backup_file": backup_path}
        _set_last(result, cutoff, source)

        lines = [
            "🧹 <b>تم حذف السجلات القديمة</b>",
            f"📅 قبل: {_fmt(cutoff)}",
            f"🧾 فواتير محذوفة: {counts.get('bills', 0)}",
            "💾 " + ("نسخة: <code>" + tu.esc(backup_path) + "</code>" if backup_path else "بدون نسخة احتياطية"),
        ]
        _notify("\n".join(lines))
        if backup_path and tu.current_bot_token():
            try:
                size = os.path.getsize(backup_path)
                bs._send_backup_to_telegram(backup_path, size, "purge", local_now(), bs.backup_chat_ids())
            except Exception as e:
                logger.warning(f"Could not send purge archive: {e}")
        return result
    except Exception as e:
        error = str(e) if isinstance(e, PurgeError) else f"{type(e).__name__}: {e}"
        logger.error(f"Purge failed: {error}")
        _log_end(purge_id, "failed", error=error, backup_file=backup_path)
        result = {"success": False, "error": error, "purge_id": purge_id, "backup_file": backup_path}
        _set_last(result, cutoff, source)
        _notify(f"❌ <b>فشل حذف السجلات</b>\n📅 قبل: {_fmt(cutoff)}\n⚠️ {tu.esc(error[:600])}")
        return result
    finally:
        _state.update(running=False, started_at=None, source=None, cutoff=None)
        _run_lock.release()


def _set_last(result: Dict[str, Any], cutoff: datetime, source: str) -> None:
    status = load_status()
    status["last_run"] = {
        "at": local_now().isoformat(timespec="seconds"),
        "cutoff": cutoff.isoformat(timespec="minutes"),
        "source": source,
        "success": bool(result.get("success")),
        "error": result.get("error"),
        "bills": (result.get("counts") or {}).get("bills"),
    }
    save_status(status)


# ─── Schedule ───────────────────────────────────────────────────────────────


def normalize_settings(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    s = dict(DEFAULT_SETTINGS)
    if isinstance(raw, dict):
        s.update({k: v for k, v in raw.items() if k in DEFAULT_SETTINGS})
    s["enabled"] = bool(s["enabled"])
    s["with_backup"] = bool(s["with_backup"])
    try:
        s["weekday"] = min(6, max(0, int(s["weekday"])))
    except (TypeError, ValueError):
        s["weekday"] = DEFAULT_SETTINGS["weekday"]
    if not bs._valid_time(s["time"]):
        s["time"] = DEFAULT_SETTINGS["time"]
    return s


def load_settings() -> Dict[str, Any]:
    return normalize_settings(tu.meta_get_json(SETTINGS_KEY, None))


def load_status() -> Dict[str, Any]:
    st = tu.meta_get_json(STATUS_KEY, None)
    return st if isinstance(st, dict) else {}


def save_status(status: Dict[str, Any]) -> None:
    tu.meta_set_json(STATUS_KEY, status)


def latest_slot(settings: Dict[str, Any], now: datetime) -> datetime:
    """The most recent weekday/time slot at or before `now`."""
    hour, minute = (int(x) for x in settings["time"].split(":"))
    day = now.date() - timedelta(days=(now.weekday() - settings["weekday"]) % 7)
    slot = datetime(day.year, day.month, day.day, hour, minute)
    if slot > now:
        slot -= timedelta(days=7)
    return slot


def _parse(iso: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(iso) if iso else None
    except ValueError:
        return None


def _newest_cash_time() -> Optional[datetime]:
    """When the store was last seen active: its newest cash row, or the last
    purge's cutoff (a purge up to now leaves no recent rows behind)."""
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
            SELECT GREATEST(
                (SELECT MAX(time) FROM cash_flow WHERE time > %s),
                (SELECT MAX(cutoff) FROM data_purges WHERE status = 'done')) AS t
            """,
            (OPENING_TIME,),
        )
        r = cur.fetchone()
        return r["t"] if r else None


def scheduler_tick(now: Optional[datetime] = None) -> Optional[str]:
    """One step. Returns what it did (for tests/logs)."""
    now = now or local_now()
    settings = load_settings()
    if not settings["enabled"]:
        _pending.clear()
        return None
    status = load_status()
    slot = latest_slot(settings, now)
    handled = _parse(status.get("handled_slot"))
    if handled and slot <= handled:
        _pending.clear()
        return None
    if _state["running"]:
        return None

    newest = _newest_cash_time()
    if (newest is not None and slot - newest > timedelta(days=STALE_DATA_DAYS)
            and status.get("approved_slot") != slot.isoformat()):
        if status.get("needs_approval") != slot.isoformat():
            status["needs_approval"] = slot.isoformat()
            save_status(status)
        _pending.clear()
        return "needs_approval"
    if status.get("needs_approval"):
        status.pop("needs_approval", None)
        save_status(status)

    if _pending.get("slot") != slot.isoformat():
        _pending.clear()
        _pending.update(slot=slot.isoformat(), run_at=(now + timedelta(seconds=PENDING_SECONDS)).isoformat())
        _notify(
            f"⏳ <b>سيتم حذف السجلات قبل {_fmt(slot)} خلال دقيقتين</b>\n"
            "يمكن الإلغاء من البرنامج."
        )
        return "pending"

    if now < datetime.fromisoformat(_pending["run_at"]):
        return "pending"

    _pending.clear()
    status = load_status()
    status["handled_slot"] = slot.isoformat()
    status.pop("needs_approval", None)
    status.pop("approved_slot", None)
    save_status(status)
    run_purge(slot, settings["with_backup"], source="scheduled", slot=slot)
    return "ran"


async def purge_scheduler_loop() -> None:
    await asyncio.to_thread(mark_stale_runs_failed)
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            await asyncio.to_thread(scheduler_tick)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Purge scheduler error: {e}")
        await asyncio.sleep(TICK_SECONDS)


def _history(limit: int = 20) -> List[Dict[str, Any]]:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT id, created_at, finished_at, source, slot, cutoff, with_backup,
                       backup_file, username, status, counts, error
                FROM data_purges ORDER BY id DESC LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
    except Exception:
        return []
    out = []
    for r in rows:
        r = dict(r)
        for k in ("created_at", "finished_at", "slot", "cutoff"):
            if r.get(k):
                r[k] = r[k].isoformat(timespec="minutes")
        bf = r.get("backup_file")
        r["backup_exists"] = bool(bf and os.path.isfile(bf))
        out.append(r)
    return out


def get_status(full: bool) -> Dict[str, Any]:
    settings = load_settings()
    status = load_status()
    pending = None
    if _pending:
        left = (datetime.fromisoformat(_pending["run_at"]) - local_now()).total_seconds()
        pending = {"slot": _pending["slot"], "run_at": _pending["run_at"], "seconds_left": max(0, int(left))}
    out: Dict[str, Any] = {
        "pending": pending,
        "running": dict(_state),
        "needs_approval": status.get("needs_approval") if settings["enabled"] else None,
    }
    if not full:
        return out
    next_slot = None
    if settings["enabled"]:
        next_slot = (latest_slot(settings, local_now()) + timedelta(days=7)).isoformat(timespec="minutes")
    folder, _src = bs.resolve_backup_dir()
    out.update(
        settings=settings,
        defaults=DEFAULT_SETTINGS,
        last_run=status.get("last_run"),
        handled_slot=status.get("handled_slot"),
        next_slot=next_slot,
        history=_history(),
        backup_dir=folder,
        pg_dump_found=bs.find_pg_dump() is not None,
        persistence_warning=bs.persistence_warning(folder),
    )
    return out


# ─── API ────────────────────────────────────────────────────────────────────


def _parse_cutoff(value: str) -> datetime:
    try:
        dt = datetime.fromisoformat(value.replace("Z", ""))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="تاريخ غير صالح")
    dt = dt.replace(tzinfo=None)
    # "Now" from a device whose clock is a few minutes ahead means now.
    now = local_now().replace(tzinfo=None)
    if now < dt <= now + timedelta(minutes=10):
        dt = now
    return dt


class PreviewIn(BaseModel):
    cutoff: str


class ApplyIn(BaseModel):
    cutoff: str
    with_backup: bool = True
    confirm: str = ""


class SettingsIn(BaseModel):
    enabled: bool = False
    weekday: int = 6
    time: str = "12:00"
    with_backup: bool = True


@router.get("/purge/status")
def purge_status(current_user: dict = Depends(get_current_user)):
    full = False
    try:
        require_purge_access(current_user)
        full = True
    except HTTPException:
        pass
    return get_status(full)


@router.post("/purge/preview")
def purge_preview(body: PreviewIn, current_user: dict = Depends(require_purge_access)):
    cutoff = _parse_cutoff(body.cutoff)
    try:
        return preview(cutoff)
    except PurgeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except psycopg2.Error as e:
        raise HTTPException(status_code=409, detail=f"تعذرت المعاينة، أعد المحاولة: {e}") from e


@router.post("/purge/apply")
def purge_apply(body: ApplyIn, current_user: dict = Depends(require_purge_access)):
    cutoff = _parse_cutoff(body.cutoff)
    expected = CONFIRM_WITH_BACKUP if body.with_backup else CONFIRM_WITHOUT_BACKUP
    if body.confirm.strip() != expected:
        raise HTTPException(status_code=400, detail=f"اكتب «{expected}» للتأكيد")
    if cutoff > local_now():
        raise HTTPException(status_code=400, detail="لا يمكن اختيار وقت في المستقبل")
    if body.with_backup and not bs.find_pg_dump():
        raise HTTPException(status_code=400, detail="لم يتم العثور على pg_dump؛ لا يمكن أخذ نسخة قبل الحذف")
    if _state["running"]:
        raise HTTPException(status_code=409, detail="يوجد حذف سجلات قيد التشغيل بالفعل")
    user = {"id": current_user.get("id"), "username": current_user.get("username") or current_user.get("sub")}
    threading.Thread(
        target=run_purge, args=(cutoff, body.with_backup, "manual", user), daemon=True, name="purge"
    ).start()
    return {"started": True}


@router.put("/purge/settings")
def purge_settings(body: SettingsIn, current_user: dict = Depends(require_purge_access)):
    if not bs._valid_time(body.time):
        raise HTTPException(status_code=400, detail="وقت غير صالح (HH:MM)")
    raw = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    settings = normalize_settings(raw)
    if not tu.meta_set_json(SETTINGS_KEY, settings):
        raise HTTPException(status_code=500, detail="تعذر حفظ الإعدادات")
    # A settings change never fires a slot that is already in the past.
    status = load_status()
    past = latest_slot(settings, local_now())
    handled = _parse(status.get("handled_slot"))
    if handled is None or past > handled:
        status["handled_slot"] = past.isoformat()
    status.pop("needs_approval", None)
    status.pop("approved_slot", None)
    save_status(status)
    _pending.clear()
    return get_status(True)


@router.post("/purge/cancel")
def purge_cancel(current_user: dict = Depends(get_current_user)):
    slot = _pending.get("slot")
    if not slot:
        raise HTTPException(status_code=404, detail="لا يوجد حذف مجدول قيد الانتظار")
    _pending.clear()
    status = load_status()
    status["handled_slot"] = slot
    status["last_run"] = {
        "at": local_now().isoformat(timespec="seconds"),
        "cutoff": slot,
        "source": "scheduled",
        "success": False,
        "error": f"أُلغي بواسطة {current_user.get('username') or current_user.get('sub') or 'مستخدم'}",
    }
    save_status(status)
    _notify(f"🚫 أُلغي حذف السجلات المجدول ({slot.replace('T', ' ')[:16]})")
    return {"cancelled": True}


@router.post("/purge/approve")
def purge_approve(current_user: dict = Depends(require_purge_access)):
    status = load_status()
    slot = status.get("needs_approval")
    if not slot:
        raise HTTPException(status_code=404, detail="لا يوجد حذف بانتظار الموافقة")
    status["approved_slot"] = slot
    status.pop("needs_approval", None)
    save_status(status)
    return get_status(True)

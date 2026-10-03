"""
Bill corrections: rewrite a bill in place, as if it had been entered that way.

The normal edit flow (PUT /bill) never undoes anything: it parks the old lines
on a -<id> bill, inserts reversals and new lines "now", and the insert
triggers re-price products. That is right for day-to-day edits and wrong for
fixing a typo from months ago. A correction instead:

- updates/deletes/inserts the bill's own products_flow rows at the bill's time
  (UPDATE/DELETE on products_flow fire no triggers; for inserted rows on a buy
  bill the product prices the insert trigger overwrites are put back),
- keeps a linked transfer (bills_pairs) in step: both sides change together,
- re-derives everything computed from the bill: product_inventory stock (and
  batches), the products_flow running totals, the bill total/discount/payments
  -> cash_flow amount -> running cash totals and the accounts ledger (via the
  existing bills/cash_flow update triggers, plus an explicit ledger re-split),
  and the satellite cash rows of a transfer settled from debt or an off-store
  payment,
- optionally carries a corrected buy cost into the later sale lines that
  recorded the wrong cost (until the product's next price-setting buy), and
  into the product's current price when that buy is still the latest.

Preview and apply run the exact same code in one transaction; preview rolls
back. The only trace is the bill_corrections log (who, when, before/after),
which also powers revert.

Access: the user's scope must include the /bill-corrections page. This is
checked here, not only in the UI.
"""

import hashlib
import json
from datetime import datetime, timedelta
from os import getenv
from typing import Dict, List, Literal, Optional

import psycopg2
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import Json, RealDictCursor
from pydantic import BaseModel

from analytics_utils import Database
from auth_middleware import get_current_user
from batches import add_to_batch, consume_batches_fefo
from bill_party import set_bill_party

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

router = APIRouter()

PAGE_PATH = "/bill-corrections"
CORRECTABLE_TYPES = ("sell", "buy", "return", "buy-return")
# products_flow.amount sign per bill type (stock out is negative)
AMOUNT_SIGN = {"sell": -1, "buy": 1, "return": 1, "buy-return": -1}
# bills.total sign per bill type (money out is negative)
TOTAL_SIGN = {"sell": 1, "buy": -1, "return": -1, "buy-return": 1}
CASH_TYPE = {"sell": "in", "buy": "out", "return": "out", "buy-return": "in"}
CASH_DESC = {
    "sell": "فاتورة بيع",
    "buy": "فاتورة شراء",
    "return": "فاتورة مرتجع",
    "buy-return": "فاتورة مرتجع شراء",
}
SETTLE_DESC = "تسوية نقل بضاعة (بدون نقد)"
# Satellite rows are written with the bill's time; allow for rounding.
SATELLITE_WINDOW = timedelta(seconds=2)
EPS = 0.005


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class CorrectionLine(BaseModel):
    flow_id: Optional[int] = None
    product_id: int
    quantity: int
    wholesale_price: float
    price: float


class CorrectionPayment(BaseModel):
    method_id: Optional[int] = None
    amount: float


class CorrectionRequest(BaseModel):
    store_id: int
    bill_id: int
    action: Literal["edit", "delete"] = "edit"
    discount: float = 0
    lines: List[CorrectionLine] = []
    # None keeps the current split, rescaled to the new total.
    payments: Optional[List[CorrectionPayment]] = None
    cascade_costs: bool = True
    # Party is rewritten in place (bill, its cash rows, its collection entry).
    set_party: bool = False
    party_id: Optional[int] = None
    note: Optional[str] = None
    # From the preview; apply refuses if the bill changed since.
    state_token: Optional[str] = None


class _Side(BaseModel):
    """Internal: exact target state of one bill (used for the pair and revert)."""

    lines: List[CorrectionLine]
    discount: float
    payments: Optional[list] = None  # raw stored JSON, or None to rescale


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------


def require_corrections_access(current_user: dict = Depends(get_current_user)):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
            SELECT 1
            FROM scopes s
            JOIN pages p ON p.id = ANY(s.pages)
            WHERE s.id = %s AND p.path = %s
            """,
            (current_user.get("scope_id"), PAGE_PATH),
        )
        if not cur.fetchone():
            raise HTTPException(
                status_code=403, detail="ليس لديك صلاحية تصحيح الفواتير"
            )
    return current_user


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _connect():
    conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
    return conn, conn.cursor(cursor_factory=RealDictCursor)


def _jsonable(value):
    return json.loads(json.dumps(value, default=str))


def _r2(x: float) -> float:
    return round(float(x or 0), 2)


def _store_names(cur) -> Dict[int, str]:
    cur.execute("SELECT id, name FROM store_data")
    return {int(r["id"]): r["name"] for r in cur.fetchall()}


def _store_party_id(cur, store_id: int) -> Optional[int]:
    cur.execute(
        "SELECT id FROM assosiated_parties WHERE extra_info->>'store_id' = %s LIMIT 1",
        (str(store_id),),
    )
    r = cur.fetchone()
    return int(r["id"]) if r else None


def _load_bill(cur, store_id: int, bill_id: int, lock: bool = False) -> Optional[dict]:
    cur.execute(
        f"""
        SELECT b.id, b.store_id, b.time, b.discount, b.total, b.type, b.note,
               b.party_id, b.payments,
               ap.name AS party_name, ap.type AS party_type,
               (ap.extra_info->>'store_id')::BIGINT AS party_store_id
        FROM bills b
        LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
        WHERE b.id = %s AND b.store_id = %s
        {"FOR UPDATE OF b" if lock else ""}
        """,
        (bill_id, store_id),
    )
    r = cur.fetchone()
    return dict(r) if r else None


def _load_lines(cur, store_id: int, bill_id: int) -> List[dict]:
    cur.execute(
        """
        SELECT pf.id AS flow_id, pf.product_id, p.name, p.bar_code,
               pf.amount, pf.wholesale_price, pf.price, pf.time
        FROM products_flow pf
        JOIN products p ON p.id = pf.product_id
        WHERE pf.bill_id = %s AND pf.store_id = %s
        ORDER BY pf.id
        """,
        (bill_id, store_id),
    )
    return [dict(r) for r in cur.fetchall()]


def _find_pair(cur, store_id: int, bill_id: int) -> Optional[dict]:
    cur.execute(
        """
        SELECT left_bill_id, left_store_id, right_bill_id, right_store_id
        FROM bills_pairs
        WHERE (left_bill_id = %s AND left_store_id = %s)
           OR (right_bill_id = %s AND right_store_id = %s)
        LIMIT 1
        """,
        (bill_id, store_id, bill_id, store_id),
    )
    p = cur.fetchone()
    if not p:
        return None
    if p["left_bill_id"] == bill_id and p["left_store_id"] == store_id:
        return {"bill_id": p["right_bill_id"], "store_id": p["right_store_id"]}
    return {"bill_id": p["left_bill_id"], "store_id": p["left_store_id"]}


def _legacy_pair_candidates(cur, bill: dict) -> List[dict]:
    """A transfer made before linked pairs existed: the other store's bill with
    this store as party, the opposite type, the same total, near the same time."""
    if bill["party_type"] != "store" or bill["party_store_id"] is None or bill["time"] is None:
        return []
    other_type = {"sell": "buy", "buy": "sell"}.get(bill["type"])
    my_party = _store_party_id(cur, bill["store_id"])
    if not other_type or my_party is None:
        return []
    cur.execute(
        """
        SELECT id, store_id, type, time, total
        FROM bills
        WHERE store_id = %s AND party_id = %s AND type = %s AND id > 0
          AND time BETWEEN %s AND %s
          AND ABS(ABS(total) - ABS(%s)) < 0.01
        ORDER BY ABS(EXTRACT(EPOCH FROM (time - %s)))
        LIMIT 3
        """,
        (
            bill["party_store_id"],
            my_party,
            other_type,
            bill["time"] - timedelta(minutes=10),
            bill["time"] + timedelta(minutes=10),
            float(bill["total"] or 0),
            bill["time"],
        ),
    )
    return [_jsonable(dict(r)) for r in cur.fetchall()]


def _bill_snapshot(cur, store_id: int, bill_id: int) -> Optional[dict]:
    bill = _load_bill(cur, store_id, bill_id)
    if not bill:
        return None
    return _jsonable(
        {
            "store_id": store_id,
            "bill_id": bill_id,
            "type": bill["type"],
            "time": bill["time"],
            "party_id": bill["party_id"],
            "party_name": bill["party_name"],
            "discount": float(bill["discount"] or 0),
            "total": float(bill["total"] or 0),
            "payments": bill["payments"],
            "lines": [
                {
                    "flow_id": l["flow_id"],
                    "product_id": l["product_id"],
                    "name": l["name"],
                    "quantity": abs(int(l["amount"] or 0)),
                    "wholesale_price": float(l["wholesale_price"] or 0),
                    "price": float(l["price"] or 0),
                }
                for l in _load_lines(cur, store_id, bill_id)
            ],
        }
    )


def _state_token(snapshots: List[Optional[dict]]) -> str:
    return hashlib.sha256(
        json.dumps(snapshots, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Locking
# ---------------------------------------------------------------------------

LOCK_NAMESPACE = 781_234


def _lock_stores(cur, stores) -> None:
    """Serialize corrections per store and take locks in the same order a sale
    does (the store's newest cash row first), so a correction and a live sale
    queue instead of deadlocking. Fails fast instead of hanging."""
    cur.execute("SET LOCAL lock_timeout = '5s'")
    cur.execute("SET LOCAL statement_timeout = '120s'")
    for store_id in sorted({s for s in stores if s is not None}):
        cur.execute("SELECT pg_advisory_xact_lock(%s, %s)", (LOCK_NAMESPACE, int(store_id)))
        cur.execute(
            # The row a new sale's running-total trigger locks (NULL times
            # sort first in DESC and are never picked by it).
            "SELECT id FROM cash_flow WHERE store_id = %s AND time IS NOT NULL ORDER BY time DESC, id DESC LIMIT 1 FOR UPDATE",
            (store_id,),
        )


def _home_stores(cur, payments) -> set:
    mids = [e.get("method_id") if isinstance(e, dict) else e.method_id for e in (payments or [])]
    mids = [m for m in mids if m]
    if not mids:
        return set()
    cur.execute("SELECT home_store_id FROM payment_methods WHERE id = ANY(%s) AND home_store_id IS NOT NULL", (mids,))
    return {int(r["home_store_id"]) for r in cur.fetchall()}


def _scope_stores(cur, store_id: int, bill_id: int, extra_payments=None) -> set:
    """Every store a correction of this bill can touch, known before locking."""
    stores = {store_id}
    pair = _find_pair(cur, store_id, bill_id)
    if pair:
        stores.add(pair["store_id"])
    cur.execute("SELECT payments FROM bills WHERE id = %s AND store_id = %s", (bill_id, store_id))
    r = cur.fetchone()
    stores |= _home_stores(cur, r["payments"] if r else None)
    stores |= _home_stores(cur, extra_payments)
    return stores


def _lock_stock(cur, keys: List[tuple]) -> None:
    if keys:
        cur.execute(
            """
            SELECT 1 FROM product_inventory
            WHERE (store_id, product_id) IN %s
            ORDER BY store_id, product_id
            FOR UPDATE
            """,
            (tuple(keys),),
        )


# ---------------------------------------------------------------------------
# Cash helpers (all changes go through UPDATE so the existing triggers keep
# the running totals and the accounts ledger right)
# ---------------------------------------------------------------------------


def _remirror_cash_row(cur, cf_id: int, store_id: int) -> None:
    """Same split as mirror_cash_flow_to_accounts, for a row whose amount did
    not change (e.g. only the bill's payments did)."""
    cur.execute(
        "SELECT id, store_id, amount, time, bill_id, payment_method_id FROM cash_flow WHERE id = %s AND store_id = %s",
        (cf_id, store_id),
    )
    row = cur.fetchone()
    cur.execute(
        "DELETE FROM account_transactions WHERE cash_flow_id = %s AND store_id = %s",
        (cf_id, store_id),
    )
    if not row or abs(float(row["amount"] or 0)) < 1e-9:
        return
    amount = float(row["amount"])
    cur.execute(
        "SELECT id FROM payment_methods WHERE is_deleted = FALSE ORDER BY is_default DESC, id ASC LIMIT 1"
    )
    d = cur.fetchone()
    default_mid = d["id"] if d else None

    payments = None
    if row["bill_id"] is not None:
        cur.execute(
            "SELECT payments FROM bills WHERE id = %s AND store_id = %s",
            (row["bill_id"], store_id),
        )
        b = cur.fetchone()
        payments = b["payments"] if b else None

    if isinstance(payments, list) and payments:
        total = sum(float(e.get("amount") or 0) for e in payments)
        if total > 0:
            for e in payments:
                mid = e.get("method_id") or default_mid
                cur.execute(
                    """
                    INSERT INTO account_transactions
                        (store_id, payment_method_id, cash_flow_id, amount, source, time)
                    VALUES (%s, %s, %s, %s, 'bill', %s)
                    """,
                    (store_id, mid, cf_id, amount * float(e.get("amount") or 0) / total, row["time"]),
                )
            return

    mid = row["payment_method_id"] or default_mid
    if mid is not None:
        cur.execute(
            """
            INSERT INTO account_transactions
                (store_id, payment_method_id, cash_flow_id, amount, source, time)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (store_id, mid, cf_id, amount, "bill" if row["bill_id"] is not None else "manual", row["time"]),
        )


def _set_cash_amount(cur, cf_id: int, store_id: int, amount: float) -> None:
    # A changed amount fires the bubble fix (running totals) and the mirror.
    cur.execute(
        "UPDATE cash_flow SET amount = %s WHERE id = %s AND store_id = %s AND amount IS DISTINCT FROM %s",
        (amount, cf_id, store_id, amount),
    )


def _insert_cash_row(cur, store_id, time, amount, type_, description, party_id, method_id, bill_id=None) -> int:
    # Insert at zero, then set the amount: a back-dated insert alone would not
    # fix the running totals of the rows after it, the update does.
    cur.execute(
        """
        INSERT INTO cash_flow (store_id, time, amount, type, bill_id, description, party_id, payment_method_id)
        VALUES (%s, %s, 0, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (store_id, time, type_, bill_id, description, party_id, method_id),
    )
    cf_id = cur.fetchone()["id"]
    _set_cash_amount(cur, cf_id, store_id, amount)
    return cf_id


def _delete_cash_row(cur, cf_id: int, store_id: int) -> None:
    # Zero first so the later running totals are fixed by the update trigger
    # (not every install has an after-delete one); the ledger rows cascade.
    _set_cash_amount(cur, cf_id, store_id, 0)
    cur.execute("DELETE FROM cash_flow WHERE id = %s AND store_id = %s", (cf_id, store_id))


# ---------------------------------------------------------------------------
# Impact measurement
# ---------------------------------------------------------------------------


def _measure(cur, stores: List[int], stock_keys: List[tuple]) -> dict:
    cur.execute(
        "SELECT store_id, COALESCE(SUM(amount), 0) AS cash FROM cash_flow WHERE store_id = ANY(%s) GROUP BY store_id",
        (stores,),
    )
    cash = {int(r["store_id"]): float(r["cash"]) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT at.store_id, at.payment_method_id, pm.name, COALESCE(SUM(at.amount), 0) AS bal
        FROM account_transactions at
        JOIN payment_methods pm ON pm.id = at.payment_method_id
        WHERE at.store_id = ANY(%s)
        GROUP BY at.store_id, at.payment_method_id, pm.name
        """,
        (stores,),
    )
    accounts = {
        (int(r["store_id"]), int(r["payment_method_id"])): (r["name"], float(r["bal"]))
        for r in cur.fetchall()
    }

    # Inter-store balance, same expression as /store-balances.
    interstore = {}
    for s in stores:
        cur.execute(
            """
            SELECT sd.id AS other, COALESCE(SUM(cf.amount), 0) AS balance
            FROM store_data sd
            JOIN assosiated_parties ap ON ap.extra_info->>'store_id' = sd.id::text
            LEFT JOIN cash_flow cf ON cf.store_id = %s AND cf.party_id = ap.id AND cf.bill_id IS NULL
            WHERE sd.id <> %s
            GROUP BY sd.id
            """,
            (s, s),
        )
        for r in cur.fetchall():
            interstore[(s, int(r["other"]))] = float(r["balance"])

    stock = {}
    for store_id, product_id in stock_keys:
        cur.execute(
            "SELECT stock FROM product_inventory WHERE store_id = %s AND product_id = %s",
            (store_id, product_id),
        )
        r = cur.fetchone()
        stock[(store_id, product_id)] = int(r["stock"]) if r and r["stock"] is not None else 0

    return {"cash": cash, "accounts": accounts, "interstore": interstore, "stock": stock}


def _diff_impact(cur, before: dict, after: dict) -> dict:
    names = _store_names(cur)
    pids = sorted({k[1] for k in after["stock"]})
    pnames = {}
    if pids:
        cur.execute("SELECT id, name FROM products WHERE id = ANY(%s)", (pids,))
        pnames = {int(r["id"]): r["name"] for r in cur.fetchall()}

    def changed(a, b):
        return abs((a or 0) - (b or 0)) > EPS

    return {
        "cash": [
            {"store_id": s, "store_name": names.get(s), "before": _r2(before["cash"].get(s, 0)), "after": _r2(after["cash"].get(s, 0))}
            for s in sorted(set(before["cash"]) | set(after["cash"]))
            if changed(before["cash"].get(s), after["cash"].get(s))
        ],
        "accounts": [
            {
                "store_id": k[0],
                "store_name": names.get(k[0]),
                "method_id": k[1],
                "method_name": (after["accounts"].get(k) or before["accounts"].get(k))[0],
                "before": _r2((before["accounts"].get(k) or (None, 0))[1]),
                "after": _r2((after["accounts"].get(k) or (None, 0))[1]),
            }
            for k in sorted(set(before["accounts"]) | set(after["accounts"]))
            if changed((before["accounts"].get(k) or (None, 0))[1], (after["accounts"].get(k) or (None, 0))[1])
        ],
        "interstore": [
            {
                "store_id": k[0],
                "store_name": names.get(k[0]),
                "other_store_id": k[1],
                "other_store_name": names.get(k[1]),
                "before": _r2(before["interstore"].get(k, 0)),
                "after": _r2(after["interstore"].get(k, 0)),
            }
            for k in sorted(set(before["interstore"]) | set(after["interstore"]))
            if changed(before["interstore"].get(k), after["interstore"].get(k))
        ],
        "stock": [
            {
                "store_id": k[0],
                "store_name": names.get(k[0]),
                "product_id": k[1],
                "name": pnames.get(k[1]),
                "before": before["stock"].get(k, 0),
                "after": after["stock"].get(k, 0),
            }
            for k in sorted(after["stock"])
            if before["stock"].get(k, 0) != after["stock"].get(k, 0)
        ],
    }


# ---------------------------------------------------------------------------
# Bill rewrite
# ---------------------------------------------------------------------------


def _bill_total(btype: str, lines: List[CorrectionLine], discount: float) -> float:
    if btype in ("sell", "return"):
        gross = sum(l.quantity * l.price for l in lines)
    else:
        gross = sum(l.quantity * l.wholesale_price for l in lines)
    return max(round(gross - discount, 2), 0.0)


def _rescale_payments(old, total_abs: float):
    if total_abs <= 0:
        return None
    if not isinstance(old, list) or not old:
        return None
    s = sum(float(e.get("amount") or 0) for e in old)
    if s <= 0:
        return None
    out, acc = [], 0.0
    for i, e in enumerate(old):
        amt = round(total_abs - acc, 2) if i == len(old) - 1 else round(float(e.get("amount") or 0) * total_abs / s, 2)
        acc += amt
        out.append({"method_id": e.get("method_id"), "name": e.get("name"), "amount": amt})
    return out


def _build_payments(cur, payments: List[CorrectionPayment], total_abs: float):
    lines = [p for p in payments if (p.amount or 0) > 0]
    if total_abs <= 0:
        return None
    if not lines:
        return None
    if abs(sum(p.amount for p in lines) - total_abs) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"مجموع طرق الدفع ({sum(p.amount for p in lines):.2f}) لا يساوي إجمالي الفاتورة ({total_abs:.2f})",
        )
    ids = [p.method_id for p in lines if p.method_id]
    names = {}
    if ids:
        cur.execute("SELECT id, name FROM payment_methods WHERE id = ANY(%s)", (ids,))
        names = {int(r["id"]): r["name"] for r in cur.fetchall()}
        missing = set(ids) - set(names)
        if missing:
            raise HTTPException(status_code=400, detail="طريقة دفع غير موجودة")
    return [{"method_id": p.method_id, "name": names.get(p.method_id), "amount": _r2(p.amount)} for p in lines]


def _validate_lines(lines: List[CorrectionLine]) -> None:
    for l in lines:
        if l.quantity <= 0:
            raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
        if l.wholesale_price < 0 or l.price < 0:
            raise HTTPException(status_code=400, detail="الأسعار لا يمكن أن تكون سالبة")


def _rewrite_lines(cur, bill: dict, old_lines: List[dict], new_lines: List[CorrectionLine], stock_delta: Dict[tuple, int]) -> List[dict]:
    """Make the bill's products_flow rows equal new_lines. Returns the cost
    changes on kept rows: [{product_id, old_cost, new_cost, old_price, new_price}]."""
    store_id, bill_id, btype = bill["store_id"], bill["id"], bill["type"]
    sign = AMOUNT_SIGN[btype]
    old_by_id = {l["flow_id"]: l for l in old_lines}
    kept, inserts, cost_changes = set(), [], []

    for nl in new_lines:
        amount = sign * nl.quantity
        old = old_by_id.get(nl.flow_id) if nl.flow_id else None
        if old and old["product_id"] == nl.product_id and nl.flow_id not in kept:
            kept.add(nl.flow_id)
            cur.execute(
                """
                UPDATE products_flow SET amount = %s, wholesale_price = %s, price = %s
                WHERE id = %s AND store_id = %s
                """,
                (amount, nl.wholesale_price, nl.price, nl.flow_id, store_id),
            )
            ow, op = float(old["wholesale_price"] or 0), float(old["price"] or 0)
            if abs(ow - nl.wholesale_price) > 1e-9 or abs(op - nl.price) > 1e-9:
                cost_changes.append(
                    {"product_id": nl.product_id, "old_cost": ow, "new_cost": nl.wholesale_price, "old_price": op, "new_price": nl.price}
                )
        else:
            inserts.append((nl, amount))
        stock_delta[(store_id, nl.product_id)] = stock_delta.get((store_id, nl.product_id), 0) + amount

    for old in old_lines:
        stock_delta[(store_id, old["product_id"])] = stock_delta.get((store_id, old["product_id"]), 0) - int(old["amount"] or 0)
    dropped = [fid for fid in old_by_id if fid not in kept]
    if dropped:
        cur.execute(
            "DELETE FROM products_flow WHERE id = ANY(%s) AND store_id = %s",
            (dropped, store_id),
        )

    if inserts:
        pids = list({nl.product_id for nl, _ in inserts})
        cur.execute("SELECT id, wholesale_price, price FROM products WHERE id = ANY(%s) ORDER BY id FOR UPDATE", (pids,))
        prices = {int(r["id"]): (r["wholesale_price"], r["price"]) for r in cur.fetchall()}
        if len(prices) != len(pids):
            raise HTTPException(status_code=400, detail="منتج غير موجود")
        for nl, amount in inserts:
            cur.execute(
                """
                INSERT INTO products_flow (store_id, bill_id, product_id, amount, wholesale_price, price, time)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (store_id, bill_id, nl.product_id, amount, nl.wholesale_price, nl.price, bill["time"]),
            )
        # A buy-line insert re-prices the product; a correction must not.
        if btype == "buy":
            for pid, (w, p) in prices.items():
                cur.execute("UPDATE products SET wholesale_price = %s, price = %s WHERE id = %s", (w, p, pid))

    return cost_changes


def _write_bill_money(cur, bill: dict, total_abs: float, discount: float, payments) -> None:
    store_id, bill_id, btype = bill["store_id"], bill["id"], bill["type"]
    stored_total = TOTAL_SIGN[btype] * total_abs
    # One UPDATE so the cash trigger's mirror sees the new split.
    cur.execute(
        "UPDATE bills SET discount = %s, total = %s, payments = %s WHERE id = %s AND store_id = %s",
        (discount, stored_total, Json(payments) if payments is not None else None, bill_id, store_id),
    )
    cur.execute(
        "SELECT id FROM cash_flow WHERE bill_id = %s AND store_id = %s ORDER BY id",
        (bill_id, store_id),
    )
    rows = [r["id"] for r in cur.fetchall()]
    if not rows and abs(stored_total) > EPS:
        _insert_cash_row(
            cur, store_id, bill["time"], stored_total, CASH_TYPE[btype], CASH_DESC[btype],
            bill["party_id"], None, bill_id,
        )
        return
    for cf_id in rows:
        # Bills with a stale/NULL total never fired the trigger; set it here.
        _set_cash_amount(cur, cf_id, store_id, stored_total)
        _remirror_cash_row(cur, cf_id, store_id)


def _recompute_flow_totals(cur, keys: List[tuple]) -> None:
    for store_id, product_id in keys:
        cur.execute(
            """
            UPDATE products_flow pf SET total = s.rt
            FROM (
                SELECT id, SUM(amount) OVER (ORDER BY time, id) AS rt
                FROM products_flow
                WHERE store_id = %s AND product_id = %s
            ) s
            WHERE pf.id = s.id AND pf.store_id = %s AND pf.total IS DISTINCT FROM s.rt
            """,
            (store_id, product_id, store_id),
        )


def _apply_stock(cur, stock_before: Dict[tuple, int], stock_delta: Dict[tuple, int]) -> None:
    for key, delta in stock_delta.items():
        store_id, product_id = key
        new_stock = stock_before.get(key, 0) + delta
        cur.execute(
            """
            INSERT INTO product_inventory (store_id, product_id, stock)
            VALUES (%s, %s, %s)
            ON CONFLICT (store_id, product_id) DO UPDATE SET stock = EXCLUDED.stock
            """,
            (store_id, product_id, new_stock),
        )


def _apply_batches(cur, bill: dict, old_rows: List[dict], new_lines: List[CorrectionLine]) -> List[int]:
    """Expiry batches as the bill flow would have left them: sells and
    buy-returns consume earliest-expiring first; buys and returns without
    expiry info don't create batches. Products without batches stay without."""
    store_id, btype = bill["store_id"], bill["type"]
    sign = AMOUNT_SIGN[btype]
    delta: Dict[int, int] = {}
    for l in new_lines:
        delta[l.product_id] = delta.get(l.product_id, 0) + sign * l.quantity
    for r in old_rows:
        delta[r["product_id"]] = delta.get(r["product_id"], 0) - int(r["amount"] or 0)
    untracked = []
    for pid, d in delta.items():
        if d == 0:
            continue
        if d > 0 and btype in ("buy", "return"):
            # No expiry info on a correction: a product tracked by expiry
            # gets no batch for the extra quantity.
            cur.execute("SELECT 1 FROM product_batches WHERE store_id = %s AND product_id = %s LIMIT 1", (store_id, pid))
            if cur.fetchone():
                untracked.append(pid)
            continue
        if d < 0:
            # More went out (or less came in): take it from the batches.
            consume_batches_fefo(cur, store_id, pid, -d, None)
            continue
        if btype in ("sell", "buy-return"):
            # Less went out: give it back to the batch it was taken from first.
            cur.execute(
                """
                SELECT id, expiration_date FROM product_batches
                WHERE store_id = %s AND product_id = %s
                ORDER BY expiration_date ASC NULLS LAST, id ASC
                LIMIT 1
                """,
                (store_id, pid),
            )
            r = cur.fetchone()
            if r and r["expiration_date"] is not None:
                add_to_batch(cur, store_id, pid, d, str(r["expiration_date"]))
            elif r:
                # NULL expiry never matches add_to_batch's ON CONFLICT.
                cur.execute("UPDATE product_batches SET quantity = quantity + %s WHERE id = %s", (d, r["id"]))
    return untracked


def _settle_rows(cur, src: dict, dst: dict) -> List[dict]:
    """Settle-from-debt rows of a transfer (src pays out, dst receives),
    matched exactly: the transfer's time, both directions, the old amount."""
    amount = abs(float(src["total"] or 0))
    rows = []
    for store, other, sign in ((src["store_id"], dst["store_id"], -1), (dst["store_id"], src["store_id"], 1)):
        cur.execute(
            """
            SELECT id, store_id, amount FROM cash_flow
            WHERE bill_id IS NULL AND description = %s AND time = %s
              AND store_id = %s AND party_id = %s AND ABS(amount - %s) < 0.005
            ORDER BY id
            """,
            (SETTLE_DESC, src["time"], store, _store_party_id(cur, other), sign * amount),
        )
        found = cur.fetchall()
        if len(found) > 1:
            raise HTTPException(status_code=409, detail="تعذّر تحديد حركة تسوية النقل بدقة (أكثر من حركة مطابقة). لا يمكن تصحيح هذه الفاتورة تلقائياً.")
        rows += [dict(r) for r in found]
    return rows


def _forward_rows(cur, bill: dict) -> Dict[tuple, dict]:
    """Off-store payment forwarding rows of a sell/return bill, matched exactly
    from its current payments: same time, account, direction and amount.
    Returns {(method_id, store_id): row}."""
    out: Dict[tuple, dict] = {}
    if bill["type"] not in ("sell", "return") or not isinstance(bill["payments"], list):
        return out
    per_method: Dict[int, float] = {}
    for e in bill["payments"]:
        if e.get("method_id") and float(e.get("amount") or 0) > 0:
            per_method[e["method_id"]] = per_method.get(e["method_id"], 0.0) + float(e["amount"])
    if not per_method:
        return out
    cur.execute("SELECT id, home_store_id FROM payment_methods WHERE id = ANY(%s)", (list(per_method),))
    homes = {int(r["id"]): r["home_store_id"] for r in cur.fetchall()}
    me = bill["store_id"]
    for mid, amt in per_method.items():
        home = homes.get(mid)
        if home is None or home == me:
            continue
        payer, payee = (me, home) if bill["type"] == "sell" else (home, me)
        for store, other, sign in ((payer, payee, -1), (payee, payer, 1)):
            cur.execute(
                """
                SELECT id, store_id, amount FROM cash_flow
                WHERE bill_id IS NULL AND time = %s AND store_id = %s AND party_id = %s
                  AND payment_method_id = %s AND ABS(amount - %s) < 0.005
                  AND (description LIKE 'تحصيل (%%) لحساب متجر آخر' OR description LIKE 'رد (%%) من حساب متجر آخر')
                ORDER BY id
                """,
                (bill["time"], store, _store_party_id(cur, other), mid, sign * amt),
            )
            found = cur.fetchall()
            if len(found) > 1:
                raise HTTPException(status_code=409, detail="تعذّر تحديد حركة تحويل الدفع لمتجر آخر بدقة (أكثر من حركة مطابقة). لا يمكن تصحيح هذه الفاتورة تلقائياً.")
            if found:
                out[(mid, store)] = dict(found[0])
    return out


def _sync_forwarding(cur, bill: dict, existing: Dict[tuple, dict], payments) -> List[dict]:
    """Make the off-store forwarding rows match the bill's (new) payments."""
    if bill["type"] not in ("sell", "return"):
        return []
    desired: Dict[int, tuple] = {}  # method -> (home_store, amount, name)
    if isinstance(payments, list):
        mids = [e.get("method_id") for e in payments if e.get("method_id")]
        homes = {}
        if mids:
            cur.execute("SELECT id, home_store_id FROM payment_methods WHERE id = ANY(%s)", (mids,))
            homes = {int(r["id"]): r["home_store_id"] for r in cur.fetchall()}
        for e in payments:
            mid = e.get("method_id")
            home = homes.get(mid)
            amt = float(e.get("amount") or 0)
            if mid and home is not None and home != bill["store_id"] and amt > 0:
                h, a_, n = desired.get(mid, (home, 0.0, e.get("name") or ""))
                desired[mid] = (h, a_ + amt, n)

    changes = []
    me = bill["store_id"]
    for mid in {k[0] for k in existing} | set(desired):
        home, amt, name = desired.get(mid, (None, 0.0, ""))
        if home is None:
            home = next((st for (m, st) in existing if m == mid and st != me), None)
        if home is None:
            continue
        payer, payee = (me, home) if bill["type"] == "sell" else (home, me)
        for store, target in ((payer, -amt), (payee, amt)):
            row = existing.get((mid, store))
            if row and amt <= 0:
                _delete_cash_row(cur, row["id"], store)
            elif row:
                _set_cash_amount(cur, row["id"], store, target)
            elif amt > 0:
                other = home if store == me else me
                desc = (f"تحصيل ({name}) لحساب متجر آخر" if bill["type"] == "sell" else f"رد ({name}) من حساب متجر آخر")
                _insert_cash_row(cur, store, bill["time"], target, "out" if target < 0 else "in", desc,
                                 _store_party_id(cur, other), mid)
            changes.append({"store_id": store, "method_id": mid, "before": _r2(row["amount"]) if row else 0, "after": _r2(target if amt > 0 else 0)})
    return changes


def _events_from_rows(rows: List[dict]) -> Dict[int, tuple]:
    """The price a buy bill sets per product: its last line with a cost (the
    price trigger applies lines in insert order, so the last one wins)."""
    out = {}
    for r in sorted(rows, key=lambda r: r["flow_id"]):
        if float(r["wholesale_price"] or 0) > 0:
            out[r["product_id"]] = (float(r["wholesale_price"]), float(r["price"] or 0))
    return out


def _events_from_lines(lines: List[CorrectionLine]) -> Dict[int, tuple]:
    out = {}
    for l in lines:
        if l.wholesale_price > 0:
            out[l.product_id] = (float(l.wholesale_price), float(l.price))
    return out


def _cascade_prices(cur, buy_bill: dict, old_events: Dict[int, tuple], new_events: Dict[int, tuple], exclude: List[tuple]) -> dict:
    """Rewrite the product's price history as if the buy had always been the
    corrected one (or, deleted, had never happened).

    A buy sets the product's shared cost/price from its time until the next
    price-setting buy (any store). For each product whose set price changes
    -- including a line added or removed, where "no line" means the previous
    buy's price simply carries on -- the lines recorded in that window with
    the old cost get the new one, and the product's current price follows
    when no later buy replaced it. Transfers and buy-returns carry the cost
    into money, so they are reported, not changed."""
    done, skipped, price_updates, unknown = [], [], [], []
    pids = sorted(set(old_events) | set(new_events))
    names = {}
    if pids:
        cur.execute("SELECT id, name FROM products WHERE id = ANY(%s)", (pids,))
        names = {int(r["id"]): r["name"] for r in cur.fetchall()}
    for pid in pids:
        old, new = old_events.get(pid), new_events.get(pid)
        if old == new:
            continue
        if old is None or new is None:
            # Line added/removed: the price before this bill carries on.
            cur.execute(
                """
                SELECT pf.wholesale_price, pf.price
                FROM products_flow pf
                JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
                WHERE pf.product_id = %s AND b.type = 'buy' AND b.id > 0
                  AND pf.wholesale_price > 0 AND b.time <= %s
                  AND (b.id, b.store_id) NOT IN %s
                ORDER BY b.time DESC, pf.id DESC
                LIMIT 1
                """,
                (pid, buy_bill["time"], tuple(exclude)),
            )
            r = cur.fetchone()
            prev = (float(r["wholesale_price"]), float(r["price"] or 0)) if r else None
            old, new = old or prev, new or prev
            if old is None or new is None:
                unknown.append({"product_id": pid})
                continue
            if old == new:
                continue

        cur.execute(
            """
            SELECT MIN(b.time) AS t
            FROM products_flow pf
            JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
            WHERE pf.product_id = %s AND b.type = 'buy' AND b.id > 0
              AND pf.wholesale_price > 0 AND b.time > %s
              AND (b.id, b.store_id) NOT IN %s
            """,
            (pid, buy_bill["time"], tuple(exclude)),
        )
        until = cur.fetchone()["t"]
        (old_cost, old_price), (new_cost, new_price) = old, new

        if until is not None and abs(old_cost - new_cost) > 1e-9:
            # A transfer that copied the old cost is the next price point:
            # the fix stops there until that transfer is corrected too.
            cur.execute(
                """
                SELECT DISTINCT b.id, b.store_id, b.type
                FROM products_flow pf
                JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
                JOIN assosiated_parties ap ON ap.id = b.party_id
                WHERE pf.product_id = %s AND b.time = %s AND b.type = 'buy'
                  AND ap.type = 'store' AND ABS(pf.wholesale_price - %s) < 1e-6
                  AND (b.id, b.store_id) NOT IN %s
                """,
                (pid, until, old_cost, tuple(exclude)),
            )
            skipped += [
                {"product_id": pid, "store_id": r["store_id"], "bill_id": r["id"], "type": r["type"], "transfer": True}
                for r in cur.fetchall()
            ]

        if abs(old_cost - new_cost) > 1e-9:
            cur.execute(
                """
                SELECT pf.id, pf.store_id, b.id AS bill_id, b.type, ap.type AS party_type
                FROM products_flow pf
                JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
                LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
                WHERE pf.product_id = %s
                  AND ABS(pf.wholesale_price - %s) < 1e-6
                  AND COALESCE(b.time, pf.time) > %s
                  AND (%s::timestamp IS NULL OR COALESCE(b.time, pf.time) < %s::timestamp)
                  AND pf.bill_id >= -1
                  AND (b.id, b.store_id) NOT IN %s
                """,
                (pid, old_cost, buy_bill["time"], until, until, tuple(exclude)),
            )
            rows = cur.fetchall()
            fix = [
                r for r in rows
                if r["type"] in ("sell", "return", "BNPL", "installment", "reserve", None)
                and r["party_type"] != "store"
            ]
            hold = [r for r in rows if r not in fix]
            for r in fix:
                cur.execute(
                    "UPDATE products_flow SET wholesale_price = %s WHERE id = %s AND store_id = %s",
                    (new_cost, r["id"], r["store_id"]),
                )
            done.append({
                "product_id": pid, "name": names.get(pid), "old_cost": old_cost, "new_cost": new_cost,
                "until": until, "rows": [[r["store_id"], r["id"]] for r in fix],
            })
            skipped += [
                {"product_id": pid, "store_id": r["store_id"], "bill_id": r["bill_id"], "type": r["type"],
                 "transfer": r["party_type"] == "store"}
                for r in hold
            ]

        if until is None:
            cur.execute("SELECT wholesale_price, price FROM products WHERE id = %s", (pid,))
            p = cur.fetchone()
            cur_w, cur_p = float(p["wholesale_price"] or 0), float(p["price"] or 0)
            # Only what this buy set; a later products-page edit stays.
            new_w = new_cost if abs(cur_w - old_cost) < 1e-9 else cur_w
            new_p = new_price if abs(cur_p - old_price) < 1e-9 else cur_p
            if abs(new_w - cur_w) > 1e-9 or abs(new_p - cur_p) > 1e-9:
                cur.execute("UPDATE products SET wholesale_price = %s, price = %s WHERE id = %s", (new_w, new_p, pid))
                price_updates.append({
                    "product_id": pid, "name": names.get(pid), "old_cost": cur_w, "new_cost": new_w,
                    "old_price": cur_p, "new_price": new_p,
                })
    return {"done": done, "skipped": skipped, "price_updates": price_updates, "unknown": unknown}


def _derive_pair_lines(cur, side_bill: dict, side_lines: List[CorrectionLine], pair_bill: dict, pair_old: List[dict]) -> List[CorrectionLine]:
    """A transfer's two sides carry the same products, quantities and cost.
    The source (sell) side is priced at cost; the destination (buy) side keeps
    its own selling price."""
    pool: Dict[int, List[dict]] = {}
    for l in pair_old:
        pool.setdefault(l["product_id"], []).append(l)
    out = []
    for l in side_lines:
        prev = pool.get(l.product_id, [])
        old = prev.pop(0) if prev else None
        if pair_bill["type"] == "sell":
            price = l.wholesale_price
        elif old is not None:
            price = float(old["price"] or 0)
        else:
            cur.execute("SELECT price FROM products WHERE id = %s", (l.product_id,))
            r = cur.fetchone()
            price = float(r["price"] or 0) if r else 0.0
        out.append(CorrectionLine(
            flow_id=old["flow_id"] if old else None,
            product_id=l.product_id,
            quantity=l.quantity,
            wholesale_price=l.wholesale_price,
            price=price,
        ))
    return out


def _run(cur, req: CorrectionRequest, *, pair_side: Optional[_Side] = None, main_payments_raw=None) -> dict:
    """The whole correction, inside the caller's transaction. Returns
    {before, after, impact, token}."""
    if req.bill_id <= 0:
        raise HTTPException(status_code=400, detail="لا يمكن تصحيح هذه الفاتورة")
    _lock_stores(cur, _scope_stores(cur, req.store_id, req.bill_id, req.payments))
    bill = _load_bill(cur, req.store_id, req.bill_id, lock=True)
    if not bill:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    if bill["time"] is None:
        raise HTTPException(status_code=400, detail="الفاتورة بدون تاريخ ولا يمكن تصحيحها")
    if bill["type"] not in CORRECTABLE_TYPES:
        raise HTTPException(status_code=400, detail="هذا النوع من الفواتير غير مدعوم في التصحيح (بيع، شراء، مرتجع، مرتجع شراء فقط)")

    pair_ref = _find_pair(cur, req.store_id, req.bill_id)
    pair = _load_bill(cur, pair_ref["store_id"], pair_ref["bill_id"], lock=True) if pair_ref else None
    if pair and {bill["type"], pair["type"]} != {"sell", "buy"}:
        raise HTTPException(status_code=400, detail="فاتورة مرتبطة غير متوقعة")

    before_snaps = [_bill_snapshot(cur, req.store_id, req.bill_id)]
    if pair:
        before_snaps.append(_bill_snapshot(cur, pair["store_id"], pair["id"]))
    token = _state_token(before_snaps)
    if req.state_token and req.state_token != token:
        raise HTTPException(status_code=409, detail="تغيّرت الفاتورة منذ تحميلها أو معاينتها. أعد تحميل الفاتورة.")

    if req.set_party and req.action == "edit" and set_bill_party(cur, req.store_id, req.bill_id, req.party_id):
        bill = _load_bill(cur, req.store_id, req.bill_id)

    old_lines = _load_lines(cur, req.store_id, req.bill_id)
    pair_old = _load_lines(cur, pair["store_id"], pair["id"]) if pair else []

    deleting = req.action == "delete"
    lines = [] if deleting else list(req.lines)
    if not deleting:
        _validate_lines(lines)
        if not lines:
            raise HTTPException(status_code=400, detail="الفاتورة بدون منتجات. استخدم حذف الفاتورة بدلاً من ذلك.")
    if pair and bill["type"] == "sell":
        # The source side of a transfer is priced at cost.
        lines = [CorrectionLine(**{**l.model_dump(), "price": l.wholesale_price}) for l in lines]

    discount = 0.0 if deleting else max(float(req.discount or 0), 0.0)
    if discount - _bill_total(bill["type"], lines, 0) > 0.01:
        raise HTTPException(status_code=400, detail="الخصم أكبر من إجمالي الفاتورة")
    total_abs = _bill_total(bill["type"], lines, discount)

    if pair:
        pair_lines = pair_side.lines if pair_side else _derive_pair_lines(cur, bill, lines, pair, pair_old)
        pair_discount = pair_side.discount if pair_side else discount
        pair_total_abs = _bill_total(pair["type"], pair_lines, pair_discount)

    # Everything we will touch, measured before.
    is_transfer = bool(pair) or bill["party_type"] == "store"
    settle = []
    if pair:
        src, dst = (bill, pair) if bill["type"] == "sell" else (pair, bill)
        settle = _settle_rows(cur, src, dst)
    # Transfers never forward payments (move_products disables it).
    forwards = {} if is_transfer else _forward_rows(cur, bill)
    stores = {req.store_id} | ({pair["store_id"]} if pair else set())
    stores |= {r["store_id"] for r in settle} | {st for (_m, st) in forwards}
    stores |= _home_stores(cur, bill["payments"]) | _home_stores(cur, req.payments)
    stock_keys = sorted(
        {(req.store_id, l["product_id"]) for l in old_lines}
        | {(req.store_id, l.product_id) for l in lines}
        | ({(pair["store_id"], l["product_id"]) for l in pair_old} | {(pair["store_id"], l.product_id) for l in pair_lines} if pair else set())
    )
    _lock_stock(cur, stock_keys)
    measured_before = _measure(cur, sorted(stores), stock_keys)

    # Every correction rewrites the total from the lines; say so if the stored
    # total did not match them to begin with.
    stored_mismatch = []
    for b_, rows_ in ((bill, old_lines),) + (((pair, pair_old),) if pair else ()):
        from_lines = _bill_total(b_["type"], [
            CorrectionLine(product_id=r["product_id"], quantity=abs(int(r["amount"] or 0)),
                           wholesale_price=float(r["wholesale_price"] or 0), price=float(r["price"] or 0))
            for r in rows_
        ], float(b_["discount"] or 0))
        if abs(abs(float(b_["total"] or 0)) - from_lines) > 0.01:
            stored_mismatch.append({"store_id": b_["store_id"], "bill_id": b_["id"],
                                    "stored": abs(float(b_["total"] or 0)), "from_lines": from_lines})

    # --- rewrite lines + stock -------------------------------------------
    stock_delta: Dict[tuple, int] = {}
    _rewrite_lines(cur, bill, old_lines, lines, stock_delta)
    if pair:
        _rewrite_lines(cur, pair, pair_old, pair_lines, stock_delta)
    _apply_stock(cur, measured_before["stock"], stock_delta)
    untracked_batches = _apply_batches(cur, bill, old_lines, lines)
    if pair:
        untracked_batches += _apply_batches(cur, pair, pair_old, pair_lines)
    _recompute_flow_totals(cur, stock_keys)

    # --- money ------------------------------------------------------------
    if deleting:
        payments = None
    elif main_payments_raw is not None:
        payments = main_payments_raw or None
    elif req.payments is not None and not pair:
        payments = _build_payments(cur, req.payments, total_abs)
    else:
        payments = _rescale_payments(bill["payments"], total_abs)
    _write_bill_money(cur, bill, total_abs, discount, payments)

    if pair:
        pair_payments = (
            None if deleting
            else ((pair_side.payments or None) if pair_side and pair_side.payments is not None
                  else _rescale_payments(pair["payments"], pair_total_abs))
        )
        _write_bill_money(cur, pair, pair_total_abs, pair_discount, pair_payments)

    satellite_changes = []
    for r in settle:
        target = (-total_abs if r["store_id"] == (bill if bill["type"] == "sell" else pair)["store_id"] else total_abs)
        if deleting or total_abs <= 0:
            _delete_cash_row(cur, r["id"], r["store_id"])
            target = 0.0
        else:
            _set_cash_amount(cur, r["id"], r["store_id"], target)
        satellite_changes.append({"store_id": r["store_id"], "kind": "settle", "before": _r2(r["amount"]), "after": _r2(target)})
    if not is_transfer:
        satellite_changes += [{**c, "kind": "forward"} for c in _sync_forwarding(cur, bill, forwards, payments)]

    # --- delete the bill itself -------------------------------------------
    if deleting:
        for b in [bill] + ([pair] if pair else []):
            cur.execute("SELECT id FROM cash_flow WHERE bill_id = %s AND store_id = %s", (b["id"], b["store_id"]))
            for r in cur.fetchall():
                _delete_cash_row(cur, r["id"], b["store_id"])
            cur.execute("DELETE FROM bills_collections WHERE bill_id = %s AND store_id = %s", (b["id"], b["store_id"]))
            cur.execute("DELETE FROM reserved_products WHERE bill_id = %s AND store_id = %s", (b["id"], b["store_id"]))
            cur.execute(
                "DELETE FROM bills_pairs WHERE (left_bill_id = %s AND left_store_id = %s) OR (right_bill_id = %s AND right_store_id = %s)",
                (b["id"], b["store_id"], b["id"], b["store_id"]),
            )
            if b["id"] > 1:
                # The -<id> bill holds the history of earlier edits; it nets to zero.
                cur.execute("SELECT DISTINCT product_id FROM products_flow WHERE bill_id = %s AND store_id = %s", (-b["id"], b["store_id"]))
                backup_keys = [(b["store_id"], r["product_id"]) for r in cur.fetchall()]
                cur.execute("DELETE FROM products_flow WHERE bill_id = %s AND store_id = %s", (-b["id"], b["store_id"]))
                cur.execute("DELETE FROM bills WHERE id = %s AND store_id = %s", (-b["id"], b["store_id"]))
                _recompute_flow_totals(cur, backup_keys)
            cur.execute("DELETE FROM bills WHERE id = %s AND store_id = %s", (b["id"], b["store_id"]))

    # --- carry corrected costs forward -------------------------------------
    cascade = {"done": [], "skipped": [], "price_updates": [], "unknown": []}
    if req.cascade_costs:
        exclude = [(bill["id"], bill["store_id"])] + ([(pair["id"], pair["store_id"])] if pair else [])
        sides = [(bill, old_lines, lines)] + ([(pair, pair_old, pair_lines)] if pair else [])
        for b, before_rows, after_lines in sides:
            if b["type"] == "buy":
                part = _cascade_prices(cur, b, _events_from_rows(before_rows), _events_from_lines(after_lines), exclude)
                for k in cascade:
                    cascade[k] += part[k]

    measured_after = _measure(cur, sorted(stores), stock_keys)
    after_snaps = [_bill_snapshot(cur, req.store_id, req.bill_id)]
    if pair:
        after_snaps.append(_bill_snapshot(cur, pair["store_id"], pair["id"]))

    impact = _diff_impact(cur, measured_before, measured_after)
    impact["satellites"] = [s for s in satellite_changes if abs(s["before"] - s["after"]) > EPS]
    impact["cascade"] = _jsonable(cascade)
    warnings = []
    if not pair:
        candidates = _legacy_pair_candidates(cur, bill)
        if candidates:
            warnings.append({
                "kind": "legacy_transfer",
                "text": "هذه الفاتورة تبدو نقلاً بين المتاجر غير مرتبط بفاتورته المقابلة. صحّح الفاتورة المقابلة أيضاً بنفس الطريقة.",
                "bills": candidates,
            })
    if cascade["skipped"]:
        warnings.append({
            "kind": "cascade_skipped",
            "text": "فواتير لاحقة سجّلت التكلفة القديمة ولم تُعدَّل لأن التكلفة جزء من قيمتها (نقل بين المتاجر أو مرتجع شراء). صحّحها بشكل منفصل إن لزم.",
            "bills": cascade["skipped"],
        })
    if cascade["unknown"]:
        warnings.append({
            "kind": "price_unknown",
            "text": "لا يوجد سعر شراء سابق معروف لبعض المنتجات قبل هذه الفاتورة، فلم يتغير سعرها ولا الفواتير اللاحقة لها.",
            "bills": cascade["unknown"],
        })
    if stored_mismatch:
        warnings.append({
            "kind": "total_mismatch",
            "text": "الإجمالي المسجّل للفاتورة لم يكن مطابقاً لمجموع منتجاتها؛ بعد التصحيح يصبح الإجمالي = مجموع المنتجات - الخصم.",
            "bills": stored_mismatch,
        })
    if untracked_batches:
        warnings.append({
            "kind": "batches_untracked",
            "text": "منتجات لها تواريخ صلاحية زادت كميتها بدون تحديد تاريخ صلاحية؛ لن تُضاف لدفعات الصلاحية.",
            "bills": [{"product_id": p} for p in untracked_batches],
        })
    negative = [s for s in impact["stock"] if s["after"] < 0]
    if negative:
        warnings.append({"kind": "negative_stock", "text": "سيصبح المخزون بالسالب لبعض المنتجات.", "bills": negative})
    impact["warnings"] = _jsonable(warnings)

    return {
        "before": before_snaps,
        "after": [s for s in after_snaps if s],
        "pair": _jsonable(pair_ref),
        "impact": impact,
        "token": token,
        "cascade_raw": cascade,
    }


def _compact_impact(impact: dict) -> dict:
    """The rewritten line ids are kept once, in after.cascade (for revert)."""
    out = json.loads(json.dumps(impact, default=str))
    for d in out.get("cascade", {}).get("done", []):
        d["rows"] = len(d.get("rows") or [])
    return out


def _log(cur, user: dict, action: str, req_store: int, req_bill: int, result: dict, note: Optional[str], reverts_id: Optional[int] = None) -> int:
    pair = result.get("pair") or {}
    cur.execute(
        """
        INSERT INTO bill_corrections
            (user_id, username, action, store_id, bill_id, pair_store_id, pair_bill_id,
             note, before, after, impact, reverts_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            user.get("id"), user.get("username"), action, req_store, req_bill,
            pair.get("store_id"), pair.get("bill_id"), note,
            Json(_jsonable({"bills": result["before"]})),
            Json(_jsonable({"bills": result["after"], "cascade": result["cascade_raw"]})),
            Json(_compact_impact(result["impact"])), reverts_id,
        ),
    )
    return cur.fetchone()["id"]


def _execute(req: CorrectionRequest, user: dict, commit: bool, **kw) -> dict:
    conn, cur = _connect()
    try:
        result = _run(cur, req, **kw)
        correction_id = None
        if commit:
            correction_id = _log(cur, user, req.action, req.store_id, req.bill_id, result, req.note)
            conn.commit()
        else:
            conn.rollback()
        return {"correction_id": correction_id, **{k: v for k, v in result.items() if k != "cascade_raw"}}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/bill-corrections/stores")
def correction_stores(user: dict = Depends(require_corrections_access)):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute("SELECT id, name FROM store_data ORDER BY id")
        return [dict(r) for r in cur.fetchall()]


@router.get("/bill-corrections/bill")
def correction_bill(store_id: int, bill_id: int, user: dict = Depends(require_corrections_access)):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        bill = _load_bill(cur, store_id, bill_id)
        if not bill or bill_id <= 0:
            raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
        snap = _bill_snapshot(cur, store_id, bill_id)
        pair_ref = _find_pair(cur, store_id, bill_id)
        pair = _bill_snapshot(cur, pair_ref["store_id"], pair_ref["bill_id"]) if pair_ref else None
        # Same shape _run hashes: compute before adding display-only fields.
        token = _state_token([snap] + ([pair] if pair else []))
        names = _store_names(cur)
        if pair:
            pair = {**pair, "store_name": names.get(pair["store_id"])}

        reason = None
        if bill["type"] not in CORRECTABLE_TYPES:
            reason = "هذا النوع من الفواتير غير مدعوم في التصحيح (بيع، شراء، مرتجع، مرتجع شراء فقط)"

        cur.execute(
            "SELECT id, created_at, username, action, note, reverted_by FROM bill_corrections WHERE (store_id = %s AND bill_id = %s) OR (pair_store_id = %s AND pair_bill_id = %s) ORDER BY id DESC",
            (store_id, bill_id, store_id, bill_id),
        )
        history = [_jsonable(dict(r)) for r in cur.fetchall()]

        return _jsonable({
            "bill": {**snap, "store_name": names.get(store_id), "party_type": bill["party_type"]},
            "pair": pair,
            "legacy_pair_candidates": [] if pair else _legacy_pair_candidates(cur, bill),
            "correctable": reason is None,
            "reason": reason,
            "state_token": token,
            "history": history,
        })


@router.post("/bill-corrections/preview")
def correction_preview(req: CorrectionRequest, user: dict = Depends(require_corrections_access)):
    return _execute(req, user, commit=False)


@router.post("/bill-corrections/apply")
def correction_apply(req: CorrectionRequest, user: dict = Depends(require_corrections_access)):
    if not req.state_token:
        raise HTTPException(status_code=400, detail="عاين التصحيح أولاً")
    return _execute(req, user, commit=True)


@router.get("/bill-corrections/log")
def correction_log(limit: int = 100, user: dict = Depends(require_corrections_access)):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
            SELECT bc.id, bc.created_at, bc.username, bc.action, bc.store_id, sd.name AS store_name,
                   bc.bill_id, bc.pair_store_id, bc.pair_bill_id, bc.note, bc.reverts_id, bc.reverted_by,
                   bc.before, bc.after - 'cascade' AS after
            FROM bill_corrections bc
            LEFT JOIN store_data sd ON sd.id = bc.store_id
            ORDER BY bc.id DESC
            LIMIT %s
            """,
            (min(max(limit, 1), 500),),
        )
        return [_jsonable(dict(r)) for r in cur.fetchall()]


def _revert_request(entry: dict) -> tuple:
    bills = (entry["before"] or {}).get("bills") or []
    main = next((b for b in bills if b["store_id"] == entry["store_id"] and b["bill_id"] == entry["bill_id"]), None)
    if not main:
        raise HTTPException(status_code=400, detail="لا توجد بيانات كافية للتراجع")
    pair = next((b for b in bills if b is not main), None)

    def lines(b):
        return [CorrectionLine(**{k: l[k] for k in ("flow_id", "product_id", "quantity", "wholesale_price", "price")}) for l in b["lines"]]

    req = CorrectionRequest(
        store_id=main["store_id"], bill_id=main["bill_id"], action="edit",
        discount=main["discount"], lines=lines(main), cascade_costs=False,
        set_party="party_id" in main, party_id=main.get("party_id"),
        note=f"تراجع عن التصحيح #{entry['id']}",
    )
    pair_side = _Side(lines=lines(pair), discount=pair["discount"], payments=pair["payments"] or []) if pair else None
    return req, pair_side, (main["payments"] or [])


def _undo_cascade(cur, entry: dict) -> None:
    cascade = (entry["after"] or {}).get("cascade") or {}
    for d in cascade.get("done", []):
        for store_id, flow_id in d["rows"]:
            cur.execute(
                "UPDATE products_flow SET wholesale_price = %s WHERE id = %s AND store_id = %s AND ABS(wholesale_price - %s) < 1e-6",
                (d["old_cost"], flow_id, store_id, d["new_cost"]),
            )
    for p in cascade.get("price_updates", []):
        cur.execute(
            """
            UPDATE products SET
                wholesale_price = CASE WHEN ABS(wholesale_price - %s) < 1e-6 THEN %s ELSE wholesale_price END,
                price = CASE WHEN ABS(price - %s) < 1e-6 THEN %s ELSE price END
            WHERE id = %s
            """,
            (p["new_cost"], p["old_cost"], p["new_price"], p["old_price"], p["product_id"]),
        )


@router.post("/bill-corrections/log/{correction_id}/revert")
def correction_revert(correction_id: int, dry_run: bool = True, user: dict = Depends(require_corrections_access)):
    conn, cur = _connect()
    try:
        cur.execute("SELECT * FROM bill_corrections WHERE id = %s FOR UPDATE", (correction_id,))
        entry = cur.fetchone()
        if not entry:
            raise HTTPException(status_code=404, detail="التصحيح غير موجود")
        if entry["action"] != "edit":
            raise HTTPException(status_code=400, detail="لا يمكن التراجع عن حذف فاتورة أو عن تراجع سابق")
        if entry["reverted_by"]:
            raise HTTPException(status_code=400, detail="تم التراجع عن هذا التصحيح بالفعل")
        cur.execute(
            "SELECT id FROM bill_corrections WHERE id > %s AND reverted_by IS NULL AND action <> 'revert' AND ((store_id = %s AND bill_id = %s) OR (pair_store_id = %s AND pair_bill_id = %s))",
            (correction_id, entry["store_id"], entry["bill_id"], entry["store_id"], entry["bill_id"]),
        )
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="توجد تصحيحات أحدث على هذه الفاتورة. تراجع عنها أولاً.")

        req, pair_side, main_payments = _revert_request(dict(entry))
        _lock_stores(cur, _scope_stores(cur, req.store_id, req.bill_id))
        current = [_bill_snapshot(cur, b["store_id"], b["bill_id"]) for b in (entry["after"] or {}).get("bills", [])]
        if _state_token(current) != _state_token((entry["after"] or {}).get("bills", [])):
            raise HTTPException(
                status_code=409,
                detail="تغيّرت الفاتورة بعد هذا التصحيح (تعديل عادي أو غيره)، فلا يمكن التراجع تلقائياً.",
            )
        _undo_cascade(cur, dict(entry))
        result = _run(cur, req, pair_side=pair_side, main_payments_raw=main_payments)
        revert_id = None
        if dry_run:
            conn.rollback()
        else:
            revert_id = _log(cur, user, "revert", req.store_id, req.bill_id, result, req.note, reverts_id=correction_id)
            cur.execute("UPDATE bill_corrections SET reverted_by = %s WHERE id = %s", (revert_id, correction_id))
            conn.commit()
        return {"correction_id": revert_id, **{k: v for k, v in result.items() if k != "cascade_raw"}}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

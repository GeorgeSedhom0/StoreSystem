"""
Restock requests (v27): a store asks another store (usually the storage) for
goods; the supplier fills them through the normal Move Products transfer.

Spec: docs/specs/v27-restock-requests.md

- Two stored states (open / closed); everything users see is derived from the
  lines and who closed it.
- "sent" is never stored on a line: it is the sum of restock_fulfillments,
  rows written by move_products when a transfer is linked to requests.
- The requester never gets the supplier's stock.
- Quantities are base units (stock is INT); a package choice is a display
  snapshot only, exactly like bill lines.
"""

import logging
from os import getenv
from typing import Dict, Iterable, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from analytics_utils import Database
from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

router = APIRouter()
logger = logging.getLogger(__name__)

PAGE_PATH = "/restock-requests"
USAGE_DAYS = 30
MAX_QTY = 1_000_000
MAX_LINES = 500

# Bill types whose lines are consumption at a store (returns net them out).
USAGE_TYPES = ("sell", "BNPL", "installment", "reserve", "return")


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------


def require_restock_access(current_user: dict = Depends(get_current_user)):
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
                status_code=403, detail="ليس لديك صلاحية طلبات البضاعة"
            )
    return current_user


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class LineIn(BaseModel):
    product_id: int
    quantity: int  # base units
    package_id: Optional[int] = None


class RequestIn(BaseModel):
    store_id: int  # requester
    to_store_id: int
    note: Optional[str] = None
    lines: List[LineIn]
    carry_from: List[int] = []  # closed requests whose leftovers this follows up
    merge_into: Optional[int] = None  # add to this open request instead


class RequestEdit(BaseModel):
    store_id: int
    to_store_id: Optional[int] = None
    note: Optional[str] = None
    lines: List[LineIn]


class CloseIn(BaseModel):
    store_id: int
    note: Optional[str] = None


class DismissIn(BaseModel):
    store_id: int
    ids: List[int]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def allocate(available: int, claims: List[dict]) -> Tuple[List[int], str]:
    """
    Split `available` units between claimants.

    claims: [{"need": int, "stock": number, "daily": number}]
    Returns (allocations, method) where method is "full", "usage" or
    "proportional".

    - Enough for everyone: everyone gets their need.
    - Every claimant has a sales rate: equalize days of cover - find T with
      sum(min(need, max(0, T*daily - stock))) == available.
    - Otherwise proportional to need.
    Integer result: floor, then largest remainders, never above need, and the
    total never exceeds `available`.
    """
    needs = [max(0, int(c.get("need") or 0)) for c in claims]
    available = max(0, int(available or 0))
    total_need = sum(needs)
    if not claims:
        return [], "full"
    if available >= total_need:
        return needs, "full"
    if available == 0:
        return [0] * len(claims), "proportional"

    rates = [max(0.0, float(c.get("daily") or 0)) for c in claims]
    stocks = [max(0.0, float(c.get("stock") or 0)) for c in claims]

    if all(r > 0 for r, n in zip(rates, needs) if n > 0):
        method = "usage"

        def given(t: float) -> List[float]:
            return [
                min(n, max(0.0, t * r - s)) if n > 0 else 0.0
                for n, r, s in zip(needs, rates, stocks)
            ]

        lo, hi = 0.0, 1.0
        while sum(given(hi)) < available and hi < 1e12:
            hi *= 2
        for _ in range(100):
            mid = (lo + hi) / 2
            if sum(given(mid)) < available:
                lo = mid
            else:
                hi = mid
        raw = given(hi)
        # Scale tiny overshoot from the bisection back onto `available`.
        tot = sum(raw)
        if tot > available and tot > 0:
            raw = [x * available / tot for x in raw]
    else:
        method = "proportional"
        raw = [available * n / total_need for n in needs]

    alloc = [min(n, int(x + 1e-9)) for x, n in zip(raw, needs)]
    left = available - sum(alloc)
    order = sorted(
        range(len(claims)), key=lambda i: (raw[i] - int(raw[i] + 1e-9)), reverse=True
    )
    while left > 0:
        progressed = False
        for i in order:
            if left <= 0:
                break
            if alloc[i] < needs[i]:
                alloc[i] += 1
                left -= 1
                progressed = True
        if not progressed:
            break
    return alloc, method


def derive_state(req: dict, requested: int, sent_capped: int, lines_open: int) -> str:
    """new | seen | partial | done | cancelled | short"""
    if req["status"] == "open":
        if sent_capped > 0:
            return "partial"
        return "seen" if req.get("seen_at") else "new"
    if lines_open == 0:
        return "done"
    if sent_capped == 0 and req.get("closed_side") == "requester":
        return "cancelled"
    return "short"


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _store_names(cur, ids: Iterable[int]) -> Dict[int, str]:
    ids = list({int(i) for i in ids if i is not None})
    if not ids:
        return {}
    cur.execute("SELECT id, name FROM store_data WHERE id = ANY(%s)", (ids,))
    return {r["id"]: (r["name"] or f"متجر {r['id']}") for r in cur.fetchall()}


def _check_store(cur, store_id: int):
    cur.execute("SELECT 1 FROM store_data WHERE id = %s", (store_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=400, detail="المتجر غير موجود")


def _clean_lines(cur, lines: List[LineIn]) -> List[dict]:
    """Merge duplicates, validate products/packages, attach package snapshots."""
    merged: Dict[int, dict] = {}
    for ln in lines:
        q = int(ln.quantity or 0)
        if q <= 0:
            continue
        if q > MAX_QTY:
            raise HTTPException(status_code=400, detail="الكمية كبيرة جدًا")
        cur_line = merged.get(ln.product_id)
        if cur_line:
            cur_line["quantity"] += q
            # Mixed units for one product: keep a package only if it still fits.
            if cur_line["package_id"] != ln.package_id:
                cur_line["package_id"] = cur_line["package_id"] or ln.package_id
        else:
            merged[ln.product_id] = {
                "product_id": ln.product_id,
                "quantity": q,
                "package_id": ln.package_id,
            }
    if len(merged) > MAX_LINES:
        raise HTTPException(status_code=400, detail="عدد الأصناف كبير جدًا")
    if not merged:
        return []

    ids = list(merged.keys())
    cur.execute("SELECT id FROM products WHERE id = ANY(%s)", (ids,))
    found = {r["id"] for r in cur.fetchall()}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(status_code=400, detail="منتج غير موجود في الطلب")

    pkg_ids = [m["package_id"] for m in merged.values() if m["package_id"]]
    pkgs: Dict[int, dict] = {}
    if pkg_ids:
        cur.execute(
            """
            SELECT id, product_id, name, units FROM product_packages
            WHERE id = ANY(%s) AND is_deleted = FALSE
            """,
            (pkg_ids,),
        )
        pkgs = {r["id"]: r for r in cur.fetchall()}

    out = []
    for m in merged.values():
        pkg = pkgs.get(m["package_id"]) if m["package_id"] else None
        if (
            pkg
            and pkg["product_id"] == m["product_id"]
            and pkg["units"] >= 2
            and m["quantity"] % pkg["units"] == 0
        ):
            m["package_units"] = pkg["units"]
            m["package_name"] = pkg["name"]
        else:
            m["package_id"] = None
            m["package_units"] = None
            m["package_name"] = None
        out.append(m)
    return out


def _lock_request(cur, request_id: int) -> dict:
    cur.execute(
        "SELECT * FROM restock_requests WHERE id = %s FOR UPDATE", (request_id,)
    )
    req = cur.fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return req


def _side(req: dict, store_id: int) -> str:
    if req["from_store_id"] == store_id:
        return "requester"
    if req["to_store_id"] == store_id:
        return "supplier"
    raise HTTPException(status_code=403, detail="هذا الطلب لا يخص هذا المتجر")


def _load_lines(cur, request_ids: List[int]) -> Dict[int, List[dict]]:
    if not request_ids:
        return {}
    cur.execute(
        """
        SELECT l.id, l.request_id, l.product_id, l.quantity,
               l.package_id, l.package_units, l.package_name,
               p.name, p.bar_code,
               COALESCE(f.sent, 0)::int AS sent
        FROM restock_request_lines l
        JOIN products p ON p.id = l.product_id
        LEFT JOIN (
            SELECT line_id, SUM(quantity) AS sent
            FROM restock_fulfillments
            WHERE request_id = ANY(%s)
            GROUP BY line_id
        ) f ON f.line_id = l.id
        WHERE l.request_id = ANY(%s)
        ORDER BY l.id
        """,
        (request_ids, request_ids),
    )
    out: Dict[int, List[dict]] = {}
    for r in cur.fetchall():
        r = dict(r)
        r["sent"] = min(int(r["sent"]), int(r["quantity"]))
        r["remaining"] = max(0, int(r["quantity"]) - r["sent"])
        out.setdefault(r["request_id"], []).append(r)
    return out


def _summarize(req: dict, lines: List[dict], names: Dict[int, str]) -> dict:
    requested = sum(l["quantity"] for l in lines)
    sent = sum(l["sent"] for l in lines)
    lines_open = sum(1 for l in lines if l["remaining"] > 0)
    out = {
        "id": req["id"],
        "from_store_id": req["from_store_id"],
        "from_store_name": names.get(req["from_store_id"], ""),
        "to_store_id": req["to_store_id"],
        "to_store_name": names.get(req["to_store_id"], ""),
        "status": req["status"],
        "state": derive_state(req, requested, sent, lines_open),
        "note": req.get("note") or "",
        "created_at": req["created_at"],
        "updated_at": req["updated_at"],
        "created_by_name": req.get("created_by_name") or "",
        "seen_at": req.get("seen_at"),
        "closed_at": req.get("closed_at"),
        "closed_side": req.get("closed_side"),
        "closed_by_name": req.get("closed_by_name") or "",
        "close_note": req.get("close_note") or "",
        "followed_up_at": req.get("followed_up_at"),
        "followup_request_id": req.get("followup_request_id"),
        "totals": {
            "lines": len(lines),
            "lines_open": lines_open,
            "requested": requested,
            "sent": sent,
            "remaining": max(0, requested - sent),
        },
        "lines": [
            {
                k: l[k]
                for k in (
                    "id",
                    "product_id",
                    "name",
                    "bar_code",
                    "quantity",
                    "sent",
                    "remaining",
                    "package_id",
                    "package_units",
                    "package_name",
                )
            }
            for l in lines
        ],
    }
    return out


def _fetch_requests(cur, where: str, params: tuple, limit: int = 200) -> List[dict]:
    cur.execute(
        f"""
        SELECT r.*, cu.username AS created_by_name, xu.username AS closed_by_name
        FROM restock_requests r
        LEFT JOIN users cu ON cu.id = r.created_by
        LEFT JOIN users xu ON xu.id = r.closed_by
        WHERE {where}
        ORDER BY (r.status = 'open') DESC, r.created_at DESC, r.id DESC
        LIMIT %s
        """,
        (*params, limit),
    )
    reqs = [dict(r) for r in cur.fetchall()]
    lines = _load_lines(cur, [r["id"] for r in reqs])
    names = _store_names(
        cur, [r["from_store_id"] for r in reqs] + [r["to_store_id"] for r in reqs]
    )
    return [_summarize(r, lines.get(r["id"], []), names) for r in reqs]


def _notify(cur, store_id: int, title: str, content: str, request_id: int):
    """In-app notification row (Telegram is queued by the caller)."""
    try:
        cur.execute("SAVEPOINT restock_notify")
        cur.execute(
            """
            INSERT INTO notifications (store_id, title, content, type, reference_id)
            VALUES (%s, %s, %s, 'restock', %s)
            """,
            (store_id, title, content, request_id),
        )
        cur.execute("RELEASE SAVEPOINT restock_notify")
    except Exception as e:  # never fail the action over a notification
        cur.execute("ROLLBACK TO SAVEPOINT restock_notify")
        logger.warning("restock notification failed: %s", e)


def _telegram(background_tasks: Optional[BackgroundTasks], store_id: int, text: str):
    if background_tasks is None:
        return
    try:
        from telegram_utils import send_telegram_notification_background

        background_tasks.add_task(send_telegram_notification_background, store_id, text)
    except Exception as e:
        logger.warning("restock telegram queue failed: %s", e)


def _esc(text) -> str:
    return (
        str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


def _qty(n) -> str:
    n = int(n or 0)
    return f"{n:,}"


def usage_rates(
    cur, store_ids: List[int], product_ids: Optional[List[int]] = None
) -> Dict[Tuple[int, int], float]:
    """Daily net sales per (store, product) over the last USAGE_DAYS days.

    Transfers (bills whose party is a store) and edit placeholder bills
    (no type) are excluded; returns net out.
    """
    if not store_ids:
        return {}
    params: list = [list(USAGE_TYPES), USAGE_DAYS, list(store_ids)]
    product_filter = ""
    if product_ids is not None:
        if not product_ids:
            return {}
        product_filter = "AND pf.product_id = ANY(%s)"
        params.append(list(product_ids))
    cur.execute(
        f"""
        SELECT pf.store_id, pf.product_id, -SUM(pf.amount) AS sold
        FROM products_flow pf
        JOIN bills b ON b.id = pf.bill_id AND b.store_id = pf.store_id
        LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
        WHERE b.type = ANY(%s)
          AND b.time >= NOW() - make_interval(days => %s)  -- typed bills always have a time; lets (store_id, time) indexes work
          AND pf.store_id = ANY(%s)
          AND (ap.id IS NULL OR ap.extra_info IS NULL
               OR NOT (ap.extra_info ? 'store_id'))
          {product_filter}
        GROUP BY pf.store_id, pf.product_id
        """,
        tuple(params),
    )
    out = {}
    for r in cur.fetchall():
        sold = float(r["sold"] or 0)
        if sold > 0:
            out[(r["store_id"], r["product_id"])] = sold / USAGE_DAYS
    return out


def _stocks(cur, store_ids: List[int], product_ids: List[int]) -> Dict[Tuple[int, int], int]:
    if not store_ids or not product_ids:
        return {}
    cur.execute(
        """
        SELECT store_id, product_id, stock FROM product_inventory
        WHERE store_id = ANY(%s) AND product_id = ANY(%s)
        """,
        (list(store_ids), list(product_ids)),
    )
    return {(r["store_id"], r["product_id"]): int(r["stock"] or 0) for r in cur.fetchall()}


def _replace_lines(cur, request_id: int, lines: List[dict], keep_sent: bool):
    """Upsert the request's lines to exactly `lines` (sent lines can't shrink
    below what was sent and can't be removed)."""
    existing = _load_lines(cur, [request_id]).get(request_id, [])
    by_product = {l["product_id"]: l for l in existing}
    wanted = {l["product_id"]: l for l in lines}

    for pid, old in by_product.items():
        if pid not in wanted:
            if keep_sent and old["sent"] > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"لا يمكن حذف «{old['name']}»: تم إرسال جزء منه",
                )
            cur.execute("DELETE FROM restock_request_lines WHERE id = %s", (old["id"],))

    for pid, ln in wanted.items():
        old = by_product.get(pid)
        if old:
            if keep_sent and ln["quantity"] < old["sent"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"كمية «{old['name']}» أقل من المرسل بالفعل ({old['sent']})",
                )
            cur.execute(
                """
                UPDATE restock_request_lines
                SET quantity = %s, package_id = %s, package_units = %s, package_name = %s
                WHERE id = %s
                """,
                (
                    ln["quantity"],
                    ln["package_id"],
                    ln["package_units"],
                    ln["package_name"],
                    old["id"],
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO restock_request_lines
                    (request_id, product_id, quantity, package_id, package_units, package_name)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    request_id,
                    pid,
                    ln["quantity"],
                    ln["package_id"],
                    ln["package_units"],
                    ln["package_name"],
                ),
            )


def _maybe_autoclose(cur, request_id: int) -> bool:
    lines = _load_lines(cur, [request_id]).get(request_id, [])
    if lines and all(l["remaining"] == 0 for l in lines):
        cur.execute(
            """
            UPDATE restock_requests
            SET status = 'closed', closed_at = NOW(), closed_side = 'auto',
                closed_by = NULL, updated_at = NOW()
            WHERE id = %s AND status = 'open'
            """,
            (request_id,),
        )
        return True
    return False


# ---------------------------------------------------------------------------
# Transfer link (called by move_products inside its transaction)
# ---------------------------------------------------------------------------


def record_fulfillment(
    cur,
    request_ids: List[int],
    supplier_store_id: int,
    requester_store_id: int,
    bill_id: int,
    quantities: Dict[int, float],
) -> List[dict]:
    """
    Allocate the units of one transfer to the linked open requests (oldest
    first, capped at each line's remaining) and auto-close completed ones.

    Requests that are closed, missing or belong to another store pair are
    skipped (reported with "skipped"). Returns a summary per request.
    """
    ids = sorted({int(i) for i in request_ids or []})
    if not ids:
        return []
    cur.execute(
        """
        SELECT * FROM restock_requests WHERE id = ANY(%s)
        ORDER BY created_at, id FOR UPDATE
        """,
        (ids,),
    )
    reqs = [dict(r) for r in cur.fetchall()]
    valid = [
        r
        for r in reqs
        if r["status"] == "open"
        and r["to_store_id"] == supplier_store_id
        and r["from_store_id"] == requester_store_id
    ]
    left = {int(pid): int(q) for pid, q in quantities.items() if q and q > 0}
    lines = _load_lines(cur, [r["id"] for r in valid])

    summary = []
    for r in valid:
        sent_now = 0
        for ln in lines.get(r["id"], []):
            avail = left.get(ln["product_id"], 0)
            take = min(avail, ln["remaining"])
            if take <= 0:
                continue
            cur.execute(
                """
                INSERT INTO restock_fulfillments
                    (request_id, line_id, bill_id, store_id, quantity)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (r["id"], ln["id"], bill_id, supplier_store_id, take),
            )
            left[ln["product_id"]] = avail - take
            sent_now += take
        closed = _maybe_autoclose(cur, r["id"]) if sent_now else False
        cur.execute(
            "UPDATE restock_requests SET updated_at = NOW() WHERE id = %s", (r["id"],)
        )
        after = _load_lines(cur, [r["id"]]).get(r["id"], [])
        summary.append(
            {
                "id": r["id"],
                "sent_now": sent_now,
                "closed": closed,
                "remaining_lines": sum(1 for l in after if l["remaining"] > 0),
                "remaining": [
                    {"product_id": l["product_id"], "name": l["name"], "remaining": l["remaining"]}
                    for l in after
                    if l["remaining"] > 0
                ],
            }
        )
        if not sent_now:
            continue
        title = "تم تجهيز طلبك" if closed else "تم إرسال جزء من طلبك"
        _notify(
            cur,
            requester_store_id,
            f"{title} #{r['id']}",
            f"أُرسلت {_qty(sent_now)} وحدة"
            + ("" if closed else f" — بقي {sum(1 for l in after if l['remaining'] > 0)} صنف"),
            r["id"],
        )
    for r in reqs:
        if r not in valid:
            summary.append({"id": r["id"], "skipped": True})
    return summary


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/restock/requests")
def list_requests(
    store_id: int,
    box: str = "mine",
    state: str = "all",
    limit: int = 200,
    _user: dict = Depends(require_restock_access),
):
    col = "r.from_store_id" if box == "mine" else "r.to_store_id"
    where = f"{col} = %s"
    params: tuple = (store_id,)
    if state in ("open", "closed"):
        where += " AND r.status = %s"
        params += (state,)
    with Database(HOST, DATABASE, USER, PASS) as cur:
        return _fetch_requests(cur, where, params, max(1, min(limit, 500)))


@router.get("/restock/requests/{request_id}")
def get_request(
    request_id: int,
    store_id: int,
    _user: dict = Depends(require_restock_access),
):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        rows = _fetch_requests(cur, "r.id = %s", (request_id,), 1)
        if not rows:
            raise HTTPException(status_code=404, detail="الطلب غير موجود")
        req = rows[0]
        side = _side(req, store_id)
        req["side"] = side
        pids = [l["product_id"] for l in req["lines"]]
        if side == "supplier":
            # Only the supplier sees its own stock.
            stocks = _stocks(cur, [store_id], pids)
            for l in req["lines"]:
                l["available"] = max(0, stocks.get((store_id, l["product_id"]), 0))
        else:
            stocks = _stocks(cur, [store_id], pids)
            for l in req["lines"]:
                l["own_stock"] = stocks.get((store_id, l["product_id"]), 0)
        cur.execute(
            """
            SELECT f.bill_id, f.store_id, MIN(f.created_at) AS created_at,
                   MIN(b.time) AS time, SUM(f.quantity)::int AS quantity,
                   COUNT(DISTINCT f.line_id)::int AS lines
            FROM restock_fulfillments f
            LEFT JOIN bills b ON b.id = f.bill_id AND b.store_id = f.store_id
            WHERE f.request_id = %s
            GROUP BY f.bill_id, f.store_id
            ORDER BY MIN(f.created_at)
            """,
            (request_id,),
        )
        req["transfers"] = [dict(r) for r in cur.fetchall()]
        return req


@router.post("/restock/requests")
def create_request(
    body: RequestIn,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_restock_access),
):
    if body.store_id == body.to_store_id:
        raise HTTPException(status_code=400, detail="لا يمكن الطلب من نفس المتجر")
    with Database(HOST, DATABASE, USER, PASS) as cur:
        _check_store(cur, body.store_id)
        _check_store(cur, body.to_store_id)
        lines = _clean_lines(cur, body.lines)
        if not lines:
            raise HTTPException(status_code=400, detail="الطلب فارغ")
        note = (body.note or "").strip() or None

        merged = False
        if body.merge_into:
            req = _lock_request(cur, body.merge_into)
            if (
                req["status"] != "open"
                or req["from_store_id"] != body.store_id
                or req["to_store_id"] != body.to_store_id
            ):
                raise HTTPException(
                    status_code=400, detail="لا يمكن الإضافة لهذا الطلب، أرسله كطلب جديد"
                )
            current = _load_lines(cur, [req["id"]]).get(req["id"], [])
            combined: Dict[int, dict] = {
                l["product_id"]: {
                    "product_id": l["product_id"],
                    "quantity": l["quantity"],
                    "package_id": l["package_id"],
                    "package_units": l["package_units"],
                    "package_name": l["package_name"],
                }
                for l in current
            }
            for l in lines:
                c = combined.get(l["product_id"])
                if c:
                    c["quantity"] += l["quantity"]
                    units = c.get("package_units") or 0
                    if not units or c["quantity"] % units != 0:
                        c.update(package_id=None, package_units=None, package_name=None)
                else:
                    combined[l["product_id"]] = l
            _replace_lines(cur, req["id"], list(combined.values()), keep_sent=True)
            if note:
                new_note = f"{req['note']}\n{note}" if req.get("note") else note
                cur.execute(
                    "UPDATE restock_requests SET note = %s WHERE id = %s",
                    (new_note, req["id"]),
                )
            cur.execute(
                "UPDATE restock_requests SET updated_at = NOW() WHERE id = %s",
                (req["id"],),
            )
            request_id = req["id"]
            merged = True
        else:
            cur.execute(
                """
                INSERT INTO restock_requests (from_store_id, to_store_id, note, created_by)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (body.store_id, body.to_store_id, note, current_user.get("id")),
            )
            request_id = cur.fetchone()["id"]
            _replace_lines(cur, request_id, lines, keep_sent=False)

        if body.carry_from:
            cur.execute(
                """
                UPDATE restock_requests
                SET followed_up_at = NOW(), followup_request_id = %s
                WHERE id = ANY(%s) AND from_store_id = %s AND status = 'closed'
                  AND followed_up_at IS NULL
                """,
                (request_id, list(body.carry_from), body.store_id),
            )

        names = _store_names(cur, [body.store_id, body.to_store_id])
        count = len(lines)
        title = (
            f"إضافة لطلب بضاعة #{request_id}" if merged else f"طلب بضاعة جديد #{request_id}"
        )
        content = f"من {names.get(body.store_id, '')}: {count} صنف"
        if note:
            content += f" — {note}"
        _notify(cur, body.to_store_id, title, content, request_id)

        tg_lines = "\n".join(
            f"• {_esc(n)}: {_qty(q)}"
            for n, q in _line_names(cur, lines)[:15]
        )
        more = f"\n… و{count - 15} صنف آخر" if count > 15 else ""
        _telegram(
            background_tasks,
            body.to_store_id,
            f"📦 <b>{_esc(title)}</b>\n"
            f"من: {_esc(names.get(body.store_id, ''))}\n"
            f"بواسطة: {_esc(current_user.get('username', ''))}\n"
            + (f"ملاحظة: {_esc(note)}\n" if note else "")
            + f"\n{tg_lines}{more}",
        )
        rows = _fetch_requests(cur, "r.id = %s", (request_id,), 1)
        return {"request": rows[0], "merged": merged}


def _line_names(cur, lines: List[dict]) -> List[Tuple[str, int]]:
    ids = [l["product_id"] for l in lines]
    cur.execute("SELECT id, name FROM products WHERE id = ANY(%s)", (ids,))
    names = {r["id"]: r["name"] for r in cur.fetchall()}
    return [(names.get(l["product_id"], ""), l["quantity"]) for l in lines]


@router.put("/restock/requests/{request_id}")
def edit_request(
    request_id: int,
    body: RequestEdit,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_restock_access),
):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        req = _lock_request(cur, request_id)
        if _side(req, body.store_id) != "requester":
            raise HTTPException(status_code=403, detail="فقط المتجر الطالب يعدل الطلب")
        if req["status"] != "open":
            raise HTTPException(status_code=400, detail="الطلب مغلق، أعد فتحه أولاً")
        lines = _clean_lines(cur, body.lines)
        if not lines:
            raise HTTPException(
                status_code=400, detail="الطلب فارغ — استخدم «إلغاء الطلب» بدلاً من ذلك"
            )
        current = _load_lines(cur, [request_id]).get(request_id, [])
        any_sent = any(l["sent"] > 0 for l in current)
        to_store = body.to_store_id or req["to_store_id"]
        if to_store != req["to_store_id"]:
            if any_sent:
                raise HTTPException(
                    status_code=400,
                    detail="لا يمكن تغيير المتجر المطلوب منه بعد بدء التجهيز",
                )
            if to_store == req["from_store_id"]:
                raise HTTPException(status_code=400, detail="لا يمكن الطلب من نفس المتجر")
            _check_store(cur, to_store)
        _replace_lines(cur, request_id, lines, keep_sent=True)
        cur.execute(
            """
            UPDATE restock_requests
            SET note = %s, to_store_id = %s, updated_at = NOW(),
                seen_at = CASE WHEN %s <> to_store_id THEN NULL ELSE seen_at END
            WHERE id = %s
            """,
            ((body.note or "").strip() or None, to_store, to_store, request_id),
        )
        # An edit can leave every line covered (e.g. quantities lowered to sent).
        _maybe_autoclose(cur, request_id)
        if to_store != req["to_store_id"]:
            # Moved to another supplier: it's new for them.
            names = _store_names(cur, [req["from_store_id"], to_store])
            title = f"طلب بضاعة جديد #{request_id}"
            content = f"من {names.get(req['from_store_id'], '')}: {len(lines)} صنف"
            _notify(cur, to_store, title, content, request_id)
            _telegram(
                background_tasks,
                to_store,
                f"📦 <b>{_esc(title)}</b>\nمن: {_esc(names.get(req['from_store_id'], ''))}\n"
                f"بواسطة: {_esc(current_user.get('username', ''))}\n{len(lines)} صنف",
            )
        return _fetch_requests(cur, "r.id = %s", (request_id,), 1)[0]


@router.post("/restock/requests/{request_id}/close")
def close_request(
    request_id: int,
    body: CloseIn,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_restock_access),
):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        req = _lock_request(cur, request_id)
        side = _side(req, body.store_id)
        if req["status"] != "open":
            raise HTTPException(status_code=400, detail="الطلب مغلق بالفعل")
        note = (body.note or "").strip() or None
        cur.execute(
            """
            UPDATE restock_requests
            SET status = 'closed', closed_at = NOW(), closed_side = %s,
                closed_by = %s, close_note = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (side, current_user.get("id"), note, request_id),
        )
        lines = _load_lines(cur, [request_id]).get(request_id, [])
        missing = [l for l in lines if l["remaining"] > 0]
        names = _store_names(cur, [req["from_store_id"], req["to_store_id"]])
        if side == "supplier":
            content = (
                f"أُغلق بواسطة {names.get(req['to_store_id'], '')}"
                + (f" — لم يُرسل {len(missing)} صنف" if missing else "")
                + (f" — {note}" if note else "")
            )
            _notify(cur, req["from_store_id"], f"أُغلق طلبك #{request_id}", content, request_id)
            if missing:
                tg = "\n".join(
                    f"• {_esc(l['name'])}: {_qty(l['remaining'])}" for l in missing[:15]
                )
                _telegram(
                    background_tasks,
                    req["from_store_id"],
                    f"📦 <b>أُغلق طلب البضاعة #{request_id}</b>\n"
                    f"من: {_esc(names.get(req['to_store_id'], ''))}\n"
                    + (f"ملاحظة: {_esc(note)}\n" if note else "")
                    + f"\nلم يُرسل:\n{tg}",
                )
        else:
            _notify(
                cur,
                req["to_store_id"],
                f"أُلغي طلب البضاعة #{request_id}",
                f"ألغاه {names.get(req['from_store_id'], '')}" + (f" — {note}" if note else ""),
                request_id,
            )
        return _fetch_requests(cur, "r.id = %s", (request_id,), 1)[0]


@router.post("/restock/requests/{request_id}/reopen")
def reopen_request(
    request_id: int,
    body: CloseIn,
    _user: dict = Depends(require_restock_access),
):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        req = _lock_request(cur, request_id)
        _side(req, body.store_id)
        if req["status"] != "closed":
            raise HTTPException(status_code=400, detail="الطلب مفتوح بالفعل")
        if req.get("followup_request_id"):
            raise HTTPException(
                status_code=400,
                detail=f"نُقل الناقص إلى الطلب #{req['followup_request_id']}",
            )
        lines = _load_lines(cur, [request_id]).get(request_id, [])
        if not any(l["remaining"] > 0 for l in lines):
            raise HTTPException(status_code=400, detail="الطلب مكتمل، لا يوجد ما يُعاد فتحه")
        cur.execute(
            """
            UPDATE restock_requests
            SET status = 'open', closed_at = NULL, closed_side = NULL,
                closed_by = NULL, close_note = NULL, followed_up_at = NULL,
                updated_at = NOW()
            WHERE id = %s
            """,
            (request_id,),
        )
        return _fetch_requests(cur, "r.id = %s", (request_id,), 1)[0]


@router.post("/restock/requests/{request_id}/seen")
def mark_seen(
    request_id: int,
    store_id: int,
    _user: dict = Depends(require_restock_access),
):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
            UPDATE restock_requests SET seen_at = NOW()
            WHERE id = %s AND to_store_id = %s AND seen_at IS NULL
            """,
            (request_id, store_id),
        )
        return {"ok": True}


@router.post("/restock/followups/dismiss")
def dismiss_followups(
    body: DismissIn,
    _user: dict = Depends(require_restock_access),
):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
            UPDATE restock_requests SET followed_up_at = NOW()
            WHERE id = ANY(%s) AND from_store_id = %s AND status = 'closed'
              AND followed_up_at IS NULL
            """,
            (list(body.ids), body.store_id),
        )
        return {"ok": True, "count": cur.rowcount}


@router.get("/restock/pending")
def pending_for_requester(
    store_id: int,
    _user: dict = Depends(require_restock_access),
):
    """What this store is still waiting for, and leftovers to follow up."""
    with Database(HOST, DATABASE, USER, PASS) as cur:
        open_reqs = _fetch_requests(
            cur, "r.from_store_id = %s AND r.status = 'open'", (store_id,)
        )
        pending: Dict[int, dict] = {}
        for r in open_reqs:
            for l in r["lines"]:
                if l["remaining"] <= 0:
                    continue
                p = pending.setdefault(
                    l["product_id"], {"product_id": l["product_id"], "remaining": 0, "requests": []}
                )
                p["remaining"] += l["remaining"]
                p["requests"].append(r["id"])
        followups = _fetch_requests(
            cur,
            """r.from_store_id = %s AND r.status = 'closed'
               AND r.closed_side <> 'requester'
               AND r.followed_up_at IS NULL
               AND r.closed_at >= NOW() - interval '60 days'""",
            (store_id,),
            50,
        )
        followups = [f for f in followups if f["totals"]["remaining"] > 0]
        untouched = [
            {"id": r["id"], "to_store_id": r["to_store_id"], "to_store_name": r["to_store_name"]}
            for r in open_reqs
            if r["totals"]["sent"] == 0
        ]
        return {
            "pending": list(pending.values()),
            "followups": followups,
            "untouched": untouched,
        }


@router.get("/restock/usage")
def store_usage(
    store_id: int,
    _user: dict = Depends(require_restock_access),
):
    """Daily sales per product for this store (hints on the request form)."""
    with Database(HOST, DATABASE, USER, PASS) as cur:
        rates = usage_rates(cur, [store_id])
        return {
            "days": USAGE_DAYS,
            "rates": {str(pid): round(rate, 3) for (_s, pid), rate in rates.items()},
        }


@router.get("/restock/plan")
def supplier_plan(
    store_id: int,
    _user: dict = Depends(require_restock_access),
):
    """
    Everything still owed by this (supplier) store, per product, with this
    store's stock and a suggested split between requesting stores.
    """
    with Database(HOST, DATABASE, USER, PASS) as cur:
        reqs = _fetch_requests(
            cur, "r.to_store_id = %s AND r.status = 'open'", (store_id,), 500
        )
        # product -> store -> {remaining, request_ids}
        claims: Dict[int, Dict[int, dict]] = {}
        meta: Dict[int, dict] = {}
        for r in sorted(reqs, key=lambda x: (x["created_at"], x["id"])):
            for l in r["lines"]:
                if l["remaining"] <= 0:
                    continue
                meta[l["product_id"]] = {"name": l["name"], "bar_code": l["bar_code"]}
                c = claims.setdefault(l["product_id"], {}).setdefault(
                    r["from_store_id"],
                    {
                        "store_id": r["from_store_id"],
                        "store_name": r["from_store_name"],
                        "remaining": 0,
                        "requests": [],
                    },
                )
                c["remaining"] += l["remaining"]
                c["requests"].append({"id": r["id"], "remaining": l["remaining"]})

        pids = list(claims.keys())
        stores = sorted({s for per in claims.values() for s in per})
        stock_here = _stocks(cur, [store_id], pids)
        stock_there = _stocks(cur, stores, pids)
        rates = usage_rates(cur, stores, pids)

        products = []
        for pid in pids:
            per = list(claims[pid].values())
            available = max(0, stock_here.get((store_id, pid), 0))
            items = []
            for c in per:
                stock = stock_there.get((c["store_id"], pid), 0)
                daily = rates.get((c["store_id"], pid), 0.0)
                items.append({**c, "stock": stock, "daily": round(daily, 3)})
            alloc, method = allocate(
                available,
                [{"need": i["remaining"], "stock": i["stock"], "daily": i["daily"]} for i in items],
            )
            for i, a in zip(items, alloc):
                i["allocation"] = a
                i["cover_days"] = (
                    round((max(0, i["stock"]) + a) / i["daily"], 1) if i["daily"] > 0 else None
                )
            total = sum(i["remaining"] for i in items)
            products.append(
                {
                    "product_id": pid,
                    **meta[pid],
                    "available": available,
                    "total_remaining": total,
                    "short": available < total,
                    "contested": len(items) > 1 and available < total,
                    "method": method,
                    "stores": items,
                }
            )
        products.sort(key=lambda p: (not p["contested"], not p["short"], p["name"] or ""))
        return {
            "usage_days": USAGE_DAYS,
            "requests": len(reqs),
            "products": products,
        }

"""
Change a bill's payment-method split in place (v26).

Like PUT /bill/party, this is attribution, not a line edit: the bill total
does not change, so cash_flow amounts and the running cash totals stay as they
are. What moves is *which account* the money is in:

- bills.payments is rewritten (the split must sum to the bill total),
- the bill's cash rows are re-split in the accounts ledger (the mirror trigger
  only fires on an amount change, so this is done explicitly),
- off-store forwarding rows (a sell/return paid through an account that lives
  in another store) are added/updated/removed to match the new split.

Runs under the same per-store locks as bill corrections, reusing its helpers,
so it queues behind live sales instead of racing them.

Transfers (bills_pairs) are refused: their money side is the move settlement.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import Json
from pydantic import BaseModel

from auth_middleware import get_current_user
from bill_corrections import (
    EPS,
    CorrectionPayment,
    _build_payments,
    _connect,
    _find_pair,
    _forward_rows,
    _load_bill,
    _lock_stores,
    _remirror_cash_row,
    _scope_stores,
    _sync_forwarding,
)

router = APIRouter()

PAYABLE_TYPES = ("sell", "return", "buy", "buy-return")


class BillPaymentsIn(BaseModel):
    store_id: int
    bill_id: int
    payments: List[CorrectionPayment]


def _same_split(a, b) -> bool:
    def norm(x):
        out = {}
        for e in x or []:
            mid = e.get("method_id")
            out[mid] = round(out.get(mid, 0.0) + float(e.get("amount") or 0), 2)
        return {k: v for k, v in out.items() if abs(v) > EPS}

    return norm(a) == norm(b)


@router.put("/bill/payments")
def update_bill_payments(
    body: BillPaymentsIn,
    current_user: dict = Depends(get_current_user),
):
    conn, cur = _connect()
    try:
        bill = _load_bill(cur, body.store_id, body.bill_id)
        if not bill or body.bill_id <= 0:
            raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
        if bill["type"] not in PAYABLE_TYPES:
            raise HTTPException(
                status_code=400, detail="هذا النوع من الفواتير لا يستخدم طرق الدفع"
            )
        if bill["party_type"] == "store" or _find_pair(cur, body.store_id, body.bill_id):
            raise HTTPException(
                status_code=400,
                detail="لا يمكن تغيير طرق الدفع لفاتورة نقل بين المتاجر",
            )

        _lock_stores(cur, _scope_stores(cur, body.store_id, body.bill_id, body.payments))
        bill = _load_bill(cur, body.store_id, body.bill_id, lock=True)
        total_abs = abs(float(bill["total"] or 0))
        if total_abs <= EPS:
            raise HTTPException(status_code=400, detail="إجمالي الفاتورة صفر")

        payments = _build_payments(cur, body.payments, total_abs)
        if not payments:
            raise HTTPException(status_code=400, detail="اختر طريقة دفع واحدة على الأقل")

        if _same_split(bill["payments"], payments):
            conn.rollback()
            return {"changed": False, "payments": bill["payments"]}

        # Matched against the OLD split, before it is overwritten.
        forwards = _forward_rows(cur, bill)

        cur.execute(
            "UPDATE bills SET payments = %s WHERE id = %s AND store_id = %s",
            (Json(payments), body.bill_id, body.store_id),
        )
        cur.execute(
            "SELECT id FROM cash_flow WHERE bill_id = %s AND store_id = %s ORDER BY id",
            (body.bill_id, body.store_id),
        )
        for row in cur.fetchall():
            _remirror_cash_row(cur, row["id"], body.store_id)

        forwarding = _sync_forwarding(cur, {**bill, "payments": payments}, forwards, payments)
        conn.commit()
        return {"changed": True, "payments": payments, "forwarding": forwarding}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        cur.close()
        conn.close()

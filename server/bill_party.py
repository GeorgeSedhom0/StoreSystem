"""
Change a bill's party in place.

Unlike line edits, the party is plain attribution: it is rewritten where it
is stored, with no history -- the bill, its cash_flow rows (bill payment,
installment down payment/instalments), and its bills_collections entry, which
moves to the new party's open collection (or a new one), the same way the
insert trigger files a new bill.

Transfers are refused: a bill with a store as its party is one side of a
move, and turning it into a sale (or a sale into a transfer) would change how
analytics and the inter-store books treat it.
"""

from os import getenv
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException

from analytics_utils import Database
from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

router = APIRouter()


def set_bill_party(cur, store_id: int, bill_id: int, party_id: Optional[int]) -> bool:
    """Point the bill at party_id (None = no party). Returns True if changed.
    Runs in the caller's transaction; cur must be a RealDictCursor."""
    cur.execute(
        """
        SELECT b.id, b.party_id, ap.type AS party_type
        FROM bills b
        LEFT JOIN assosiated_parties ap ON ap.id = b.party_id
        WHERE b.id = %s AND b.store_id = %s
        FOR UPDATE OF b
        """,
        (bill_id, store_id),
    )
    bill = cur.fetchone()
    if not bill or bill_id <= 0:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    if bill["party_id"] == party_id:
        return False

    cur.execute(
        """
        SELECT 1 FROM bills_pairs
        WHERE (left_bill_id = %s AND left_store_id = %s)
           OR (right_bill_id = %s AND right_store_id = %s)
        """,
        (bill_id, store_id, bill_id, store_id),
    )
    if bill["party_type"] == "store" or cur.fetchone():
        raise HTTPException(
            status_code=400, detail="لا يمكن تغيير الطرف الثاني لفاتورة نقل بين المتاجر"
        )

    if party_id is not None:
        cur.execute("SELECT type FROM assosiated_parties WHERE id = %s", (party_id,))
        party = cur.fetchone()
        if not party:
            raise HTTPException(status_code=404, detail="الطرف الثاني غير موجود")
        if party["type"] == "store":
            raise HTTPException(
                status_code=400, detail="لا يمكن جعل متجر طرفاً ثانياً في فاتورة عادية"
            )

    cur.execute(
        "UPDATE bills SET party_id = %s WHERE id = %s AND store_id = %s",
        (party_id, bill_id, store_id),
    )
    # Amounts are unchanged, so no running-total/ledger trigger fires.
    cur.execute(
        "UPDATE cash_flow SET party_id = %s WHERE bill_id = %s AND store_id = %s",
        (party_id, bill_id, store_id),
    )

    cur.execute(
        "DELETE FROM bills_collections WHERE bill_id = %s AND store_id = %s",
        (bill_id, store_id),
    )
    if party_id is not None:
        # Same filing as the add_bill_to_collections insert trigger.
        cur.execute(
            """
            SELECT collection_id FROM bills_collections
            WHERE party_id = %s AND is_closed = FALSE
            LIMIT 1
            """,
            (party_id,),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute(
                """
                INSERT INTO bills_collections (collection_id, party_id, bill_id, store_id, is_closed)
                VALUES (%s, %s, %s, %s, FALSE)
                """,
                (existing["collection_id"], party_id, bill_id, store_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO bills_collections (party_id, bill_id, store_id, is_closed)
                VALUES (%s, %s, %s, FALSE)
                """,
                (party_id, bill_id, store_id),
            )
    return True


@router.put("/bill/party")
def update_bill_party(
    store_id: int,
    bill_id: int,
    party_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        changed = set_bill_party(cur, store_id, bill_id, party_id)
    return {"changed": changed}

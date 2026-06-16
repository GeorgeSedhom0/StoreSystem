"""
Accounts (per-payment-method wallets).

Each payment method is an account with a balance = SUM(account_transactions.amount)
for that method. The ledger mirrors cash_flow (maintained by a DB trigger), so the
sum of all account balances always equals the store's real cash total.

Operations:
- deposit  : owner puts money into an account  -> cash_flow 'in'  (owner party)
- payout   : owner takes money out of an account -> cash_flow 'out' (owner party)
- reconcile: set an account to its real-world balance -> records the difference
             as a cash_flow in/out (تسوية)
- transfer : move money between two accounts -> two ledger rows, no cash_flow
"""

import logging
from os import getenv
from typing import Optional
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException

from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

router = APIRouter()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


class Database:
    "Database context manager to handle the connection and cursor"

    def __init__(self, host, database, user, password, real_dict_cursor=True):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor

    def __enter__(self):
        self.conn = psycopg2.connect(
            host=self.host,
            database=self.database,
            user=self.user,
            password=self.password,
        )
        return self.conn.cursor(
            cursor_factory=RealDictCursor if self.real_dict_cursor else None
        )

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.conn.close()


def _get_owner_party_id(cur) -> Optional[int]:
    cur.execute("SELECT id FROM assosiated_parties WHERE type = 'owner' LIMIT 1")
    row = cur.fetchone()
    return row["id"] if row else None


def _account_balance(cur, store_id: int, method_id: int) -> float:
    cur.execute(
        """
        SELECT COALESCE(SUM(amount), 0) AS balance
        FROM account_transactions
        WHERE store_id = %s AND payment_method_id = %s
        """,
        (store_id, method_id),
    )
    return float(cur.fetchone()["balance"] or 0)


@router.get("/accounts")
def get_accounts(store_id: int, current_user: dict = Depends(get_current_user)):
    """List accounts (payment methods) with their balances, plus a total."""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    pm.id,
                    pm.name,
                    pm.is_default,
                    pm.is_deleted,
                    COALESCE((
                        SELECT SUM(at.amount)
                        FROM account_transactions at
                        WHERE at.payment_method_id = pm.id
                          AND at.store_id = %s
                    ), 0) AS balance
                FROM payment_methods pm
                WHERE pm.is_deleted = FALSE
                   OR EXISTS (
                        SELECT 1 FROM account_transactions at
                        WHERE at.payment_method_id = pm.id
                          AND at.store_id = %s
                   )
                ORDER BY pm.is_default DESC, pm.id ASC
                """,
                (store_id, store_id),
            )
            accounts = [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "is_default": r["is_default"],
                    "is_deleted": r["is_deleted"],
                    "balance": float(r["balance"] or 0),
                }
                for r in cur.fetchall()
            ]
            total = sum(a["balance"] for a in accounts)
            return {"accounts": accounts, "total": total}
    except Exception as e:
        logging.error(f"Error getting accounts: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/account-transactions")
def get_account_transactions(
    store_id: int,
    payment_method_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Ledger for a single account, newest first, with a running balance."""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    at.id,
                    TO_CHAR(at.time, 'YYYY-MM-DD HH24:MI:SS') AS time,
                    at.amount,
                    at.source,
                    cf.description,
                    cf.type AS cash_flow_type,
                    ap.name AS party_name
                FROM account_transactions at
                LEFT JOIN cash_flow cf
                    ON cf.id = at.cash_flow_id AND cf.store_id = at.store_id
                LEFT JOIN assosiated_parties ap ON cf.party_id = ap.id
                WHERE at.store_id = %s
                  AND at.payment_method_id = %s
                  AND (%s IS NULL OR at.time >= %s::timestamp)
                  AND (%s IS NULL OR at.time <= %s::timestamp)
                ORDER BY at.time DESC, at.id DESC
                """,
                (
                    store_id,
                    payment_method_id,
                    start_date,
                    start_date,
                    end_date,
                    end_date,
                ),
            )
            rows = cur.fetchall()
            return rows
    except Exception as e:
        logging.error(f"Error getting account transactions: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


def _insert_cash_flow(
    cur,
    store_id: int,
    amount_signed: float,
    move_type: str,
    description: str,
    payment_method_id: int,
    party_id: Optional[int],
    time: Optional[str] = None,
):
    """Insert a cash_flow row (the mirror trigger creates the account row)."""
    cur.execute(
        """
        INSERT INTO cash_flow (
            store_id, time, amount, type, description, party_id, payment_method_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            store_id,
            time or datetime.now().isoformat(),
            amount_signed,
            move_type,
            description,
            party_id,
            payment_method_id,
        ),
    )


@router.post("/account/deposit")
def account_deposit(
    store_id: int,
    payment_method_id: int,
    amount: float,
    description: Optional[str] = None,
    time: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Owner adds money to an account."""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            owner_id = _get_owner_party_id(cur)
            _insert_cash_flow(
                cur,
                store_id,
                amount,
                "in",
                description or "إيداع من المالك",
                payment_method_id,
                owner_id,
                time,
            )
            return {"message": "Deposit recorded successfully"}
    except Exception as e:
        logging.error(f"Error in deposit: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/account/payout")
def account_payout(
    store_id: int,
    payment_method_id: int,
    amount: float,
    description: Optional[str] = None,
    time: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Owner takes money out of an account."""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            owner_id = _get_owner_party_id(cur)
            _insert_cash_flow(
                cur,
                store_id,
                -amount,
                "out",
                description or "سحب للمالك",
                payment_method_id,
                owner_id,
                time,
            )
            return {"message": "Payout recorded successfully"}
    except Exception as e:
        logging.error(f"Error in payout: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/account/reconcile")
def account_reconcile(
    store_id: int,
    payment_method_id: int,
    actual_amount: float,
    description: Optional[str] = None,
    time: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Set an account to its real-world balance. The difference between the actual
    amount and the current computed balance is recorded as a cash_flow in/out
    (تسوية), so totals keep reconciling.
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            current_balance = _account_balance(cur, store_id, payment_method_id)
            delta = round(actual_amount - current_balance, 2)
            if abs(delta) < 0.01:
                return {"message": "No adjustment needed", "delta": 0}

            owner_id = _get_owner_party_id(cur)
            move_type = "in" if delta > 0 else "out"
            _insert_cash_flow(
                cur,
                store_id,
                delta,
                move_type,
                description or "تسوية جرد الحساب",
                payment_method_id,
                owner_id,
                time,
            )
            return {"message": "Reconciliation recorded successfully", "delta": delta}
    except Exception as e:
        logging.error(f"Error in reconcile: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/account/transfer")
def account_transfer(
    store_id: int,
    from_method_id: int,
    to_method_id: int,
    amount: float,
    description: Optional[str] = None,
    time: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Move money between two accounts. This does not change the store's total cash,
    so it writes two ledger rows directly (no cash_flow entry).
    """
    if amount <= 0:
        raise HTTPException(status_code=400, detail="المبلغ يجب أن يكون أكبر من صفر")
    if from_method_id == to_method_id:
        raise HTTPException(status_code=400, detail="لا يمكن التحويل لنفس الحساب")
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            now = time or datetime.now().isoformat()
            cur.executemany(
                """
                INSERT INTO account_transactions
                    (store_id, payment_method_id, cash_flow_id, amount, source, time)
                VALUES (%s, %s, NULL, %s, 'transfer', %s)
                """,
                [
                    (store_id, from_method_id, -amount, now),
                    (store_id, to_method_id, amount, now),
                ],
            )
            return {"message": "Transfer recorded successfully"}
    except Exception as e:
        logging.error(f"Error in transfer: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

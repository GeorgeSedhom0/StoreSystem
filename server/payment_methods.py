"""
Payment methods CRUD.

Payment methods are a dynamic, user-managed list (create / rename / delete).
They are global (not per-store), mirroring how products and parties are global.
A default "cash" (نقدي) method is seeded by init.py / update_db_18.py.

Deletion is a soft delete (is_deleted = TRUE) so historical bill payment
snapshots stay meaningful even after a method is removed.
"""

import logging
from os import getenv

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


def get_default_payment_method(cur):
    """Return the current default (or first available) active payment method."""
    cur.execute(
        """
        SELECT id, name FROM payment_methods
        WHERE is_deleted = FALSE
        ORDER BY is_default DESC, id ASC
        LIMIT 1
        """
    )
    return cur.fetchone()


@router.get("/payment-methods")
def get_payment_methods(current_user: dict = Depends(get_current_user)):
    """List all active payment methods, default first."""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT id, name, is_default
                FROM payment_methods
                WHERE is_deleted = FALSE
                ORDER BY is_default DESC, id ASC
                """
            )
            return cur.fetchall()
    except Exception as e:
        logging.error(f"Error getting payment methods: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/payment-methods")
def add_payment_method(name: str, current_user: dict = Depends(get_current_user)):
    """Create a new payment method."""
    clean_name = (name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="الاسم مطلوب")
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Reject duplicate active names (case-insensitive)
            cur.execute(
                """
                SELECT 1 FROM payment_methods
                WHERE is_deleted = FALSE AND LOWER(name) = LOWER(%s)
                """,
                (clean_name,),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400, detail="طريقة الدفع موجودة بالفعل"
                )

            # First method ever becomes the default
            cur.execute(
                "SELECT COUNT(*) AS count FROM payment_methods WHERE is_deleted = FALSE"
            )
            is_default = cur.fetchone()["count"] == 0

            cur.execute(
                """
                INSERT INTO payment_methods (name, is_default, is_deleted)
                VALUES (%s, %s, FALSE)
                RETURNING id
                """,
                (clean_name, is_default),
            )
            return {"id": cur.fetchone()["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error adding payment method: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/payment-methods")
def update_payment_method(
    id: int, name: str, current_user: dict = Depends(get_current_user)
):
    """Rename a payment method."""
    clean_name = (name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="الاسم مطلوب")
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT 1 FROM payment_methods
                WHERE is_deleted = FALSE
                  AND LOWER(name) = LOWER(%s)
                  AND id <> %s
                """,
                (clean_name, id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400, detail="طريقة الدفع موجودة بالفعل"
                )

            cur.execute(
                """
                UPDATE payment_methods
                SET name = %s
                WHERE id = %s AND is_deleted = FALSE
                """,
                (clean_name, id),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=404, detail="طريقة الدفع غير موجودة"
                )
            return {"message": "Payment method updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating payment method: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/payment-methods")
def delete_payment_method(id: int, current_user: dict = Depends(get_current_user)):
    """
    Soft-delete a payment method.

    Guards:
    - The last remaining active method cannot be deleted (there must always be
      at least one method to default new bills to).
    - When the default method is deleted, another active method is promoted.
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT id, is_default FROM payment_methods
                WHERE id = %s AND is_deleted = FALSE
                """,
                (id,),
            )
            target = cur.fetchone()
            if not target:
                raise HTTPException(
                    status_code=404, detail="طريقة الدفع غير موجودة"
                )

            cur.execute(
                "SELECT COUNT(*) AS count FROM payment_methods WHERE is_deleted = FALSE"
            )
            if cur.fetchone()["count"] <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="لا يمكن حذف طريقة الدفع الوحيدة المتبقية",
                )

            cur.execute(
                """
                UPDATE payment_methods
                SET is_deleted = TRUE, is_default = FALSE
                WHERE id = %s
                """,
                (id,),
            )

            # Promote a new default if we just removed the default one
            if target["is_default"]:
                cur.execute(
                    """
                    UPDATE payment_methods
                    SET is_default = TRUE
                    WHERE id = (
                        SELECT id FROM payment_methods
                        WHERE is_deleted = FALSE
                        ORDER BY id ASC
                        LIMIT 1
                    )
                    """
                )

            return {"message": "Payment method deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting payment method: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

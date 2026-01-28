"""
Product Batches API endpoints for tracking inventory by expiration date.
Handles batch management including FEFO (First Expired, First Out) logic.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime, date
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv

from auth_middleware import get_current_user

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

router = APIRouter(tags=["Product Batches"])


class BatchCreate(BaseModel):
    """Model for creating/updating a batch"""

    quantity: int
    expiration_date: Optional[str] = None  # ISO format date string


class BatchUpdate(BaseModel):
    """Model for updating batches"""

    batches: List[BatchCreate]


class Database:
    """Database context manager to handle the connection and cursor"""

    def __init__(self, host, database, user, password, real_dict_cursor=True):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor
        self.conn = psycopg2.connect(
            host=self.host,
            database=self.database,
            user=self.user,
            password=self.password,
        )
        self.cursor = self.conn.cursor(
            cursor_factory=RealDictCursor if self.real_dict_cursor else None
        )

    def __enter__(self):
        return self.cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.cursor.close()
        self.conn.close()


@router.get("/product/{product_id}/batches")
def get_product_batches(
    product_id: int,
    store_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    Get all batches for a product in a store, sorted by expiration date (FEFO).

    Args:
        product_id: The product ID
        store_id: The store ID

    Returns:
        List of batches with their quantities and expiration dates
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT 
                    pb.id,
                    pb.store_id,
                    pb.product_id,
                    pb.quantity,
                    pb.expiration_date,
                    pb.created_at,
                    p.name as product_name
                FROM product_batches pb
                JOIN products p ON pb.product_id = p.id
                WHERE pb.product_id = %s AND pb.store_id = %s AND pb.quantity > 0
                ORDER BY pb.expiration_date ASC NULLS LAST
                """,
                (product_id, store_id),
            )
            batches = cur.fetchall()

            # Convert date objects to strings for JSON serialization
            for batch in batches:
                if batch.get("expiration_date") and isinstance(
                    batch["expiration_date"], (date, datetime)
                ):
                    batch["expiration_date"] = batch["expiration_date"].isoformat()
                if batch.get("created_at") and isinstance(
                    batch["created_at"], datetime
                ):
                    batch["created_at"] = batch["created_at"].isoformat()

            # Get total stock for verification
            cur.execute(
                """
                SELECT stock FROM product_inventory
                WHERE product_id = %s AND store_id = %s
                """,
                (product_id, store_id),
            )
            inventory = cur.fetchone()
            total_stock = inventory["stock"] if inventory else 0

            # Calculate total batch quantity
            total_batch_qty = sum(b["quantity"] for b in batches)

            return JSONResponse(
                content={
                    "batches": batches,
                    "total_stock": total_stock,
                    "total_batch_quantity": total_batch_qty,
                    "untracked_quantity": total_stock - total_batch_qty,
                }
            )

    except Exception as e:
        print(f"Error getting product batches: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/batches/expiration-info")
def get_all_batches_expiration_info(
    store_id: int,
    threshold_days: int = 14,
    current_user: dict = Depends(get_current_user),
):
    """
    Get expiration info for all products with batches in a store.
    Returns earliest expiration date and whether product has expiring batches.
    This is a bulk endpoint to avoid N+1 queries.

    Args:
        store_id: The store ID
        threshold_days: Number of days to consider as "expiring soon"

    Returns:
        Dict mapping product_id to expiration info
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get earliest expiration and check for expiring batches in one query
            cur.execute(
                """
                SELECT 
                    pb.product_id,
                    MIN(pb.expiration_date) as earliest_expiration,
                    BOOL_OR(pb.expiration_date <= CURRENT_DATE + %s) as has_expiring_batches
                FROM product_batches pb
                WHERE pb.store_id = %s 
                AND pb.quantity > 0
                AND pb.expiration_date IS NOT NULL
                GROUP BY pb.product_id
                """,
                (threshold_days, store_id),
            )
            results = cur.fetchall()

            # Build response dict
            expiration_info = {}
            for row in results:
                product_id = row["product_id"]
                earliest = row["earliest_expiration"]
                expiration_info[product_id] = {
                    "earliest_expiration": earliest.isoformat() if earliest else None,
                    "has_expiring_batches": row["has_expiring_batches"] or False,
                }

            return JSONResponse(content=expiration_info)

    except Exception as e:
        print(f"Error getting batches expiration info: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/product/{product_id}/batches")
def update_product_batches(
    product_id: int,
    store_id: int,
    batch_update: BatchUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Replace all batches for a product. Validates total equals current stock.

    Args:
        product_id: The product ID
        store_id: The store ID
        batch_update: The new batch configuration

    Returns:
        Updated batches
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get current stock
            cur.execute(
                """
                SELECT stock FROM product_inventory
                WHERE product_id = %s AND store_id = %s
                """,
                (product_id, store_id),
            )
            inventory = cur.fetchone()
            if not inventory:
                raise HTTPException(
                    status_code=404, detail="Product not found in inventory"
                )

            current_stock = inventory["stock"]

            # Calculate total from new batches
            total_new_qty = sum(b.quantity for b in batch_update.batches)

            if total_new_qty != current_stock:
                raise HTTPException(
                    status_code=400,
                    detail=f"Total batch quantity ({total_new_qty}) must equal current stock ({current_stock})",
                )

            # Delete existing batches
            cur.execute(
                """
                DELETE FROM product_batches
                WHERE product_id = %s AND store_id = %s
                """,
                (product_id, store_id),
            )

            # Insert new batches (aggregate by expiration date)
            aggregated = {}
            for batch in batch_update.batches:
                exp_date = batch.expiration_date
                if exp_date in aggregated:
                    aggregated[exp_date] += batch.quantity
                else:
                    aggregated[exp_date] = batch.quantity

            for exp_date, qty in aggregated.items():
                if qty > 0:
                    cur.execute(
                        """
                        INSERT INTO product_batches (store_id, product_id, quantity, expiration_date)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (store_id, product_id, qty, exp_date),
                    )

            # Return updated batches
            cur.execute(
                """
                SELECT id, store_id, product_id, quantity, expiration_date, created_at
                FROM product_batches
                WHERE product_id = %s AND store_id = %s
                ORDER BY expiration_date ASC NULLS LAST
                """,
                (product_id, store_id),
            )
            updated_batches = cur.fetchall()

            # Convert date objects to strings for JSON serialization
            for batch in updated_batches:
                if batch.get("expiration_date") and isinstance(
                    batch["expiration_date"], (date, datetime)
                ):
                    batch["expiration_date"] = batch["expiration_date"].isoformat()
                if batch.get("created_at") and isinstance(
                    batch["created_at"], datetime
                ):
                    batch["created_at"] = batch["created_at"].isoformat()

            return JSONResponse(
                content={
                    "message": "Batches updated successfully",
                    "batches": updated_batches,
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating product batches: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/product/{product_id}/batches/add")
def add_to_batches(
    product_id: int,
    store_id: int,
    batches: List[BatchCreate],
    current_user: dict = Depends(get_current_user),
):
    """
    Add quantities to batches (used when buying products).
    Creates new batches or updates existing ones with the same expiration date.

    Args:
        product_id: The product ID
        store_id: The store ID
        batches: List of batches to add

    Returns:
        Updated batches
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            for batch in batches:
                if batch.quantity <= 0:
                    continue

                # Use upsert to add to existing batch or create new one
                cur.execute(
                    """
                    INSERT INTO product_batches (store_id, product_id, quantity, expiration_date)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (store_id, product_id, expiration_date)
                    DO UPDATE SET quantity = product_batches.quantity + EXCLUDED.quantity
                    """,
                    (store_id, product_id, batch.quantity, batch.expiration_date),
                )

            # Return updated batches
            cur.execute(
                """
                SELECT id, store_id, product_id, quantity, expiration_date, created_at
                FROM product_batches
                WHERE product_id = %s AND store_id = %s AND quantity > 0
                ORDER BY expiration_date ASC NULLS LAST
                """,
                (product_id, store_id),
            )
            updated_batches = cur.fetchall()

            # Convert date objects to strings for JSON serialization
            for batch in updated_batches:
                if batch.get("expiration_date") and isinstance(
                    batch["expiration_date"], (date, datetime)
                ):
                    batch["expiration_date"] = batch["expiration_date"].isoformat()
                if batch.get("created_at") and isinstance(
                    batch["created_at"], datetime
                ):
                    batch["created_at"] = batch["created_at"].isoformat()

            return JSONResponse(
                content={
                    "message": "Batches added successfully",
                    "batches": updated_batches,
                }
            )

    except Exception as e:
        print(f"Error adding to batches: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ===== Internal functions for batch management (used by bill operations) =====


def consume_batches_fefo(
    cur,
    store_id: int,
    product_id: int,
    quantity: int,
    specific_batch_id: Optional[int] = None,
) -> List[dict]:
    """
    Consume quantity from batches using FEFO (First Expired, First Out).
    If specific_batch_id is provided, consume from that batch only.

    Args:
        cur: Database cursor
        store_id: The store ID
        product_id: The product ID
        quantity: Quantity to consume
        specific_batch_id: Optional specific batch to consume from

    Returns:
        List of consumed batch info
    """
    consumed = []
    remaining = quantity

    if specific_batch_id:
        # Consume from specific batch
        cur.execute(
            """
            SELECT id, quantity, expiration_date
            FROM product_batches
            WHERE id = %s AND store_id = %s AND product_id = %s AND quantity > 0
            FOR UPDATE
            """,
            (specific_batch_id, store_id, product_id),
        )
    else:
        # Get batches in FEFO order
        cur.execute(
            """
            SELECT id, quantity, expiration_date
            FROM product_batches
            WHERE store_id = %s AND product_id = %s AND quantity > 0
            ORDER BY expiration_date ASC NULLS LAST
            FOR UPDATE
            """,
            (store_id, product_id),
        )

    batches = cur.fetchall()

    for batch in batches:
        if remaining <= 0:
            break

        batch_id = batch["id"]
        available = batch["quantity"]
        exp_date = batch["expiration_date"]

        consume_qty = min(remaining, available)
        new_qty = available - consume_qty

        if new_qty > 0:
            cur.execute(
                """
                UPDATE product_batches SET quantity = %s WHERE id = %s
                """,
                (new_qty, batch_id),
            )
        else:
            cur.execute(
                """
                DELETE FROM product_batches WHERE id = %s
                """,
                (batch_id,),
            )

        consumed.append(
            {
                "batch_id": batch_id,
                "quantity": consume_qty,
                "expiration_date": str(exp_date) if exp_date else None,
            }
        )
        remaining -= consume_qty

    return consumed


def add_to_batch(
    cur,
    store_id: int,
    product_id: int,
    quantity: int,
    expiration_date: Optional[str] = None,
):
    """
    Add quantity to a batch. If expiration_date matches existing batch, add to it.
    Otherwise create new batch.

    Args:
        cur: Database cursor
        store_id: The store ID
        product_id: The product ID
        quantity: Quantity to add
        expiration_date: Optional expiration date
    """
    if quantity <= 0:
        return

    cur.execute(
        """
        INSERT INTO product_batches (store_id, product_id, quantity, expiration_date)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (store_id, product_id, expiration_date)
        DO UPDATE SET quantity = product_batches.quantity + EXCLUDED.quantity
        """,
        (store_id, product_id, quantity, expiration_date),
    )


def adjust_batches_for_stock_change(
    cur, store_id: int, product_id: int, old_stock: int, new_stock: int
):
    """
    Adjust batches when stock is manually changed in products page.
    - If stock decreased: Use FEFO to remove from earliest expiring batches
    - If stock increased: Add to the batch with highest quantity

    Args:
        cur: Database cursor
        store_id: The store ID
        product_id: The product ID
        old_stock: Previous stock level
        new_stock: New stock level
    """
    difference = new_stock - old_stock

    if difference == 0:
        return

    if difference < 0:
        # Stock decreased - consume using FEFO
        consume_batches_fefo(cur, store_id, product_id, abs(difference))
    else:
        # Stock increased - add to largest batch or create one with no expiration
        cur.execute(
            """
            SELECT id, quantity, expiration_date
            FROM product_batches
            WHERE store_id = %s AND product_id = %s AND quantity > 0
            ORDER BY quantity DESC
            LIMIT 1
            """,
            (store_id, product_id),
        )
        largest_batch = cur.fetchone()

        if largest_batch:
            # Add to the largest existing batch
            exp_date = largest_batch["expiration_date"]
            add_to_batch(
                cur,
                store_id,
                product_id,
                difference,
                str(exp_date) if exp_date else None,
            )
        else:
            # No batches exist - create one without expiration date
            add_to_batch(cur, store_id, product_id, difference, None)


def get_earliest_expiration_batch(
    cur, store_id: int, product_id: int
) -> Optional[dict]:
    """
    Get the batch with the earliest expiration date that has quantity.

    Args:
        cur: Database cursor
        store_id: The store ID
        product_id: The product ID

    Returns:
        Batch info or None
    """
    cur.execute(
        """
        SELECT id, quantity, expiration_date
        FROM product_batches
        WHERE store_id = %s AND product_id = %s AND quantity > 0
        ORDER BY expiration_date ASC NULLS LAST
        LIMIT 1
        """,
        (store_id, product_id),
    )
    return cur.fetchone()

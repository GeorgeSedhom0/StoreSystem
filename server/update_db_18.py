"""
Database migration script for the payment methods feature.

This migration:
1. Creates the payment_methods table (dynamic, user-managed list of methods).
2. Seeds a default "cash" (نقدي) method when none exist.
3. Adds a payments JSONB column to bills to store the per-method payment split.
4. Backfills every existing real bill to be 100% paid with the default cash
   method, so historical data keeps a consistent payment shape.

The payments column stores an array of objects:
    [{"method_id": <int|null>, "name": "<snapshot name>", "amount": <float>}]
Amounts are positive and sum to the absolute bill total.

It is idempotent and safe to run multiple times.
"""

import logging
from os import getenv

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
cursor = conn.cursor(cursor_factory=RealDictCursor)

DEFAULT_CASH_NAME = "نقدي"
DB_VERSION = "18"


def create_payment_methods_table():
    """Create the payment_methods table if it does not exist."""
    logging.info("Ensuring payment_methods table exists...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_methods (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR NOT NULL,
            is_default BOOLEAN DEFAULT FALSE,
            is_deleted BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    # Unique name only among active (non-deleted) methods so a deleted name can be reused.
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_unique_active_name
        ON payment_methods (name)
        WHERE is_deleted = FALSE
        """
    )


def seed_default_cash_method():
    """Insert the default cash method when there is no active method yet."""
    logging.info("Seeding default cash payment method if needed...")
    cursor.execute(
        "SELECT COUNT(*) AS count FROM payment_methods WHERE is_deleted = FALSE"
    )
    if cursor.fetchone()["count"] == 0:
        cursor.execute(
            """
            INSERT INTO payment_methods (name, is_default, is_deleted)
            VALUES (%s, TRUE, FALSE)
            """,
            (DEFAULT_CASH_NAME,),
        )
        logging.info("Inserted default cash method '%s'", DEFAULT_CASH_NAME)
    else:
        # Guarantee at least one method is flagged as default.
        cursor.execute(
            "SELECT COUNT(*) AS count FROM payment_methods WHERE is_default = TRUE AND is_deleted = FALSE"
        )
        if cursor.fetchone()["count"] == 0:
            cursor.execute(
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


def add_payments_column():
    """Add the payments JSONB column to bills when missing."""
    logging.info("Ensuring bills.payments column exists...")
    cursor.execute(
        """
        ALTER TABLE bills
        ADD COLUMN IF NOT EXISTS payments JSONB
        """
    )


def backfill_bill_payments():
    """Backfill every real bill to be 100% paid with the default cash method."""
    logging.info("Backfilling existing bills to 100% cash payment...")

    cursor.execute(
        """
        SELECT id, name FROM payment_methods
        WHERE is_deleted = FALSE
        ORDER BY is_default DESC, id ASC
        LIMIT 1
        """
    )
    default_method = cursor.fetchone()
    if not default_method:
        logging.warning("No payment method available; skipping backfill")
        return

    cursor.execute(
        """
        UPDATE bills
        SET payments = jsonb_build_array(
            jsonb_build_object(
                'method_id', %s::bigint,
                'name', %s::text,
                'amount', ROUND(ABS(COALESCE(total, 0))::numeric, 2)
            )
        )
        WHERE id <> -1
          AND payments IS NULL
        """,
        (default_method["id"], default_method["name"]),
    )
    logging.info("Backfilled payments for %s bills", cursor.rowcount or 0)


def set_db_version():
    """Record the applied database schema version in db_meta."""
    logging.info("Recording database version %s...", DB_VERSION)
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS db_meta (
            key VARCHAR PRIMARY KEY,
            value VARCHAR
        )
        """
    )
    cursor.execute(
        """
        INSERT INTO db_meta (key, value)
        VALUES ('version', %s)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """,
        (DB_VERSION,),
    )


def run_migration():
    """Run all migration steps."""
    logging.info("Starting migration update_db_18 (payment methods)...")

    try:
        create_payment_methods_table()
        seed_default_cash_method()
        add_payments_column()
        backfill_bill_payments()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_18 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

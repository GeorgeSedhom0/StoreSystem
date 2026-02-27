"""
Database migration script for analytics performance indexing.

This migration adds high-impact indexes used by analytics endpoints in:
- analytics.py
- detailed_analytics.py
- analytics_utils.py

All indexes are created with IF NOT EXISTS to keep the migration idempotent.
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


def create_analytics_indexes():
    """Create indexes that accelerate analytics workloads."""
    logging.info("Creating analytics indexes...")

    # bills: frequent filters by store/time/type and client-history lookups
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bills_store_time_type_id
        ON bills (store_id, time, type, id)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bills_store_party_type_time
        ON bills (store_id, party_id, type, time)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bills_store_type_time_sell_buy
        ON bills (store_id, type, time)
        WHERE type IN ('sell', 'buy', 'return')
        """
    )

    # products_flow: heavy scans by store/product/time and bill joins
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_flow_store_product_time
        ON products_flow (store_id, product_id, time)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_flow_store_bill
        ON products_flow (store_id, bill_id)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_flow_store_product_time_negative
        ON products_flow (store_id, product_id, time)
        WHERE amount < 0
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_flow_store_product_time_zero_total
        ON products_flow (store_id, product_id, time DESC)
        WHERE total = 0
        """
    )

    # cash_flow: daily in/out and non-bill cash metrics
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_cash_flow_store_time_type
        ON cash_flow (store_id, time, type)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_cash_flow_store_time_non_bill
        ON cash_flow (store_id, time)
        WHERE bill_id IS NULL
        """
    )

    # product_inventory: active inventory lookup per store
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_product_inventory_store_deleted_product
        ON product_inventory (store_id, is_deleted, product_id)
        """
    )

    # shifts: range queries by start/end timestamps
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_shifts_store_start_time
        ON shifts (store_id, start_date_time)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_shifts_store_end_time_not_null
        ON shifts (store_id, end_date_time)
        WHERE end_date_time IS NOT NULL
        """
    )

    logging.info("Analytics indexes migration complete")


def run_migration():
    """Run all migration steps."""
    logging.info("Starting migration update_db_16...")

    try:
        create_analytics_indexes()
        conn.commit()
        logging.info("Migration update_db_16 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

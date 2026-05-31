"""
Database migration script for reservation schema hardening.

This migration:
1. Adds bill_id to reserved_products so reservations are tracked per bill.
2. Backfills bill_id for existing active reservations when an exact match is available.
3. Replaces the old one-row-per-store-product rule with one-row-per-bill-product.
4. Adds supporting indexes and a foreign key for future integrity.

It is idempotent and safe to run multiple times.
"""

import logging
from os import getenv

import psycopg2
from psycopg2 import sql
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


def ensure_bill_id_column():
    """Add the reservation bill reference column when it is missing."""
    logging.info("Ensuring reserved_products.bill_id exists...")
    cursor.execute(
        """
        ALTER TABLE reserved_products
        ADD COLUMN IF NOT EXISTS bill_id BIGINT
        """
    )


def backfill_bill_ids():
    """Populate bill_id for legacy rows when there is a single exact active match."""
    logging.info("Backfilling reservation bill references...")
    cursor.execute(
        """
        WITH reserve_bill_product_totals AS (
            SELECT
                pf.store_id,
                pf.product_id,
                pf.bill_id,
                SUM(ABS(pf.amount))::BIGINT AS amount
            FROM products_flow pf
            JOIN bills b
                ON b.id = pf.bill_id
                AND b.store_id = pf.store_id
            WHERE b.type = 'reserve'
            GROUP BY pf.store_id, pf.product_id, pf.bill_id
        ),
        exact_matches AS (
            SELECT
                rp.id AS reserved_product_id,
                rbpt.bill_id
            FROM reserved_products rp
            JOIN reserve_bill_product_totals rbpt
                ON rbpt.store_id = rp.store_id
                AND rbpt.product_id = rp.product_id
                AND rbpt.amount = rp.amount
            WHERE rp.bill_id IS NULL
        ),
        unique_matches AS (
            SELECT
                reserved_product_id,
                MIN(bill_id) AS bill_id
            FROM exact_matches
            GROUP BY reserved_product_id
            HAVING COUNT(*) = 1
        )
        UPDATE reserved_products rp
        SET bill_id = unique_matches.bill_id
        FROM unique_matches
        WHERE rp.id = unique_matches.reserved_product_id
        """
    )

    updated_count = cursor.rowcount if cursor.rowcount is not None else 0
    logging.info("Backfilled bill_id for %s reservation rows", updated_count)

    cursor.execute(
        """
        SELECT COUNT(*) AS unmatched_rows
        FROM reserved_products
        WHERE bill_id IS NULL
        """
    )
    unmatched_rows = cursor.fetchone()["unmatched_rows"]
    logging.info(
        "%s reservation rows still have no bill_id and will use legacy cleanup fallback",
        unmatched_rows,
    )


def merge_duplicate_bill_rows():
    """Collapse duplicate bill-scoped rows without losing reserved quantities."""
    logging.info("Merging duplicate bill-scoped reservation rows if any exist...")
    cursor.execute(
        """
        WITH duplicate_groups AS (
            SELECT
                MIN(id) AS keep_id,
                ARRAY_REMOVE(ARRAY_AGG(id), MIN(id)) AS delete_ids,
                SUM(amount) AS merged_amount
            FROM reserved_products
            WHERE bill_id IS NOT NULL
            GROUP BY store_id, bill_id, product_id
            HAVING COUNT(*) > 1
        ),
        updated_rows AS (
            UPDATE reserved_products rp
            SET amount = duplicate_groups.merged_amount
            FROM duplicate_groups
            WHERE rp.id = duplicate_groups.keep_id
            RETURNING rp.id
        )
        DELETE FROM reserved_products rp
        USING duplicate_groups
        WHERE rp.id = ANY(duplicate_groups.delete_ids)
        """
    )


def drop_legacy_unique_constraints():
    """Remove the old one-reservation-per-store-product uniqueness rule."""
    logging.info("Dropping legacy reservation uniqueness constraints...")
    cursor.execute(
        """
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'reserved_products'
        AND nsp.nspname = 'public'
        AND con.contype = 'u'
        AND pg_get_constraintdef(con.oid) ILIKE 'UNIQUE (store_id, product_id)%'
        """
    )

    for row in cursor.fetchall():
        cursor.execute(
            sql.SQL(
                "ALTER TABLE reserved_products DROP CONSTRAINT IF EXISTS {}"
            ).format(sql.Identifier(row["conname"]))
        )
        logging.info("Dropped legacy constraint %s", row["conname"])


def ensure_new_unique_constraint():
    """Enforce a single reservation row per bill and product."""
    logging.info("Ensuring bill-scoped reservation uniqueness...")
    cursor.execute(
        """
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'reserved_products'
        AND nsp.nspname = 'public'
        AND con.conname = 'reserved_products_store_bill_product_unique'
        """
    )

    if cursor.fetchone() is None:
        cursor.execute(
            """
            ALTER TABLE reserved_products
            ADD CONSTRAINT reserved_products_store_bill_product_unique
            UNIQUE (store_id, bill_id, product_id)
            """
        )


def ensure_bill_foreign_key():
    """Add the bill reference foreign key when current data is compatible."""
    logging.info("Ensuring reservation bill foreign key...")
    cursor.execute(
        """
        SELECT COUNT(*) AS invalid_rows
        FROM reserved_products rp
        LEFT JOIN bills b
            ON b.id = rp.bill_id
            AND b.store_id = rp.store_id
        WHERE rp.bill_id IS NOT NULL
        AND b.id IS NULL
        """
    )
    invalid_rows = cursor.fetchone()["invalid_rows"]

    if invalid_rows:
        logging.warning(
            "Skipping reservation bill foreign key because %s rows reference missing bills",
            invalid_rows,
        )
        return

    cursor.execute(
        """
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'reserved_products'
        AND nsp.nspname = 'public'
        AND con.conname = 'fk_reserved_products_bill_store'
        """
    )

    if cursor.fetchone() is None:
        cursor.execute(
            """
            ALTER TABLE reserved_products
            ADD CONSTRAINT fk_reserved_products_bill_store
            FOREIGN KEY (bill_id, store_id) REFERENCES bills(id, store_id)
            ON DELETE CASCADE
            """
        )


def ensure_indexes():
    """Create the non-unique lookup indexes used by reservation reads and cleanup."""
    logging.info("Ensuring reservation indexes...")
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_reserved_products_store_product
        ON reserved_products (store_id, product_id)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_reserved_products_store_bill
        ON reserved_products (store_id, bill_id)
        """
    )


def run_migration():
    """Run all migration steps."""
    logging.info("Starting migration update_db_17...")

    try:
        ensure_bill_id_column()
        backfill_bill_ids()
        merge_duplicate_bill_rows()
        drop_legacy_unique_constraints()
        ensure_new_unique_constraint()
        ensure_bill_foreign_key()
        ensure_indexes()
        conn.commit()
        logging.info("Migration update_db_17 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()
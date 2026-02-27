"""
Database migration script for store-party backfill hardening.
This migration:
1. Creates missing assosiated_parties rows for stores that do not have one.
2. Normalizes existing mapped store-party rows to match current store data.

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


def backfill_missing_store_parties():
    """Insert store-linked parties only for stores that currently have none."""
    logging.info("Backfilling missing store-linked parties...")

    cursor.execute(
        """
        INSERT INTO assosiated_parties (name, phone, address, type, extra_info)
        SELECT
            sd.name,
            sd.phone,
            sd.address,
            'store',
            jsonb_build_object('store_id', sd.id)
        FROM store_data sd
        WHERE NOT EXISTS (
            SELECT 1
            FROM assosiated_parties ap
            WHERE ap.extra_info->>'store_id' = sd.id::text
        )
        """
    )

    inserted_count = cursor.rowcount if cursor.rowcount is not None else 0
    logging.info("Inserted %s missing store-linked parties", inserted_count)


def normalize_existing_store_parties():
    """Ensure existing mapped store-parties are aligned with store_data values."""
    logging.info("Normalizing existing store-linked parties...")

    cursor.execute(
        """
        UPDATE assosiated_parties ap
        SET
            name = sd.name,
            phone = sd.phone,
            address = sd.address,
            type = 'store'
        FROM store_data sd
        WHERE ap.extra_info->>'store_id' = sd.id::text
        """
    )

    updated_count = cursor.rowcount if cursor.rowcount is not None else 0
    logging.info("Updated %s existing store-linked parties", updated_count)


def run_migration():
    """Run all migration steps."""
    logging.info("Starting migration update_db_15...")

    try:
        backfill_missing_store_parties()
        normalize_existing_store_parties()
        conn.commit()
        logging.info("Migration update_db_15 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

"""
Database migration: bill corrections.

Adds the privileged "تصحيح الفواتير" page (/bill-corrections) and the
bill_corrections log. A correction rewrites a bill in place, as if it had been
entered that way; the log is the only record of it (who, when, before/after),
kept so a correction can be reviewed and reverted.

The page is NOT added to any scope: grant it explicitly from Settings ->
Scopes to the users who may rewrite history. The backend checks it too.

Idempotent and safe to re-run.
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

DB_VERSION = "24"


def create_bill_corrections_table():
    logging.info("Creating bill_corrections...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bill_corrections (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            user_id BIGINT,
            username VARCHAR,
            action VARCHAR NOT NULL,
            store_id BIGINT NOT NULL,
            bill_id BIGINT NOT NULL,
            pair_store_id BIGINT,
            pair_bill_id BIGINT,
            note TEXT,
            before JSONB NOT NULL,
            after JSONB,
            impact JSONB,
            reverts_id BIGINT REFERENCES bill_corrections(id),
            reverted_by BIGINT REFERENCES bill_corrections(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bill_corrections_bill
        ON bill_corrections (store_id, bill_id)
        """
    )


def create_indexes():
    # Price-history lookups go by product across all stores.
    logging.info("Creating products_flow (product_id, time) index...")
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_flow_product_time
        ON products_flow (product_id, time)
        """
    )


def register_page():
    logging.info("Registering the bill corrections page...")
    cursor.execute(
        """
        INSERT INTO pages (name, path)
        SELECT 'تصحيح الفواتير', '/bill-corrections'
        WHERE NOT EXISTS (SELECT 1 FROM pages WHERE path = '/bill-corrections')
        """
    )


def set_db_version():
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
    logging.info("Starting migration update_db_24 (bill corrections)...")
    try:
        create_bill_corrections_table()
        create_indexes()
        register_page()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_24 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

"""
Database migration: cross-store accounts foundation.

Adds payment_methods.home_store_id — the store whose physical/online account a
method actually is (e.g. an InstaPay wallet that belongs to one store). NULL
means the method is independent per store (like cash). The default cash method
is never home-tagged.

No trigger or core-schema changes: the inter-store balance is derived from
existing cross-store cash_flow rows, and the accounts mirror already attributes
by cash_flow.payment_method_id.

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

DB_VERSION = "23"


def add_home_store_column():
    logging.info("Adding payment_methods.home_store_id...")
    cursor.execute(
        """
        ALTER TABLE payment_methods
        ADD COLUMN IF NOT EXISTS home_store_id BIGINT REFERENCES store_data(id)
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
    logging.info("Starting migration update_db_23 (cross-store accounts)...")
    try:
        add_home_store_column()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_23 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

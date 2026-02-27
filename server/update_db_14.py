"""
Database migration script for transfer bill pairing support.
This migration creates bills_pairs table and indexes used to link mirrored bills.
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


def create_bills_pairs_table():
    """Create bills_pairs table and indexes if they do not exist."""
    logging.info("Creating bills_pairs table if needed...")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bills_pairs (
            id BIGSERIAL PRIMARY KEY,
            left_bill_id BIGINT NOT NULL,
            left_store_id BIGINT NOT NULL,
            right_bill_id BIGINT NOT NULL,
            right_store_id BIGINT NOT NULL,
            created_via VARCHAR,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT bills_pairs_left_fk
                FOREIGN KEY (left_bill_id, left_store_id) REFERENCES bills(id, store_id),
            CONSTRAINT bills_pairs_right_fk
                FOREIGN KEY (right_bill_id, right_store_id) REFERENCES bills(id, store_id),
            CONSTRAINT bills_pairs_distinct_pair
                CHECK (left_bill_id <> right_bill_id OR left_store_id <> right_store_id),
            CONSTRAINT bills_pairs_unique_pair
                UNIQUE (left_bill_id, left_store_id, right_bill_id, right_store_id)
        )
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bills_pairs_left
        ON bills_pairs (left_store_id, left_bill_id)
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bills_pairs_right
        ON bills_pairs (right_store_id, right_bill_id)
        """
    )

    logging.info("bills_pairs table migration complete")


def run_migration():
    """Run all migration steps"""
    logging.info("Starting migration update_db_14...")

    try:
        create_bills_pairs_table()
        conn.commit()
        logging.info("Migration update_db_14 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

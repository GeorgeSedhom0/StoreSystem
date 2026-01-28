"""
Database migration script for adding barcode support to associated_parties.
This migration adds:
1. bar_code column to assosiated_parties table (VARCHAR, UNIQUE, nullable)
2. Index for fast barcode lookups
"""

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv
import logging

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# Create the connection
conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
cursor = conn.cursor(cursor_factory=RealDictCursor)


def column_exists(table_name, column_name):
    """Check if a column exists in a table"""
    cursor.execute(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
        )
        """,
        (table_name, column_name),
    )
    return cursor.fetchone()["exists"]


def add_barcode_column():
    """Add bar_code column to assosiated_parties table"""
    logging.info("Checking if bar_code column exists in assosiated_parties...")

    if column_exists("assosiated_parties", "bar_code"):
        logging.info("bar_code column already exists, skipping...")
        return

    logging.info("Adding bar_code column to assosiated_parties table...")

    cursor.execute("""
        ALTER TABLE assosiated_parties
        ADD COLUMN bar_code VARCHAR(20) UNIQUE
    """)

    conn.commit()
    logging.info("bar_code column added successfully")


def create_barcode_index():
    """Create index for fast barcode lookups"""
    logging.info("Creating index for bar_code column...")

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_parties_barcode
        ON assosiated_parties(bar_code)
        WHERE bar_code IS NOT NULL
    """)

    conn.commit()
    logging.info("Index created successfully")


def run_migration():
    """Run all migration steps"""
    logging.info("Starting migration update_db_11...")

    try:
        add_barcode_column()
        create_barcode_index()
        logging.info("Migration update_db_11 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

"""
Database migration script for adding notes to bills.
This migration adds:
1. note column to bills table (TEXT, nullable)
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


def column_exists(table_name, column_name):
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


def add_note_column():
    logging.info("Checking if note column exists in bills...")

    if column_exists("bills", "note"):
        logging.info("note column already exists, skipping...")
        return

    logging.info("Adding note column to bills table...")
    cursor.execute(
        """
        ALTER TABLE bills
        ADD COLUMN note TEXT
        """
    )
    conn.commit()
    logging.info("note column added successfully")


def run_migration():
    logging.info("Starting migration update_db_12...")

    try:
        add_note_column()
        logging.info("Migration update_db_12 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

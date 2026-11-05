"""
Database migration v26: product packages, attendance & salary periods.

1. Product packages (عبوات): a named multiple of a product's base unit with its
   own price and optional barcode.
   - product_packages table.
   - products_flow.package_id / package_units / package_name: a snapshot on a
     bill line sold/bought as a package. amount/price stay in base units, so
     stock, profit and analytics are unaffected.

2. Attendance:
   - employee.pay_type / off_days / daily_hours / shift_start / track_attendance
   - employee_attendance table (one row per employee per day).
   - salaries.period_start / period_end / details / note.

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

DB_VERSION = "26"


def create_packages(cursor):
    logging.info("Creating product_packages...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS product_packages (
            id BIGSERIAL PRIMARY KEY,
            product_id BIGINT NOT NULL REFERENCES products(id),
            name VARCHAR NOT NULL,
            units INT NOT NULL CHECK (units >= 2),
            price FLOAT NOT NULL DEFAULT 0,
            bar_code VARCHAR,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_product_packages_product
        ON product_packages (product_id) WHERE is_deleted = FALSE
        """
    )
    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_product_packages_unique_barcode
        ON product_packages (bar_code)
        WHERE is_deleted = FALSE AND bar_code IS NOT NULL AND bar_code <> ''
        """
    )
    logging.info("Adding package snapshot columns to products_flow...")
    cursor.execute(
        """
        ALTER TABLE products_flow ADD COLUMN IF NOT EXISTS package_id BIGINT;
        ALTER TABLE products_flow ADD COLUMN IF NOT EXISTS package_units INT;
        ALTER TABLE products_flow ADD COLUMN IF NOT EXISTS package_name VARCHAR;
        """
    )


def create_attendance(cursor):
    logging.info("Adding attendance columns to employee...")
    cursor.execute(
        """
        ALTER TABLE employee ADD COLUMN IF NOT EXISTS pay_type VARCHAR NOT NULL DEFAULT 'monthly';
        ALTER TABLE employee ADD COLUMN IF NOT EXISTS off_days INT[] NOT NULL DEFAULT '{}';
        ALTER TABLE employee ADD COLUMN IF NOT EXISTS daily_hours FLOAT NOT NULL DEFAULT 8;
        ALTER TABLE employee ADD COLUMN IF NOT EXISTS shift_start TIME;
        ALTER TABLE employee ADD COLUMN IF NOT EXISTS track_attendance BOOLEAN NOT NULL DEFAULT TRUE;
        """
    )
    logging.info("Creating employee_attendance...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS employee_attendance (
            id BIGSERIAL PRIMARY KEY,
            employee_id BIGINT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
            day DATE NOT NULL,
            status VARCHAR NOT NULL,
            check_in TIMESTAMP,
            check_out TIMESTAMP,
            note TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (employee_id, day)
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_employee_attendance_day ON employee_attendance (day)"
    )
    logging.info("Adding period columns to salaries...")
    cursor.execute(
        """
        ALTER TABLE salaries ADD COLUMN IF NOT EXISTS period_start DATE;
        ALTER TABLE salaries ADD COLUMN IF NOT EXISTS period_end DATE;
        ALTER TABLE salaries ADD COLUMN IF NOT EXISTS details JSONB;
        ALTER TABLE salaries ADD COLUMN IF NOT EXISTS note TEXT;
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_employee_store ON employee (store_id)"
    )


def fix_page_names(cursor):
    # update_db_4 seeded a misspelled menu label; fresh installs (init.py)
    # never had it.
    logging.info("Fixing page names...")
    cursor.execute(
        """
        UPDATE pages SET name = 'ادارة الاقساط'
        WHERE path = '/installments' AND name = 'اداارة الاقساط'
        """
    )


def set_version(cursor):
    cursor.execute(
        """
        INSERT INTO db_meta (key, value) VALUES ('version', %s)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """,
        (DB_VERSION,),
    )


def main():
    conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        create_packages(cursor)
        create_attendance(cursor)
        fix_page_names(cursor)
        set_version(cursor)
        conn.commit()
        logging.info("Migration to v%s completed successfully.", DB_VERSION)
    except Exception as e:
        conn.rollback()
        logging.error("Migration failed, rolled back: %s", e)
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()

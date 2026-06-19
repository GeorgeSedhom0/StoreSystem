"""
Database migration: account selection for salary payments.

Salary payments create their cash_flow row via a trigger. To let the user choose
which account a salary is paid from, we:
1. add salaries.payment_method_id
2. recreate the salary cash_flow trigger so it copies that account onto the
   cash_flow row (which the accounts mirror then attributes correctly).

A NULL account keeps the previous behaviour (defaults to cash).

Idempotent and safe to run multiple times.
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

DB_VERSION = "20"


def add_salary_payment_method():
    logging.info("Adding salaries.payment_method_id...")
    cursor.execute(
        """
        ALTER TABLE salaries
        ADD COLUMN IF NOT EXISTS payment_method_id BIGINT REFERENCES payment_methods(id)
        """
    )


def recreate_salary_trigger():
    logging.info("Recreating salary cash_flow trigger with account support...")
    cursor.execute(
        """
        CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert_salary()
        RETURNS TRIGGER AS $$
        DECLARE
            employee_name VARCHAR;
            emp_store_id BIGINT;
        BEGIN
            SELECT name INTO employee_name FROM employee WHERE id = NEW.employee_id;
            SELECT store_id INTO emp_store_id FROM employee WHERE id = NEW.employee_id;

            INSERT INTO cash_flow (
                store_id,
                time,
                amount,
                type,
                description,
                party_id,
                payment_method_id
            ) VALUES (
                emp_store_id,
                NEW.time,
                -NEW.amount - NEW.bonus + NEW.deductions,
                'out',
                'راتب ' || employee_name || ' بمبلغ ' || NEW.amount || ' ومكافأة ' || NEW.bonus || ' وخصم ' || NEW.deductions,
                NULL,
                NEW.payment_method_id
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
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
    logging.info("Starting migration update_db_20 (salary accounts)...")
    try:
        add_salary_payment_method()
        recreate_salary_trigger()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_20 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

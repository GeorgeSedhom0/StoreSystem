"""
Database migration: performance indexes.

Adds the indexes that matter most as data grows (e.g. 500 bills/day for years).
The biggest wins are on the running-total triggers, which previously scanned a
whole table on every insert:

- cash_flow(store_id, time, id): the cash_flow running-total triggers
  (update_total_after_insert / bubble_fix_*) look up the previous row by
  store + time on every insert. Without this it is O(n) per insert.
- products_flow(store_id, product_id, time, id): same story for the
  products_flow running-total trigger.
- account_transactions(store_id, payment_method_id, time, id): lets the account
  ledger's running-balance window read in index order (no sort / no disk spill).
- bills(store_id, time) / bills(party_id): analytics, shift totals, bills lists,
  party statements.
- products_flow(store_id, bill_id) / cash_flow(store_id, bill_id): the many
  joins from bills to their lines / cash entries.
- cash_flow(party_id), installments_flow(installment_id), salaries(employee_id):
  smaller but cheap lookups/joins.

All indexes use IF NOT EXISTS so this is idempotent. A plain CREATE INDEX briefly
blocks writes to each table while it builds (fine for a maintenance run); it does
not block reads.
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

DB_VERSION = "21"

# (index name, table, columns / definition) — kept in sync with init.py
INDEXES = [
    ("idx_cash_flow_store_time", "cash_flow (store_id, time, id)"),
    ("idx_cash_flow_store_bill", "cash_flow (store_id, bill_id)"),
    ("idx_cash_flow_party", "cash_flow (party_id)"),
    ("idx_bills_store_time", "bills (store_id, time)"),
    ("idx_bills_party", "bills (party_id)"),
    ("idx_products_flow_store_bill", "products_flow (store_id, bill_id)"),
    (
        "idx_products_flow_store_product_time",
        "products_flow (store_id, product_id, time, id)",
    ),
    (
        "idx_account_transactions_ledger",
        "account_transactions (store_id, payment_method_id, time, id)",
    ),
    ("idx_installments_flow_installment", "installments_flow (installment_id)"),
    ("idx_salaries_employee", "salaries (employee_id)"),
]


def create_indexes():
    for name, definition in INDEXES:
        logging.info("Ensuring index %s ...", name)
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS {name} ON {definition}"
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
    logging.info("Starting migration update_db_21 (performance indexes)...")
    try:
        create_indexes()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_21 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

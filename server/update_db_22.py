"""
Database migration: reconcile drifted bill payment splits.

Before the bill-edit fix, editing a bill's total (e.g. deleting it by removing
all its products) did not rescale bills.payments, so the JSON snapshot could
drift away from the bill's actual total. Anything that sums bills.payments
(shift dialog, analytics breakdowns, printed bill) then reported stale numbers.

This one-off data fix rescales every bill's payments to match its current total
(preserving each method's ratio), and clears the split for zero-total bills.
Only bills whose payments sum already disagrees with the total are touched, so
it is idempotent and cheap to re-run.

No schema change — init.py needs no structural mirror (fresh DBs never drift);
the version counter is still bumped for consistency.
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

DB_VERSION = "22"


def reconcile_bill_payments():
    logging.info("Reconciling bill payment splits with their totals...")
    cursor.execute(
        """
        UPDATE bills
        SET payments = CASE
            WHEN ABS(COALESCE(total, 0)) = 0 THEN NULL
            ELSE (
                SELECT jsonb_agg(
                    jsonb_set(
                        elem,
                        '{amount}',
                        to_jsonb(ROUND(
                            (
                                (
                                    (elem->>'amount')::numeric
                                    / NULLIF((
                                        SELECT SUM((e2->>'amount')::numeric)
                                        FROM jsonb_array_elements(bills.payments) e2
                                    ), 0)
                                ) * ABS(bills.total)
                            )::numeric, 2))
                    )
                )
                FROM jsonb_array_elements(bills.payments) elem
            )
        END
        WHERE payments IS NOT NULL
          AND id <> -1
          AND ABS(
                COALESCE((
                    SELECT SUM((e->>'amount')::numeric)
                    FROM jsonb_array_elements(payments) e
                ), 0)
                - ABS(COALESCE(total, 0))
              ) > 0.01
        """
    )
    logging.info("Reconciled %s drifted bills", cursor.rowcount or 0)


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
    logging.info("Starting migration update_db_22 (reconcile bill payments)...")
    try:
        reconcile_bill_payments()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_22 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

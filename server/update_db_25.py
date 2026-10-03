"""
Database migration: consistent cash_flow running totals.

cash_flow.total (the per-store running balance shown on the Cash page) had
drifted from the real running sum. Two causes:

1. A back-dated insert (a bill or transfer recorded with an earlier time than
   rows that already exist) computed its own total but never shifted the rows
   after it.
2. Two inserts in the same store at the same moment both read the same
   "previous" row, so the second total missed the first amount.

Also, installs built from migrations had no after-delete fix.

This migration:
- serializes running-total maintenance per store (a transaction-scoped
  advisory lock, the same key the bill-corrections engine uses),
- makes inserts and deletes shift the rows after them, and makes the update
  fix set-based (it used to loop row by row),
- adds the after-delete trigger where missing,
- recomputes every store's running totals once (only rows that are off).

Rows without a time are not part of any running balance and are left as is.

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

DB_VERSION = "25"


def replace_trigger_functions():
    logging.info("Replacing cash_flow running-total trigger functions...")
    cursor.execute(
        """
        CREATE OR REPLACE FUNCTION update_total_after_insert()
        RETURNS TRIGGER AS $$
        DECLARE
            latest_total NUMERIC;
        BEGIN
            -- One running-total writer per store at a time; concurrent sales
            -- used to read the same previous row.
            PERFORM pg_advisory_xact_lock(781234, NEW.store_id::int);

            SELECT total INTO latest_total
            FROM cash_flow
            WHERE store_id = NEW.store_id
            AND (time < NEW.time OR (time = NEW.time AND id < NEW.id))
            ORDER BY time DESC, id DESC
            LIMIT 1
            FOR UPDATE;

            UPDATE cash_flow
            SET total = COALESCE(NEW.amount, 0) + COALESCE(latest_total, 0)
            WHERE id = NEW.id
            AND store_id = NEW.store_id;

            -- A back-dated row: every later row includes its amount too.
            IF COALESCE(NEW.amount, 0) <> 0 THEN
                UPDATE cash_flow
                SET total = total + NEW.amount
                WHERE store_id = NEW.store_id
                AND (time > NEW.time OR (time = NEW.time AND id > NEW.id));
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    cursor.execute(
        """
        CREATE OR REPLACE FUNCTION bubble_fix_total_after_update()
        RETURNS TRIGGER AS $$
        DECLARE
            previous_total NUMERIC;
        BEGIN
            IF NEW.amount IS NOT DISTINCT FROM OLD.amount THEN
                RETURN NEW;
            END IF;

            PERFORM pg_advisory_xact_lock(781234, NEW.store_id::int);

            SELECT total INTO previous_total
            FROM cash_flow
            WHERE store_id = NEW.store_id
            AND (time < NEW.time OR (time = NEW.time AND id < NEW.id))
            ORDER BY time DESC, id DESC
            LIMIT 1;

            -- Re-total this row and everything after it in one statement.
            UPDATE cash_flow c
            SET total = s.rt
            FROM (
                SELECT id,
                       COALESCE(previous_total, 0)
                       + SUM(COALESCE(amount, 0)) OVER (ORDER BY time, id) AS rt
                FROM cash_flow
                WHERE store_id = NEW.store_id
                AND (time > NEW.time OR (time = NEW.time AND id >= NEW.id))
            ) s
            WHERE c.store_id = NEW.store_id
            AND c.id = s.id
            AND c.total IS DISTINCT FROM s.rt;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    cursor.execute(
        """
        CREATE OR REPLACE FUNCTION bubble_fix_total_after_delete()
        RETURNS TRIGGER AS $$
        BEGIN
            PERFORM pg_advisory_xact_lock(781234, OLD.store_id::int);

            IF COALESCE(OLD.amount, 0) <> 0 THEN
                UPDATE cash_flow
                SET total = total - OLD.amount
                WHERE store_id = OLD.store_id
                AND (time > OLD.time OR (time = OLD.time AND id > OLD.id));
            END IF;

            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def ensure_delete_trigger():
    logging.info("Ensuring the cash_flow after-delete trigger exists...")
    cursor.execute("DROP TRIGGER IF EXISTS trigger_bubble_fix_total_after_delete ON cash_flow")
    cursor.execute(
        """
        CREATE TRIGGER trigger_bubble_fix_total_after_delete
        AFTER DELETE ON cash_flow
        FOR EACH ROW
        EXECUTE FUNCTION bubble_fix_total_after_delete()
        """
    )


def recompute_totals():
    logging.info("Recomputing cash_flow running totals...")
    # No inserts while recomputing (they'd use the old triggers until commit).
    cursor.execute("LOCK TABLE cash_flow IN SHARE ROW EXCLUSIVE MODE")
    cursor.execute(
        """
        UPDATE cash_flow c
        SET total = s.rt
        FROM (
            SELECT store_id, id,
                   SUM(COALESCE(amount, 0)) OVER (PARTITION BY store_id ORDER BY time, id) AS rt
            FROM cash_flow
            WHERE time IS NOT NULL
        ) s
        WHERE c.store_id = s.store_id
        AND c.id = s.id
        AND (c.total IS NULL OR ABS(c.total - s.rt) > 0.001)
        """
    )
    logging.info("Fixed %s rows.", cursor.rowcount)


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
    logging.info("Starting migration update_db_25 (cash_flow running totals)...")
    try:
        replace_trigger_functions()
        ensure_delete_trigger()
        recompute_totals()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_25 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

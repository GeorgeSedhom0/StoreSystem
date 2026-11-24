"""
Database migration v28: data purge (حذف السجلات القديمة).

- data_purges            log of every purge / preview-less run
- purge flag in three trigger functions: when a purge sets
  `SET LOCAL openstore.purge = 'on'` they return immediately (the purge
  writes totals and opening rows itself). With the flag off they behave
  exactly as before.
    update_stock_after_insert, update_total_after_insert,
    bubble_fix_total_after_delete
- page /data-purge, granted to the admin scope.

Spec: docs/specs/v28-data-purge.md. Idempotent and safe to re-run.
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

DB_VERSION = "28"


def create_tables(cursor):
    logging.info("Creating data_purges...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS data_purges (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMP,
            source VARCHAR NOT NULL,
            slot TIMESTAMP,
            cutoff TIMESTAMP NOT NULL,
            with_backup BOOLEAN NOT NULL,
            backup_file VARCHAR,
            user_id BIGINT,
            username VARCHAR,
            status VARCHAR NOT NULL,
            counts JSONB,
            error TEXT
        )
        """
    )


def update_triggers(cursor):
    logging.info("Adding the purge flag to the stock / cash total triggers...")
    # Same bodies as init.py (and update_db_25.py / update_db_7.py), plus the
    # flag check at the top. CREATE OR REPLACE keeps the triggers attached.
    cursor.execute(
        """
    CREATE OR REPLACE FUNCTION update_stock_after_insert()
    RETURNS TRIGGER AS $$
    BEGIN
        IF current_setting('openstore.purge', true) = 'on' THEN
            RETURN NEW;
        END IF;
        INSERT INTO product_inventory (store_id, product_id, stock)
        VALUES (NEW.store_id, NEW.product_id, NEW.amount)
        ON CONFLICT (store_id, product_id)
        DO UPDATE SET stock = product_inventory.stock + NEW.amount;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
        """
    )
    cursor.execute(
        """
    CREATE OR REPLACE FUNCTION update_total_after_insert()
    RETURNS TRIGGER AS $$
    DECLARE
        latest_total NUMERIC;
    BEGIN
        IF current_setting('openstore.purge', true) = 'on' THEN
            RETURN NEW;
        END IF;

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
    CREATE OR REPLACE FUNCTION bubble_fix_total_after_delete()
    RETURNS TRIGGER AS $$
    BEGIN
        IF current_setting('openstore.purge', true) = 'on' THEN
            RETURN OLD;
        END IF;

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


def register_page(cursor):
    logging.info("Registering page /data-purge (admin only)...")
    cursor.execute(
        """
        INSERT INTO pages (name, path)
        SELECT 'حذف السجلات', '/data-purge'
        WHERE NOT EXISTS (SELECT 1 FROM pages WHERE path = '/data-purge')
        """
    )
    cursor.execute(
        """
        UPDATE scopes s
        SET pages = s.pages || (SELECT id FROM pages WHERE path = '/data-purge')
        WHERE s.name = 'admin'
          AND NOT ((SELECT id FROM pages WHERE path = '/data-purge') = ANY(COALESCE(s.pages, '{}')))
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
        create_tables(cursor)
        update_triggers(cursor)
        register_page(cursor)
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

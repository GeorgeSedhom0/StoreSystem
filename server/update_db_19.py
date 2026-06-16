"""
Database migration for the per-payment-method "accounts" system.

Each payment method is an account (wallet) with a balance. Every cash_flow
movement is mirrored into account_transactions, attributed to one or more
accounts so that SUM(account balances) always equals the store's real cash
total (the cash_flow running total). Attribution rules:

1. If the cash_flow row belongs to a bill that has a `payments` split
   (sell / return / buy / buy-return), distribute the amount across the
   methods proportionally to that split.
2. Otherwise, attribute the full amount to cash_flow.payment_method_id when set
   (manual entries, owner deposits/payouts, buy overrides).
3. Otherwise, default to the cash (default) account.

Transfers between accounts are the only ledger rows with no cash_flow link
(net-zero, so the total still reconciles).

This migration also:
- adds cash_flow.payment_method_id
- creates a dedicated "owner" party for deposits/payouts
- registers the /accounts page and grants it to the admin scope
- backfills account_transactions for all existing cash_flow rows

It is idempotent and safe to run multiple times.
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

DB_VERSION = "19"


def add_cash_flow_payment_method():
    logging.info("Adding cash_flow.payment_method_id...")
    cursor.execute(
        """
        ALTER TABLE cash_flow
        ADD COLUMN IF NOT EXISTS payment_method_id BIGINT REFERENCES payment_methods(id)
        """
    )


def create_account_transactions_table():
    logging.info("Creating account_transactions table...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS account_transactions (
            id BIGSERIAL PRIMARY KEY,
            store_id BIGINT NOT NULL,
            payment_method_id BIGINT NOT NULL REFERENCES payment_methods(id),
            cash_flow_id BIGINT,
            amount FLOAT NOT NULL,
            source VARCHAR,
            time TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (store_id, cash_flow_id)
                REFERENCES cash_flow(store_id, id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_account_transactions_method
        ON account_transactions (store_id, payment_method_id)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_account_transactions_cashflow
        ON account_transactions (store_id, cash_flow_id)
        """
    )


def create_mirror_trigger():
    logging.info("Creating cash_flow -> account_transactions mirror trigger...")
    cursor.execute(
        """
        CREATE OR REPLACE FUNCTION mirror_cash_flow_to_accounts()
        RETURNS TRIGGER AS $$
        DECLARE
            default_method_id BIGINT;
            bill_payments JSONB;
            payments_sum NUMERIC;
            elem JSONB;
            mid BIGINT;
            ratio NUMERIC;
        BEGIN
            -- On update we re-split: drop the old mirror rows for this cash_flow first
            IF TG_OP = 'UPDATE' THEN
                DELETE FROM account_transactions
                WHERE cash_flow_id = NEW.id AND store_id = NEW.store_id;
            END IF;

            IF COALESCE(NEW.amount, 0) = 0 THEN
                RETURN NEW;
            END IF;

            SELECT id INTO default_method_id FROM payment_methods
            WHERE is_deleted = FALSE
            ORDER BY is_default DESC, id ASC
            LIMIT 1;

            bill_payments := NULL;
            IF NEW.bill_id IS NOT NULL THEN
                SELECT payments INTO bill_payments FROM bills
                WHERE id = NEW.bill_id AND store_id = NEW.store_id;
            END IF;

            IF bill_payments IS NOT NULL
               AND jsonb_typeof(bill_payments) = 'array'
               AND jsonb_array_length(bill_payments) > 0 THEN
                SELECT COALESCE(SUM((e->>'amount')::numeric), 0) INTO payments_sum
                FROM jsonb_array_elements(bill_payments) e;

                IF payments_sum > 0 THEN
                    FOR elem IN SELECT * FROM jsonb_array_elements(bill_payments) LOOP
                        mid := NULLIF(elem->>'method_id', '')::bigint;
                        IF mid IS NULL THEN
                            mid := default_method_id;
                        END IF;
                        ratio := (elem->>'amount')::numeric / payments_sum;
                        INSERT INTO account_transactions
                            (store_id, payment_method_id, cash_flow_id, amount, source, time)
                        VALUES
                            (NEW.store_id, mid, NEW.id, NEW.amount * ratio, 'bill', NEW.time);
                    END LOOP;
                    RETURN NEW;
                END IF;
            END IF;

            -- Fallback: single account (explicit override, else default cash)
            mid := COALESCE(NEW.payment_method_id, default_method_id);
            IF mid IS NOT NULL THEN
                INSERT INTO account_transactions
                    (store_id, payment_method_id, cash_flow_id, amount, source, time)
                VALUES
                    (NEW.store_id, mid, NEW.id, NEW.amount,
                     CASE WHEN NEW.bill_id IS NOT NULL THEN 'bill' ELSE 'manual' END,
                     NEW.time);
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    cursor.execute(
        "DROP TRIGGER IF EXISTS trigger_mirror_cash_flow_insert ON cash_flow"
    )
    cursor.execute(
        """
        CREATE TRIGGER trigger_mirror_cash_flow_insert
        AFTER INSERT ON cash_flow
        FOR EACH ROW
        EXECUTE FUNCTION mirror_cash_flow_to_accounts()
        """
    )

    cursor.execute(
        "DROP TRIGGER IF EXISTS trigger_mirror_cash_flow_update ON cash_flow"
    )
    cursor.execute(
        """
        CREATE TRIGGER trigger_mirror_cash_flow_update
        AFTER UPDATE ON cash_flow
        FOR EACH ROW
        WHEN (NEW.amount IS DISTINCT FROM OLD.amount)
        EXECUTE FUNCTION mirror_cash_flow_to_accounts()
        """
    )


def create_owner_party():
    logging.info("Ensuring owner party exists...")
    cursor.execute(
        """
        INSERT INTO assosiated_parties (name, phone, address, type, extra_info)
        SELECT 'صاحب المحل', '', '', 'owner', '{}'::jsonb
        WHERE NOT EXISTS (
            SELECT 1 FROM assosiated_parties WHERE type = 'owner'
        )
        """
    )


def register_accounts_page():
    logging.info("Registering /accounts page and granting it to admin...")
    cursor.execute(
        """
        INSERT INTO pages (name, path)
        SELECT 'الحسابات', '/accounts'
        WHERE NOT EXISTS (SELECT 1 FROM pages WHERE path = '/accounts')
        """
    )
    cursor.execute(
        """
        UPDATE scopes s
        SET pages = s.pages || (SELECT id FROM pages WHERE path = '/accounts')
        WHERE s.name = 'admin'
          AND NOT (
            (SELECT id FROM pages WHERE path = '/accounts') = ANY(s.pages)
          )
        """
    )


def backfill_account_transactions():
    logging.info("Backfilling account_transactions from existing cash_flow...")
    cursor.execute(
        """
        WITH default_method AS (
            SELECT id FROM payment_methods
            WHERE is_deleted = FALSE
            ORDER BY is_default DESC, id ASC
            LIMIT 1
        )
        INSERT INTO account_transactions
            (store_id, payment_method_id, cash_flow_id, amount, source, time)
        SELECT
            cf.store_id,
            COALESCE(split.method_id, cf.payment_method_id, dm.id) AS method_id,
            cf.id,
            COALESCE(split.amt, cf.amount) AS amount,
            CASE WHEN cf.bill_id IS NOT NULL THEN 'bill' ELSE 'manual' END,
            cf.time
        FROM cash_flow cf
        CROSS JOIN default_method dm
        LEFT JOIN LATERAL (
            SELECT
                NULLIF(e->>'method_id', '')::bigint AS method_id,
                cf.amount * (
                    (e->>'amount')::numeric
                    / NULLIF((
                        SELECT SUM((e2->>'amount')::numeric)
                        FROM jsonb_array_elements(b.payments) e2
                    ), 0)
                ) AS amt
            FROM bills b
            CROSS JOIN LATERAL jsonb_array_elements(b.payments) e
            WHERE b.id = cf.bill_id
              AND b.store_id = cf.store_id
              AND b.payments IS NOT NULL
              AND jsonb_typeof(b.payments) = 'array'
              AND jsonb_array_length(b.payments) > 0
        ) split ON TRUE
        WHERE cf.amount IS NOT NULL
          AND cf.amount <> 0
          AND NOT EXISTS (
            SELECT 1 FROM account_transactions at
            WHERE at.cash_flow_id = cf.id AND at.store_id = cf.store_id
          )
        """
    )
    logging.info("Backfilled %s account rows", cursor.rowcount or 0)


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
    logging.info("Starting migration update_db_19 (accounts)...")
    try:
        add_cash_flow_payment_method()
        create_account_transactions_table()
        create_mirror_trigger()
        create_owner_party()
        register_accounts_page()
        backfill_account_transactions()
        set_db_version()
        conn.commit()
        logging.info("Migration update_db_19 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

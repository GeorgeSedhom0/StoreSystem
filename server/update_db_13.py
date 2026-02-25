"""
Database migration script for installment cash_flow trigger hardening.
This migration updates:
1. delete_cash_flow_after_delete_installment_flow() with normalized cast matching
2. delete_cash_flow_after_delete_installment() with normalized cast matching
3. Recreates both related triggers to ensure they use the latest function bodies
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


def update_installment_flow_delete_trigger():
    """Update trigger function that syncs cash_flow when installment_flow rows are deleted."""
    logging.info("Updating delete_cash_flow_after_delete_installment_flow function...")

    cursor.execute(
        """
        CREATE OR REPLACE FUNCTION delete_cash_flow_after_delete_installment_flow()
        RETURNS TRIGGER AS $$
        BEGIN
            DELETE FROM cash_flow
            WHERE id = (
                SELECT cf.id
                FROM cash_flow cf
                WHERE cf.store_id = (
                    SELECT store_id FROM installments WHERE id = OLD.installment_id
                )
                AND cf.bill_id = (
                    SELECT bill_id FROM installments WHERE id = OLD.installment_id
                )
                AND cf.type = 'in'
                AND cf.description = 'قسط'
                AND cf.party_id IS NOT DISTINCT FROM (
                    SELECT b.party_id
                    FROM bills b
                    WHERE b.id = (SELECT bill_id FROM installments WHERE id = OLD.installment_id)
                    AND b.store_id = (SELECT store_id FROM installments WHERE id = OLD.installment_id)
                    LIMIT 1
                )
                AND cf.time = OLD.time
                AND ROUND(COALESCE(cf.amount, 0)::numeric, 2) = ROUND(COALESCE(OLD.amount, 0)::numeric, 2)
                ORDER BY cf.id DESC
                LIMIT 1
            );

            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    cursor.execute(
        """
        DROP TRIGGER IF EXISTS trigger_delete_cash_flow_after_delete_installment_flow
        ON installments_flow;

        CREATE TRIGGER trigger_delete_cash_flow_after_delete_installment_flow
        AFTER DELETE ON installments_flow
        FOR EACH ROW
        EXECUTE FUNCTION delete_cash_flow_after_delete_installment_flow();
        """
    )

    logging.info("installment_flow delete trigger updated successfully")


def update_installment_delete_trigger():
    """Update trigger function that syncs cash_flow when installment rows are deleted."""
    logging.info("Updating delete_cash_flow_after_delete_installment function...")

    cursor.execute(
        """
        CREATE OR REPLACE FUNCTION delete_cash_flow_after_delete_installment()
        RETURNS TRIGGER AS $$
        BEGIN
            DELETE FROM cash_flow
            WHERE id = (
                SELECT cf.id
                FROM cash_flow cf
                WHERE cf.store_id = OLD.store_id
                AND cf.bill_id = OLD.bill_id
                AND cf.type = 'in'
                AND cf.description = 'مقدم'
                AND cf.party_id IS NOT DISTINCT FROM (
                    SELECT b.party_id
                    FROM bills b
                    WHERE b.id = OLD.bill_id
                    AND b.store_id = OLD.store_id
                    LIMIT 1
                )
                AND ROUND(COALESCE(cf.amount, 0)::numeric, 2) = ROUND(COALESCE(OLD.paid, 0)::numeric, 2)
                ORDER BY cf.id DESC
                LIMIT 1
            );

            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    cursor.execute(
        """
        DROP TRIGGER IF EXISTS trigger_delete_cash_flow_after_delete_installment
        ON installments;

        CREATE TRIGGER trigger_delete_cash_flow_after_delete_installment
        AFTER DELETE ON installments
        FOR EACH ROW
        EXECUTE FUNCTION delete_cash_flow_after_delete_installment();
        """
    )

    logging.info("installment delete trigger updated successfully")


def run_migration():
    """Run all migration steps"""
    logging.info("Starting migration update_db_13...")

    try:
        update_installment_flow_delete_trigger()
        update_installment_delete_trigger()
        conn.commit()
        logging.info("Migration update_db_13 completed successfully!")
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

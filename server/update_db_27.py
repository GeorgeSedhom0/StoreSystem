"""
Database migration v27: restock requests (طلبات البضاعة).

A store asks another store (usually the storage) for goods; the supplier fills
it through the normal Move Products transfer, which links back here.

- restock_requests        one request (requester -> supplier), open/closed
- restock_request_lines   product + requested base units (+ package snapshot)
- restock_fulfillments    what each linked transfer sent, per line
- page /restock-requests, granted to admin and to every scope that already
  has /admin/move-products.

Spec: docs/specs/v27-restock-requests.md. Idempotent and safe to re-run.
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

DB_VERSION = "27"


def create_tables(cursor):
    logging.info("Creating restock request tables...")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS restock_requests (
            id BIGSERIAL PRIMARY KEY,
            from_store_id BIGINT NOT NULL REFERENCES store_data(id),
            to_store_id BIGINT NOT NULL REFERENCES store_data(id),
            status VARCHAR NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'closed')),
            note TEXT,
            created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            seen_at TIMESTAMP,
            closed_at TIMESTAMP,
            closed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
            closed_side VARCHAR
                CHECK (closed_side IN ('requester', 'supplier', 'auto')),
            close_note TEXT,
            followed_up_at TIMESTAMP,
            followup_request_id BIGINT
                REFERENCES restock_requests(id) ON DELETE SET NULL,
            CHECK (from_store_id <> to_store_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_restock_requests_to
        ON restock_requests (to_store_id, status)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_restock_requests_from
        ON restock_requests (from_store_id, status)
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS restock_request_lines (
            id BIGSERIAL PRIMARY KEY,
            request_id BIGINT NOT NULL
                REFERENCES restock_requests(id) ON DELETE CASCADE,
            product_id BIGINT NOT NULL REFERENCES products(id),
            quantity INT NOT NULL CHECK (quantity > 0),
            package_id BIGINT REFERENCES product_packages(id) ON DELETE SET NULL,
            package_units INT,
            package_name VARCHAR,
            UNIQUE (request_id, product_id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS restock_fulfillments (
            id BIGSERIAL PRIMARY KEY,
            request_id BIGINT NOT NULL
                REFERENCES restock_requests(id) ON DELETE CASCADE,
            line_id BIGINT NOT NULL
                REFERENCES restock_request_lines(id) ON DELETE CASCADE,
            bill_id BIGINT,
            store_id BIGINT,
            quantity INT NOT NULL CHECK (quantity > 0),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_restock_fulfillments_line
        ON restock_fulfillments (line_id)
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_restock_fulfillments_request
        ON restock_fulfillments (request_id)
        """
    )


def register_page(cursor):
    logging.info("Registering /restock-requests and granting it...")
    cursor.execute(
        """
        INSERT INTO pages (name, path)
        SELECT 'طلبات البضاعة', '/restock-requests'
        WHERE NOT EXISTS (SELECT 1 FROM pages WHERE path = '/restock-requests')
        """
    )
    # Admin, plus every scope that can already move stock between stores.
    cursor.execute(
        """
        UPDATE scopes s
        SET pages = s.pages || (SELECT id FROM pages WHERE path = '/restock-requests')
        WHERE NOT ((SELECT id FROM pages WHERE path = '/restock-requests') = ANY(s.pages))
          AND (
            s.name = 'admin'
            OR (SELECT id FROM pages WHERE path = '/admin/move-products') = ANY(s.pages)
          )
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

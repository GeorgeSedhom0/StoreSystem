"""
Database migration script for adding notifications and product batches tables.
This migration adds:
1. notifications table - for in-app notifications (expiration alerts, etc.)
2. product_batches table - for tracking product inventory by expiration date
"""

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from os import getenv
import logging

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# Create the connection
conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
cursor = conn.cursor(cursor_factory=RealDictCursor)


def create_notifications_table():
    """Create the notifications table for in-app notifications"""
    logging.info("Creating notifications table...")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id BIGSERIAL PRIMARY KEY,
            store_id BIGINT NOT NULL REFERENCES store_data(id),
            title VARCHAR(255) NOT NULL,
            content TEXT,
            type VARCHAR(50) NOT NULL DEFAULT 'general',
            reference_id BIGINT,
            is_read BOOLEAN DEFAULT FALSE,
            read_at TIMESTAMP,
            deleted_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # Create index for faster lookups
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_store_id 
        ON notifications(store_id)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_type_reference 
        ON notifications(store_id, type, reference_id)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_notifications_deleted_at 
        ON notifications(deleted_at) WHERE deleted_at IS NULL
    """)

    conn.commit()
    logging.info("Notifications table created successfully")


def create_product_batches_table():
    """Create the product_batches table for tracking inventory by expiration date"""
    logging.info("Creating product_batches table...")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS product_batches (
            id BIGSERIAL PRIMARY KEY,
            store_id BIGINT NOT NULL REFERENCES store_data(id),
            product_id BIGINT NOT NULL REFERENCES products(id),
            quantity INT NOT NULL DEFAULT 0,
            expiration_date DATE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(store_id, product_id, expiration_date)
        )
    """)

    # Create indexes for faster lookups
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_product_batches_store_product 
        ON product_batches(store_id, product_id)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_product_batches_expiration 
        ON product_batches(expiration_date)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_product_batches_store_expiration 
        ON product_batches(store_id, expiration_date)
    """)

    conn.commit()
    logging.info("Product batches table created successfully")


def create_notification_triggers():
    """Create triggers for notifications table"""
    logging.info("Creating notification triggers...")

    # Trigger to update updated_at timestamp
    cursor.execute("""
        CREATE OR REPLACE FUNCTION update_notification_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    cursor.execute("""
        DROP TRIGGER IF EXISTS trigger_update_notification_timestamp ON notifications;
        CREATE TRIGGER trigger_update_notification_timestamp
        BEFORE UPDATE ON notifications
        FOR EACH ROW
        EXECUTE FUNCTION update_notification_timestamp();
    """)

    conn.commit()
    logging.info("Notification triggers created successfully")


def add_notifications_page():
    """Add notifications page to pages table and admin scope"""
    logging.info("Adding notifications page to pages table...")

    # Check if notifications page already exists
    cursor.execute("SELECT id FROM pages WHERE path = '/notifications'")
    existing = cursor.fetchone()

    if existing:
        logging.info("Notifications page already exists, skipping...")
        page_id = existing["id"]
    else:
        # Insert notifications page
        cursor.execute("""
            INSERT INTO pages (name, path)
            VALUES ('الإشعارات', '/notifications')
            RETURNING id
        """)
        result = cursor.fetchone()
        page_id = result["id"]
        conn.commit()
        logging.info(f"Notifications page added with id {page_id}")

    # Add to admin scope
    cursor.execute(
        "SELECT id, pages FROM scopes WHERE name = 'admin' OR id = 1 LIMIT 1"
    )
    admin_scope = cursor.fetchone()

    if admin_scope:
        current_pages = admin_scope["pages"] or []
        if page_id not in current_pages:
            current_pages.append(page_id)
            cursor.execute(
                "UPDATE scopes SET pages = %s WHERE id = %s",
                (current_pages, admin_scope["id"]),
            )
            conn.commit()
            logging.info(f"Added notifications page to admin scope")
        else:
            logging.info("Notifications page already in admin scope")

    return page_id


def run_migration():
    """Run all migration steps"""
    logging.info("Starting migration update_db_10...")

    try:
        create_notifications_table()
        create_product_batches_table()
        create_notification_triggers()
        add_notifications_page()

        logging.info("Migration update_db_10 completed successfully!")

    except Exception as e:
        logging.error(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    run_migration()

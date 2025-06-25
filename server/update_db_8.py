import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection parameters
db_params = {
    "host": os.getenv("HOST"),
    "database": os.getenv("DATABASE"),
    "user": os.getenv("USER"),
    "password": os.getenv("PASS"),
}


def update_db_8():
    conn = None
    try:
        # Connect to the database
        conn = psycopg2.connect(**db_params)
        cursor = conn.cursor()

        print("Applying DB update 8...")

        # Create product_requests table
        print("Creating product_requests table...")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS product_requests (
                id SERIAL PRIMARY KEY,
                requesting_store_id INTEGER NOT NULL REFERENCES store_data(id),
                requested_store_id INTEGER NOT NULL REFERENCES store_data(id),
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # Create product_request_items table
        print("Creating product_request_items table...")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS product_request_items (
                id SERIAL PRIMARY KEY,
                product_request_id INTEGER NOT NULL REFERENCES product_requests(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id),
                requested_quantity INTEGER NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                notes TEXT
            );
            """
        )

        # Add the new page to the pages table
        print("Adding 'Request Products' page...")
        cursor.execute(
            "INSERT INTO pages (name, path) VALUES (%s, %s);",
            ("طلبات المنتجات", "/request-products"),
        )

        # Make the page have the, before last id, and keep the "/admin" path as the last id
        # This is a workaround to ensure the page appears before the admin page in the UI
        cursor.execute(
            """
            UPDATE pages 
            SET id = (SELECT MAX(id) FROM pages) + 1 
            WHERE path = '/admin';
            """
        )
        cursor.execute(
            """
            UPDATE pages 
            SET id = (SELECT MAX(id) FROM pages) - 1 
            WHERE path = '/request-products';
            """
        )

        # Add the new page to the admin scope
        print("Updating admin scope...")
        cursor.execute(
            """
            UPDATE scopes 
            SET pages = array_append(pages, (SELECT id FROM pages WHERE path = '/admin'))
            WHERE name = 'admin';
            """
        )

        # Commit the changes
        conn.commit()
        print("DB update 8 applied successfully.")

    except Exception as e:
        print(f"Error applying DB update 8: {e}")
        if conn:
            conn.rollback()

    finally:
        # Close the connection
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    update_db_8()

import psycopg2
from dotenv import load_dotenv
from os import getenv
import json
from psycopg2.extras import DictCursor

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# Create the connection
conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)

# Use DictCursor to get results as dictionaries
cur = conn.cursor(cursor_factory=DictCursor)

print("Starting database update to multi-store structure...")

# Step 1: Check if product_inventory table already exists
cur.execute("""
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'product_inventory'
)
""")

if cur.fetchone()[0]:
    print("product_inventory table already exists. Skipping migration.")
else:
    print("Migrating products to multi-store structure...")

    # Step 2: Backup existing product data
    cur.execute("SELECT * FROM products")
    products_data = [dict(row) for row in cur.fetchall()]
    print(f"Backed up {len(products_data)} products.")

    # Step 3: Check if we need to backup products_flow data
    cur.execute("""
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'products_flow'
    )
    """)

    if cur.fetchone()[0]:
        cur.execute("SELECT * FROM products_flow")
        products_flow_data = [dict(row) for row in cur.fetchall()]
        print(f"Backed up {len(products_flow_data)} product flow records.")
    else:
        products_flow_data = []
        print("No products_flow table found.")

    # Step 4: Get existing product_id format
    cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'id'
    """)

    id_column_info = cur.fetchone()
    if id_column_info:
        print(f"Found product id column with type: {id_column_info['data_type']}")
    else:
        print("Warning: Couldn't determine product id column type.")

    # Step 5: Create transaction for schema changes
    try:
        # Create the product_inventory table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS product_inventory (
          id BIGSERIAL PRIMARY KEY,
          store_id BIGINT,
          product_id BIGINT,
          stock INT DEFAULT 0,
          is_deleted BOOLEAN DEFAULT FALSE,
          UNIQUE(store_id, product_id)
        )
        """)

        # Modify products table if necessary
        # Check if store_id exists in products table
        cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'store_id'
        """)

        has_store_id = cur.fetchone() is not None

        # Update products table schema
        if has_store_id:
            # If store_id exists, we need to modify the table
            temp_table_name = "products_new"

            # Create new products table without store_id and stock
            cur.execute(f"""
            CREATE TABLE {temp_table_name} (
              id BIGSERIAL PRIMARY KEY,
              name VARCHAR,
              bar_code VARCHAR UNIQUE,
              wholesale_price FLOAT,
              price FLOAT,
              category VARCHAR,
              is_deleted BOOLEAN DEFAULT FALSE
            )
            """)

            # Insert data from old table to new table
            cur.execute(f"""
            INSERT INTO {temp_table_name} (
              id, name, bar_code, wholesale_price, price, category, is_deleted
            )
            SELECT 
              id, name, bar_code, wholesale_price, price, category, 
              CASE WHEN is_deleted IS NULL THEN FALSE ELSE is_deleted END
            FROM products
            """)

            # Drop old table and rename new one
            cur.execute("DROP TABLE products CASCADE")
            cur.execute(f"ALTER TABLE {temp_table_name} RENAME TO products")

            # Create product_id reference in product_inventory
            cur.execute("""
            ALTER TABLE product_inventory 
            ADD CONSTRAINT product_inventory_product_id_fkey 
            FOREIGN KEY (product_id) REFERENCES products(id)
            """)

        else:
            # If store_id doesn't exist, check if we need to add is_deleted
            cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'is_deleted'
            """)

            if cur.fetchone() is None:
                # Add is_deleted column if it doesn't exist
                cur.execute("""
                ALTER TABLE products
                ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE
                """)

            # Make sure products has proper primary key
            cur.execute("""
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'products' AND constraint_type = 'PRIMARY KEY'
            """)

            pk_constraint = cur.fetchone()
            if pk_constraint:
                print(
                    f"Products table already has primary key: {pk_constraint['constraint_name']}"
                )
            else:
                # If there's no primary key, add it without trying to drop non-existent constraints
                print("Adding primary key constraint to products table")
                cur.execute("""
                ALTER TABLE products
                ADD CONSTRAINT products_pkey PRIMARY KEY (id)
                """)

        # Step 6: Migrate data to product_inventory
        print("Migrating product data to product_inventory...")
        for product in products_data:
            # Default store_id is 1 for existing data
            store_id = 1
            product_id = product["id"]
            stock = product.get("stock", 0)
            is_deleted = product.get("is_deleted", False)

            cur.execute(
                """
            INSERT INTO product_inventory (store_id, product_id, stock, is_deleted)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (store_id, product_id) DO NOTHING
            """,
                (store_id, product_id, stock, is_deleted),
            )

        # Step 7: Update triggers
        print("Updating triggers for multi-store support...")

        # Check and update the update_stock_after_insert trigger
        cur.execute("""
        SELECT EXISTS (
            SELECT FROM pg_trigger 
            WHERE tgname = 'trigger_update_stock_insert'
        )
        """)

        if cur.fetchone()[0]:
            # Update the existing trigger
            cur.execute("""
            DROP TRIGGER IF EXISTS trigger_update_stock_insert ON products_flow;
            
            CREATE OR REPLACE FUNCTION update_stock_after_insert()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO product_inventory (store_id, product_id, stock)
                VALUES (NEW.store_id, NEW.product_id, NEW.amount)
                ON CONFLICT (store_id, product_id)
                DO UPDATE SET stock = product_inventory.stock + NEW.amount;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            
            CREATE TRIGGER trigger_update_stock_insert
            AFTER INSERT ON products_flow
            FOR EACH ROW
            EXECUTE FUNCTION update_stock_after_insert();
            """)
            print("Updated trigger_update_stock_insert trigger.")

        # Update reserved_products table to include store_id if needed
        cur.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'reserved_products'
        )
        """)

        if cur.fetchone()[0]:
            # Check if store_id already exists
            cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'reserved_products' AND column_name = 'store_id'
            """)

            if cur.fetchone() is None:
                # Backup existing data
                cur.execute("SELECT * FROM reserved_products")
                reserved_products_data = [dict(row) for row in cur.fetchall()]

                # Alter table to add store_id
                cur.execute("""
                ALTER TABLE reserved_products
                ADD COLUMN store_id BIGINT DEFAULT 1
                """)

                # Add unique constraint
                cur.execute("""
                ALTER TABLE reserved_products
                DROP CONSTRAINT IF EXISTS reserved_products_store_product_unique,
                ADD CONSTRAINT reserved_products_store_product_unique UNIQUE (store_id, product_id)
                """)

                print("Updated reserved_products table for multi-store support.")

        # Commit all changes
        conn.commit()
        print("Migration to multi-store structure completed successfully.")

    except Exception as e:
        conn.rollback()
        print(f"Error during migration: {e}")
        raise

# Step 8: Update total cash_flow triggers to be store-specific
cur.execute("""
SELECT EXISTS (
    SELECT FROM pg_proc 
    WHERE proname = 'update_total_after_insert'
)
""")

if cur.fetchone()[0]:
    try:
        print("Updating cash_flow triggers for multi-store support...")

        # Update the update_total_after_insert function
        cur.execute("""
        CREATE OR REPLACE FUNCTION update_total_after_insert()
        RETURNS TRIGGER AS $$
        DECLARE
            latest_total FLOAT;
        BEGIN
            SELECT total INTO latest_total FROM cash_flow
            WHERE store_id = NEW.store_id  -- Added store_id condition
            AND (id != NEW.id OR store_id != NEW.store_id)
            ORDER BY time DESC LIMIT 1;

            IF latest_total IS NULL THEN
                latest_total := 0;
            END IF;

            UPDATE cash_flow
            SET total = NEW.amount + latest_total
            WHERE id = NEW.id
            AND store_id = NEW.store_id;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """)

        # Update the bubble_fix_total_after_update function
        cur.execute("""
        CREATE OR REPLACE FUNCTION bubble_fix_total_after_update()
        RETURNS TRIGGER AS $$
        DECLARE
            amount_diff FLOAT;
        BEGIN
            amount_diff := NEW.amount - OLD.amount;

            -- Bubble correct the total on all rows that were inserted after the updated row
            -- for the same store
            UPDATE cash_flow
            SET total = total + amount_diff
            WHERE store_id = OLD.store_id  -- Added store_id condition
            AND time > OLD.time;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """)

        conn.commit()
        print("Updated cash_flow triggers successfully.")

    except Exception as e:
        conn.rollback()
        print(f"Error updating cash_flow triggers: {e}")

# Final verification
print("\nVerifying database structure...")

# Check product_inventory
cur.execute("SELECT COUNT(*) FROM product_inventory")
inventory_count = cur.fetchone()[0]
print(f"product_inventory has {inventory_count} entries")

# Check updated triggers
cur.execute("""
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'update_stock_after_insert'
""")
trigger_function = cur.fetchone()
if trigger_function:
    if "product_inventory" in trigger_function["prosrc"]:
        print("Inventory triggers updated correctly")
    else:
        print("Warning: Inventory triggers may not be properly updated")

# Commit any pending changes and close the connection
conn.commit()
cur.close()
conn.close()
print("Database update completed.")

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

print("Starting trigger updates to remove ref_id dependencies...")

try:
    cursor.execute("""
    -- First, drop all triggers
    DO $$ 
    DECLARE
        trigger_rec RECORD;
    BEGIN
        FOR trigger_rec IN (
            SELECT event_object_table AS table_name, 
                trigger_name
            FROM information_schema.triggers
            WHERE trigger_schema = current_schema()
        ) LOOP
            EXECUTE 'DROP TRIGGER IF EXISTS ' || trigger_rec.trigger_name || ' ON ' || trigger_rec.table_name || ' CASCADE;';
        END LOOP;
    END $$;

    -- Then, drop all functions used by these triggers
    DROP FUNCTION IF EXISTS update_stock_after_insert() CASCADE;
    DROP FUNCTION IF EXISTS insert_cash_flow_after_insert() CASCADE;
    DROP FUNCTION IF EXISTS insert_cash_flow_after_insert_salary() CASCADE;
    DROP FUNCTION IF EXISTS insert_cash_flow_after_insert_installment() CASCADE;
    DROP FUNCTION IF EXISTS insert_cash_flow_after_insert_installment_flow() CASCADE;
    DROP FUNCTION IF EXISTS update_product_price_after_insert() CASCADE;
    DROP FUNCTION IF EXISTS update_total_after_insert() CASCADE;
    DROP FUNCTION IF EXISTS bubble_fix_total_after_update() CASCADE;
    DROP FUNCTION IF EXISTS update_cash_flow_after_update() CASCADE;
    """)

    cursor.execute("""
    UPDATE products_flow SET store_id = 1
    """)

    cursor.execute("""
    UPDATE bills SET store_id = 1
    """)

    cursor.execute("""
    UPDATE cash_flow SET store_id = 1
    """)

    cursor.execute("""
                   -- the -1 bill for deletions
    INSERT INTO "bills" ("id", "store_id", "ref_id", "time", "discount", "total", "type", "needs_update", "party_id")
    VALUES (-1, 1, NULL, NULL, NULL, NULL, NULL, '0', NULL);
    """)

    cursor.execute("""
    BEGIN;
    -- Add temporary column
    ALTER TABLE products_flow ADD COLUMN bill_id_new BIGINT;
    
    -- Extract number after underscore and convert to bigint
    UPDATE products_flow SET bill_id_new = CAST(SUBSTRING(bill_id FROM POSITION('_' IN bill_id) + 1) AS BIGINT);
    
    -- Drop old column and rename new one
    ALTER TABLE products_flow DROP COLUMN bill_id;
    ALTER TABLE products_flow RENAME COLUMN bill_id_new TO bill_id;
    
    -- Add foreign key constraint
    ALTER TABLE products_flow ADD CONSTRAINT fk_products_flow_bills 
        FOREIGN KEY (bill_id, store_id) REFERENCES bills(id, store_id);
    COMMIT;
    """)

    cursor.execute("""
    ALTER TABLE reserved_products 
    ADD CONSTRAINT fk_reserved_products_products
        FOREIGN KEY (product_id, store_id) REFERENCES products(id, store_id),
    ADD CONSTRAINT unique_product_store UNIQUE (product_id, store_id)
    """)

    cursor.execute("""
    ALTER TABLE bills DROP COLUMN ref_id
    """)

    # Update the trigger to update stock after inserting a product flow
    cursor.execute("""
    -- Trigger to update stock after insert in product_inventory
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

    # Create the trigger to insert into cash_flow after inserting a bill
    cursor.execute("""
    -- Trigger to insert into cash_flow after inserting a bill
    CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert()
    RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO cash_flow (
            store_id,
            time,
            amount,
            type,
            bill_id,
            description,
            party_id
        ) VALUES (
            NEW.store_id,
            NEW.time,
            NEW.total,
            CASE WHEN NEW.type = 'sell' THEN 'in'
                    WHEN NEW.type = 'BNPL' THEN 'in'
                    WHEN NEW.type = 'reserve' THEN 'in'
                    WHEN NEW.type = 'installment' THEN 'in'
                    WHEN NEW.type = 'buy' THEN 'out'
                    WHEN NEW.type = 'return' THEN 'out'
                    ELSE 'out' END,
            NEW.id,
            CASE WHEN NEW.type = 'sell' THEN 'فاتورة بيع'
                WHEN NEW.type = 'buy' THEN 'فاتورة شراء'
                WHEN NEW.type = 'return' THEN 'فاتورة مرتجع'
                WHEN NEW.type = 'reserve' THEN 'فاتورة حجز'
                WHEN NEW.type = 'installment' THEN 'فاتورة تقسيط'
                WHEN NEW.type = 'BNPL' THEN 'فاتورة اجل'
                ELSE 'فاتورة'
            END,
            NEW.party_id
        );
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_insert_cash_flow_after_insert
    AFTER INSERT ON bills
    FOR EACH ROW
    EXECUTE FUNCTION insert_cash_flow_after_insert();
    """)

    # Create the trigger to insert into cash_flow after inserting a salary
    cursor.execute("""
    -- Trigger to insert into cash_flow after inserting a salary
    CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert_salary()
    RETURNS TRIGGER AS $$
    DECLARE
        employee_name VARCHAR;
        emp_store_id BIGINT;
    BEGIN
        SELECT name INTO employee_name FROM employee WHERE id = NEW.employee_id;
        SELECT store_id INTO emp_store_id FROM employee WHERE id = NEW.employee_id;

        INSERT INTO cash_flow (
            store_id,
            time,
            amount,
            type,
            description,
            party_id
        ) VALUES (
            emp_store_id,
            NEW.time,
            NEW.amount + NEW.bonus - NEW.deductions,
            'out',
            'راتب ' || employee_name || ' بمبلغ ' || NEW.amount || ' ومكافأة ' || NEW.bonus || ' وخصم ' || NEW.deductions,
            NULL
        );
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_insert_cash_flow_after_insert_salary
    AFTER INSERT ON salaries
    FOR EACH ROW
    EXECUTE FUNCTION insert_cash_flow_after_insert_salary();
    """)

    # Create the trigger to insert into cash_flow after inserting a installment
    cursor.execute("""
    -- Trigger to insert into cash_flow after inserting a installment
    CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert_installment()
    RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO cash_flow (
            store_id,
            time,
            amount,
            type,
            bill_id,
            description,
            party_id
        ) VALUES (
            NEW.store_id,
            (SELECT time FROM bills
            WHERE bills.id = NEW.bill_id),
            NEW.paid,
            'in',
            NEW.bill_id, 
            'مقدم',
            (SELECT party_id FROM bills
            WHERE bills.id = NEW.bill_id)
        );
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_insert_cash_flow_after_insert_installment
    AFTER INSERT ON installments
    FOR EACH ROW
    EXECUTE FUNCTION insert_cash_flow_after_insert_installment();
    """)

    # Create the trigger to insert cash_flow after inserting a installment flow
    cursor.execute("""
    -- Trigger to insert into cash_flow after inserting a installment flow
    CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert_installment_flow()
    RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO cash_flow (
            store_id,
            time,
            amount,
            type,
            bill_id,
            description,
            party_id
        ) VALUES (
            (SELECT store_id FROM installments
            WHERE installments.id = NEW.installment_id),
            NEW.time,
            NEW.amount,
            'in',
            (SELECT bill_id FROM installments
            WHERE installments.id = NEW.installment_id),  -- Changed from concatenated value
            'قسط',
            (SELECT party_id FROM bills
            WHERE bills.id = (SELECT bill_id FROM installments
            WHERE installments.id = NEW.installment_id))
        );
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_insert_cash_flow_after_insert_installment_flow
    AFTER INSERT ON installments_flow
    FOR EACH ROW
    EXECUTE FUNCTION insert_cash_flow_after_insert_installment_flow();
    """)

    # Update the trigger to update product price when inserting a buy bill
    cursor.execute("""
    -- Trigger to update product price when inserting a buy bill
    CREATE OR REPLACE FUNCTION update_product_price_after_insert()
    RETURNS TRIGGER AS $$
    BEGIN
    IF (SELECT type FROM bills WHERE id = NEW.bill_id) = 'buy' THEN 
        UPDATE products
        SET
        wholesale_price = NEW.wholesale_price,
        price = NEW.price
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_product_price_after_insert
    AFTER INSERT ON products_flow
    FOR EACH ROW
    EXECUTE FUNCTION update_product_price_after_insert();
    """)

    # Create the trigger to update total after inserting a cash_flow
    cursor.execute("""
    -- Trigger to update total after insert
    CREATE OR REPLACE FUNCTION update_total_after_insert()
    RETURNS TRIGGER AS $$
    DECLARE
        latest_total FLOAT;
    BEGIN
        SELECT total INTO latest_total FROM cash_flow
        WHERE store_id = NEW.store_id
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

    CREATE TRIGGER trigger_update_total_after_insert
    AFTER INSERT ON cash_flow
    FOR EACH ROW
    EXECUTE FUNCTION update_total_after_insert();
    """)

    # Create the trigger to bubble fix the total after updating a cash_flow
    cursor.execute("""
    -- Trigger to bubble fix the total after update
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
        WHERE store_id = OLD.store_id
        AND time > OLD.time;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_bubble_fix_total_after_update
    AFTER UPDATE ON cash_flow
    FOR EACH ROW
    WHEN (NEW.amount != OLD.amount)
    EXECUTE FUNCTION bubble_fix_total_after_update();
    """)

    # Create the trigger to update cash_flow after updating a bill
    cursor.execute("""
    -- Trigger to update cash_flow after update
    CREATE OR REPLACE FUNCTION update_cash_flow_after_update()
    RETURNS TRIGGER AS $$
    BEGIN
        UPDATE cash_flow
        SET
            amount = NEW.total,
            total = total + NEW.total - OLD.total
        WHERE bill_id = NEW.id; 
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_cash_flow_after_update
    AFTER UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_flow_after_update();
    """)

    # Commit all changes
    conn.commit()
    print("Trigger updates completed successfully.")

except Exception as e:
    conn.rollback()
    print(f"Error updating triggers: {e}")
    raise

finally:
    cursor.close()
    conn.close()
    print("Database connection closed.")

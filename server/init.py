import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv
import bcrypt  # type: ignore


def connect_to_database():
    """Connect to the PostgreSQL database and return connection and cursor"""
    load_dotenv()

    # PostgreSQL connection details
    HOST = getenv("HOST")
    DATABASE = getenv("DATABASE")
    USER = getenv("USER")
    PASS = getenv("PASS")

    # Create the connection
    conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)

    # Get a cursor
    cur = conn.cursor()

    # Set timezone
    cur.execute("SET TIME ZONE 'Africa/Cairo'")

    return conn, cur


def drop_all_tables(cur):
    """Drop all existing tables in cascade mode"""
    print("Dropping all existing tables...")

    load_dotenv()
    DATABASE = getenv("DATABASE")

    # Drop all tables before creating
    cur.execute("DROP TABLE IF EXISTS users CASCADE")
    cur.execute("DROP TABLE IF EXISTS scopes CASCADE")
    cur.execute("DROP TABLE IF EXISTS store_data CASCADE")
    cur.execute("DROP TABLE IF EXISTS pages CASCADE")
    cur.execute("DROP TABLE IF EXISTS products CASCADE")
    cur.execute("DROP TABLE IF EXISTS product_inventory CASCADE")
    cur.execute("DROP TABLE IF EXISTS bills CASCADE")
    cur.execute("DROP TABLE IF EXISTS cash_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS products_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS shifts CASCADE")
    cur.execute("DROP TABLE IF EXISTS assosiated_parties CASCADE")
    cur.execute("DROP TABLE IF EXISTS reserved_products CASCADE")
    cur.execute("DROP TABLE IF EXISTS installments CASCADE")
    cur.execute("DROP TABLE IF EXISTS installments_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS employee CASCADE")
    cur.execute("DROP TABLE IF EXISTS salaries CASCADE")
    cur.execute("DROP TABLE IF EXISTS bills_collections CASCADE")
    cur.execute("DROP TABLE IF EXISTS notifications CASCADE")
    cur.execute("DROP TABLE IF EXISTS product_batches CASCADE")
    cur.execute("SET TIME ZONE 'Africa/Cairo'")
    cur.execute(f"ALTER DATABASE {DATABASE} SET timezone TO 'Africa/Cairo';")


def create_all_tables(cur):
    """Create all tables and insert initial data"""
    print("Creating tables and inserting initial data...")

    # Create the scopes table
    cur.execute("""
    CREATE TABLE scopes (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR UNIQUE,
        pages INT[]
    )
    """)
    cur.execute("""
    INSERT INTO scopes (name, pages)
    VALUES
    ('admin', ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    """)
    cur.execute("""
    INSERT INTO scopes (name, pages)
    VALUES
    ('cashier', ARRAY[1, 5, 14])
    """)

    # Create pages table
    cur.execute("""
    CREATE TABLE pages (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR,
        path VARCHAR
    )""")

    cur.execute("""
    INSERT INTO pages (name, path)
    VALUES
    ('بيع', '/sell'),
    ('بيع ادمن', '/admin/sell'),
    ('شراء', '/buy'),
    ('اضافة منتجات', '/add-to-storage'),
    ('(ادمن) نقل منتجات', '/admin/move-products'),
    ('الفواتير', '/bills'),
    ('فواتير العملاء و الموردين', '/parties-bills'),
    ('الفواتير (ادمن)', '/admin/bills'),
    ('المنتجات', '/products'),
    ('المنتجات (ادمن)', '/admin/products'),
    ('الحركات المالية', '/cash'),
    ('التقارير', '/analytics'),
    ('الاعدادات', '/settings'),
    ('ادارة الاقساط', '/installments'),
    ('الموظفين', '/employees'),
    ('الإشعارات', '/notifications'),
    ('admin', '/admin')
    """)

    # Create the users table
    cur.execute("""
    CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR UNIQUE,
        password VARCHAR,
        email VARCHAR,
        phone VARCHAR,
        language VARCHAR,
        scope_id BIGINT REFERENCES scopes(id)
    )
    """)
    # IF for god knows why reason you're using this and you're not me
    # comment out the following query
    password = "verystrongpassword"
    hashed_password = bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")
    cur.execute(
        """
    INSERT INTO users (username, password, email, phone, language, scope_id)
    VALUES
    ('george', %s, 'myamazingemail@me.wow.so.cool.email', '01000000000', 'ar', 1)
    """,
        (hashed_password,),
    )

    # Create the store_data table
    cur.execute("""
    CREATE TABLE store_data (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR,
        address VARCHAR,
        phone VARCHAR,
        extra_info JSONB
    )""")
    cur.execute("""
    INSERT INTO store_data (id, name, address, phone, extra_info)
    VALUES
    (0, 'المخزن', '', '', '{}')
    """)
    cur.execute("""
    INSERT INTO store_data (name, address, phone, extra_info)
    VALUES
    ('المحل', '', '', '{}')
    """)

    # Create the products table
    cur.execute("""
    CREATE TABLE products (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR,
      bar_code VARCHAR UNIQUE,
      wholesale_price FLOAT,
      price FLOAT,
      category VARCHAR
    )
    """)

    # Create the product_inventory table
    cur.execute("""
    CREATE TABLE product_inventory (
      id BIGSERIAL PRIMARY KEY,
      store_id BIGINT REFERENCES store_data(id),
      product_id BIGINT,
      stock INT DEFAULT 0,
      is_deleted BOOLEAN DEFAULT FALSE,
      UNIQUE(store_id, product_id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (store_id) REFERENCES store_data(id)
    )
    """)

    # Create reserverd products table
    cur.execute("""
    CREATE TABLE reserved_products (
        id BIGSERIAL PRIMARY KEY,
        store_id BIGINT REFERENCES store_data(id),
        product_id BIGINT,
        amount INT,
        UNIQUE(store_id, product_id),
        FOREIGN KEY (product_id, store_id) REFERENCES product_inventory(product_id, store_id)
    )
    """)

    # Create the assosiated_parties table
    cur.execute("""
    CREATE TABLE assosiated_parties (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR,
        phone VARCHAR,
        address VARCHAR,
        type VARCHAR, -- 'customer' or 'supplier'
        extra_info JSONB,
        bar_code VARCHAR(20) UNIQUE
    )
    """)

    # Create index for fast barcode lookups
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_parties_barcode
        ON assosiated_parties(bar_code)
        WHERE bar_code IS NOT NULL
    """)

    # Create the bills table
    cur.execute("""
    CREATE TABLE bills (
      id BIGSERIAL,
      store_id BIGINT REFERENCES store_data(id),
      time TIMESTAMP,
      discount FLOAT,
      total FLOAT,
      type VARCHAR, -- 'sell' or 'buy' or 'return' or 'BNPL' or 'reserve' or 'installment'
      note TEXT,
      party_id BIGINT REFERENCES assosiated_parties(id),
      PRIMARY KEY (id, store_id)
    )
    """)

    cur.execute("""INSERT INTO bills (id, store_id) VALUES (-1, 0)""")

    # Create the bills_collections table
    cur.execute("""
    CREATE TABLE bills_collections (
        id BIGSERIAL PRIMARY KEY,
        collection_id UUID DEFAULT gen_random_uuid(),
        party_id BIGINT REFERENCES assosiated_parties(id),
        bill_id BIGINT,
        store_id BIGINT,
        is_closed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP,
        FOREIGN KEY (bill_id, store_id) REFERENCES bills(id, store_id)
    )
    """)

    # Create the cash_flow table
    cur.execute("""
    CREATE TABLE cash_flow (
      id BIGSERIAL,
      store_id BIGINT REFERENCES store_data(id),
      time TIMESTAMP,
      amount FLOAT,
      type VARCHAR,
      bill_id BIGINT,
      description VARCHAR,
      total FLOAT,
      party_id BIGINT,
      PRIMARY KEY (id, store_id),
      FOREIGN KEY (store_id, bill_id) REFERENCES bills(store_id, id)
    )
    """)

    # Create Installments table
    cur.execute("""
    CREATE TABLE installments (
        id BIGSERIAL PRIMARY KEY,
        bill_id BIGINT,
        store_id BIGINT REFERENCES store_data(id),
        paid float,
        installments_count INT,
        installment_interval INT,
        UNIQUE (bill_id, store_id),
        FOREIGN KEY (store_id, bill_id) REFERENCES bills(store_id, id)
    )
    """)

    # Create the Installments flow table
    cur.execute("""
    CREATE TABLE installments_flow (
        id BIGSERIAL PRIMARY KEY,
        installment_id BIGINT REFERENCES installments(id),
        amount float,
        time TIMESTAMP
    )
    """)

    # Create the products_flow table
    cur.execute("""
    CREATE TABLE products_flow (
      id BIGSERIAL,
      store_id BIGINT REFERENCES store_data(id),
      bill_id BIGINT,
      product_id BIGINT,
      wholesale_price FLOAT,
      price FLOAT,
      amount INT,
      time TIMESTAMP NOT NULL,
      total INT,
      PRIMARY KEY (id, store_id),
      FOREIGN KEY (store_id, bill_id) REFERENCES bills(store_id, id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
    """)

    # Create the shifts table
    cur.execute("""
    CREATE TABLE shifts (
      id BIGSERIAL,
      store_id BIGINT REFERENCES store_data(id),
      start_date_time TIMESTAMP,
      end_date_time TIMESTAMP,
      current BOOLEAN,
      user_id INT REFERENCES users(id),
      PRIMARY KEY (id, store_id)
    )
    """)

    # Create the employee table
    cur.execute("""
    CREATE TABLE employee (
        id BIGSERIAL PRIMARY KEY,
        store_id BIGINT NOT NULL,
        name VARCHAR NOT NULL,
        phone VARCHAR,
        address VARCHAR,
        salary FLOAT,
        started_on TIMESTAMP,
        stopped_on TIMESTAMP
    )
    """)

    # Create salaries table
    cur.execute("""
    CREATE TABLE salaries (
        id BIGSERIAL PRIMARY KEY,
        employee_id BIGINT REFERENCES employee(id),
        amount FLOAT,
        bonus FLOAT,
        deductions FLOAT,
        time TIMESTAMP
    )
    """)

    # Create the notifications table
    cur.execute("""
    CREATE TABLE notifications (
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

    # Create indexes for notifications
    cur.execute("""
        CREATE INDEX idx_notifications_store_id ON notifications(store_id);
        CREATE INDEX idx_notifications_type_reference ON notifications(store_id, type, reference_id);
        CREATE INDEX idx_notifications_deleted_at ON notifications(deleted_at) WHERE deleted_at IS NULL;
    """)

    # Create the product_batches table for tracking inventory by expiration date
    cur.execute("""
    CREATE TABLE product_batches (
        id BIGSERIAL PRIMARY KEY,
        store_id BIGINT NOT NULL REFERENCES store_data(id),
        product_id BIGINT NOT NULL REFERENCES products(id),
        quantity INT NOT NULL DEFAULT 0,
        expiration_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(store_id, product_id, expiration_date)
    )
    """)

    # Create indexes for product_batches
    cur.execute("""
        CREATE INDEX idx_product_batches_store_product ON product_batches(store_id, product_id);
        CREATE INDEX idx_product_batches_expiration ON product_batches(expiration_date);
        CREATE INDEX idx_product_batches_store_expiration ON product_batches(store_id, expiration_date);
    """)


def create_all_triggers(cur):
    """Create all database triggers"""
    print("Creating database triggers...")

    # Trigger to add new products to inventory of all stores
    cur.execute("""
    -- Trigger to add new products to inventory of all stores
    CREATE OR REPLACE FUNCTION add_product_to_all_stores()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Insert the new product into inventory for all stores with 0 stock
        INSERT INTO product_inventory (store_id, product_id, stock)
        SELECT id, NEW.id, 0
        FROM store_data;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    CREATE TRIGGER trigger_add_product_to_all_stores
    AFTER INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION add_product_to_all_stores();
    """)

    # Update the trigger to update stock after inserting a product flow
    cur.execute("""
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
    cur.execute("""
    -- Trigger to insert into cash_flow after inserting a bill
    CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert()
    RETURNS TRIGGER AS $$
    BEGIN  
        -- If the bill ID is negative, skip cash flow insertion
        -- This is used for the -1 bill that is created for each store
        -- and it could represent a bill update      
        IF NEW.id < 0 THEN
            RETURN NEW;
        END IF;
                
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
                    WHEN NEW.type = 'buy-return' THEN 'in'
                    ELSE 'out' END,
            NEW.id,
            CASE WHEN NEW.type = 'sell' THEN 'فاتورة بيع'
                  WHEN NEW.type = 'buy' THEN 'فاتورة شراء'
                  WHEN NEW.type = 'return' THEN 'فاتورة مرتجع'
                  WHEN NEW.type = 'reserve' THEN 'فاتورة حجز'
                  WHEN NEW.type = 'installment' THEN 'فاتورة تقسيط'
                  WHEN NEW.type = 'BNPL' THEN 'فاتورة اجل'
                  WHEN NEW.type = 'buy-return' THEN 'فاتورة مرتجع شراء'
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

    # Create the trigger to add entry to bills_collections when bill has an associated party
    cur.execute("""
    CREATE OR REPLACE FUNCTION add_bill_to_collections()
    RETURNS TRIGGER AS $$
    DECLARE
        existing_collection_id UUID;
    BEGIN
        -- Only add to bills_collections if party_id is not null
        IF NEW.party_id IS NOT NULL THEN
            -- Check if there's an existing open collection for this party
            SELECT collection_id INTO existing_collection_id
            FROM bills_collections
            WHERE party_id = NEW.party_id 
              AND is_closed = FALSE
            LIMIT 1;
            
            IF existing_collection_id IS NOT NULL THEN
                -- Add to existing collection
                INSERT INTO bills_collections (collection_id, party_id, bill_id, store_id, is_closed)
                VALUES (existing_collection_id, NEW.party_id, NEW.id, NEW.store_id, FALSE);
            ELSE
                -- Create new collection with a new UUID
                INSERT INTO bills_collections (party_id, bill_id, store_id, is_closed)
                VALUES (NEW.party_id, NEW.id, NEW.store_id, FALSE);
                -- The collection_id will be generated automatically with DEFAULT gen_random_uuid()
            END IF;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
                
    CREATE TRIGGER trigger_add_bill_to_collections
    AFTER INSERT ON bills
    FOR EACH ROW
    EXECUTE FUNCTION add_bill_to_collections();
    """)

    # Create a trigger to keep assosiated parties in sync with available stores
    cur.execute("""
    -- Trigger function to manage the corresponding associated party for each store
    CREATE OR REPLACE FUNCTION sync_store_to_associated_party()
    RETURNS TRIGGER AS $$
    BEGIN
        -- For INSERT: Create a new associated party for the store
        IF TG_OP = 'INSERT' THEN
            INSERT INTO assosiated_parties (name, phone, address, type, extra_info)
            VALUES (NEW.name, NEW.phone, NEW.address, 'store', jsonb_build_object('store_id', NEW.id));
        
        -- For UPDATE: Update the corresponding associated party
        ELSIF TG_OP = 'UPDATE' THEN
            UPDATE assosiated_parties
            SET 
                name = NEW.name,
                phone = NEW.phone,
                address = NEW.address
            WHERE extra_info->>'store_id' = NEW.id::text;
            
            -- If no matching party found, create one
            IF NOT FOUND THEN
                INSERT INTO assosiated_parties (name, phone, address, type, extra_info)
                VALUES (NEW.name, NEW.phone, NEW.address, 'store', jsonb_build_object('store_id', NEW.id));
            END IF;
        END IF;
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Create the trigger for both INSERT and UPDATE operations
    CREATE TRIGGER trigger_sync_store_to_associated_party
    AFTER INSERT OR UPDATE ON store_data
    FOR EACH ROW
    EXECUTE FUNCTION sync_store_to_associated_party();
    """)

    # Create the trigger to insert into cash_flow after inserting a salary
    cur.execute("""
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
            -NEW.amount - NEW.bonus + NEW.deductions,
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
    cur.execute("""
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
    cur.execute("""
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
            WHERE installments.id = NEW.installment_id),
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
    cur.execute("""
    -- Trigger to update product price when inserting a buy bill
    CREATE OR REPLACE FUNCTION update_product_price_after_insert()
    RETURNS TRIGGER AS $$
    BEGIN
      IF (SELECT type FROM bills WHERE id = NEW.bill_id AND store_id = new.store_id LIMIT 1) = 'buy' THEN 
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
    cur.execute("""
    -- Trigger to update total after insert
    CREATE OR REPLACE FUNCTION update_total_after_insert()
    RETURNS TRIGGER AS $$
    DECLARE
        latest_total NUMERIC;
        latest_record RECORD;
    BEGIN
        -- Lock the latest cash_flow record for this store to prevent race conditions
        SELECT id, total INTO latest_record
        FROM cash_flow
        WHERE store_id = NEW.store_id
        AND (time < NEW.time OR (time = NEW.time AND id < NEW.id))
        ORDER BY time DESC, id DESC
        LIMIT 1
        FOR UPDATE;

        -- If no previous record exists, start from 0
        IF latest_record.total IS NULL THEN
            latest_total := 0;
        ELSE
            latest_total := latest_record.total;
        END IF;

        -- Update the total for the current row
        UPDATE cash_flow
        SET total = COALESCE(NEW.amount, 0) + latest_total
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
    cur.execute("""
    -- Trigger to bubble fix the total after update
    CREATE OR REPLACE FUNCTION bubble_fix_total_after_update()
    RETURNS TRIGGER AS $$
    DECLARE
        previous_total NUMERIC;
        current_total NUMERIC;
        rec RECORD;
    BEGIN
        -- Only process if amount actually changed
        IF NEW.amount = OLD.amount THEN
            RETURN NEW;
        END IF;

        -- First, fix the total of the current row
        -- Get the previous row's total
        SELECT total INTO previous_total
        FROM cash_flow
        WHERE store_id = NEW.store_id
        AND (time < NEW.time OR (time = NEW.time AND id < NEW.id))
        ORDER BY time DESC, id DESC
        LIMIT 1;
        
        IF previous_total IS NULL THEN
            previous_total := 0;
        END IF;
        
        -- Update the current row's total
        UPDATE cash_flow
        SET total = NEW.amount + previous_total
        WHERE id = NEW.id
        AND store_id = NEW.store_id;
        
        -- Get the updated total
        current_total := NEW.amount + previous_total;

        -- Now update all subsequent records
        FOR rec IN 
            SELECT id, amount
            FROM cash_flow
            WHERE store_id = NEW.store_id
            AND (time > NEW.time OR (time = NEW.time AND id > NEW.id))
            ORDER BY time ASC, id ASC
            FOR UPDATE
        LOOP
            current_total := current_total + rec.amount;
            
            UPDATE cash_flow
            SET total = current_total
            WHERE id = rec.id
            AND store_id = NEW.store_id;
        END LOOP;

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
    cur.execute("""
    -- Trigger to update cash_flow after update
    CREATE OR REPLACE FUNCTION update_cash_flow_after_update()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Only update if total actually changed
        IF NEW.total != OLD.total THEN
            -- Just update the amount - let the cash_flow update trigger handle the bubble fix
            UPDATE cash_flow
            SET amount = NEW.total
            WHERE bill_id = NEW.id
            AND store_id = NEW.store_id;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_cash_flow_after_update
    AFTER UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_flow_after_update();
    """)

    # Trigger to add the -1 bill after adding a new store
    cur.execute("""
    -- Trigger to add the -1 bill after adding a new store
    CREATE OR REPLACE FUNCTION add_negative_one_bill()
    RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO bills (id, store_id)
        VALUES (-1, NEW.id);
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    CREATE TRIGGER trigger_add_negative_one_bill
    AFTER INSERT ON store_data
    FOR EACH ROW
    EXECUTE FUNCTION add_negative_one_bill();
    """)

    # Trigger to bubble fix the total after delete
    cur.execute("""
    -- Trigger to bubble fix the total after delete
    CREATE OR REPLACE FUNCTION bubble_fix_total_after_delete()
    RETURNS TRIGGER AS $$
    DECLARE
        previous_total NUMERIC;
        current_total NUMERIC;
        rec RECORD;
    BEGIN
        -- Get the total from the record before the deleted one
        SELECT total INTO previous_total
        FROM cash_flow
        WHERE store_id = OLD.store_id
        AND (time < OLD.time OR (time = OLD.time AND id < OLD.id))
        ORDER BY time DESC, id DESC
        LIMIT 1;

        IF previous_total IS NULL THEN
            previous_total := 0;
        END IF;

        current_total := previous_total;

        -- Update all subsequent records to fix their totals
        FOR rec IN
            SELECT id, amount
            FROM cash_flow
            WHERE store_id = OLD.store_id
            AND (time > OLD.time OR (time = OLD.time AND id > OLD.id))
            ORDER BY time ASC, id ASC
            FOR UPDATE
        LOOP
            current_total := current_total + rec.amount;

            UPDATE cash_flow
            SET total = current_total
            WHERE id = rec.id
            AND store_id = OLD.store_id;
        END LOOP;

        RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_bubble_fix_total_after_delete
    AFTER DELETE ON cash_flow
    FOR EACH ROW
    EXECUTE FUNCTION bubble_fix_total_after_delete();
    """)

    # Create the trigger to delete cash_flow after deleting installment flow
    cur.execute("""
    -- Trigger to delete cash_flow after deleting installment flow
    CREATE OR REPLACE FUNCTION delete_cash_flow_after_delete_installment_flow()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Delete the corresponding cash flow entry
        DELETE FROM cash_flow
        WHERE store_id = (SELECT store_id FROM installments WHERE id = OLD.installment_id)
        AND bill_id = (SELECT bill_id FROM installments WHERE id = OLD.installment_id)
        AND amount = OLD.amount
        AND time = OLD.time;
        
        RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_delete_cash_flow_after_delete_installment_flow
    AFTER DELETE ON installments_flow
    FOR EACH ROW
    EXECUTE FUNCTION delete_cash_flow_after_delete_installment_flow();
    """)

    # Create the trigger to delete cash_flow after deleting installment (for مقدم entries)
    cur.execute("""
    -- Trigger to delete cash_flow after deleting installment
    CREATE OR REPLACE FUNCTION delete_cash_flow_after_delete_installment()
    RETURNS TRIGGER AS $$
    BEGIN
        -- Delete the corresponding cash flow entry for the deposit (مقدم)
        DELETE FROM cash_flow
        WHERE store_id = OLD.store_id
        AND bill_id = OLD.bill_id
        AND amount = OLD.paid
        AND description = 'مقدم';
        
        RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_delete_cash_flow_after_delete_installment
    AFTER DELETE ON installments
    FOR EACH ROW
    EXECUTE FUNCTION delete_cash_flow_after_delete_installment();
    """)

    # Create the trigger to update total after inserting a products_flow
    cur.execute("""
    -- Trigger to update total after insert in products_flow
    CREATE OR REPLACE FUNCTION update_products_flow_total_after_insert()
    RETURNS TRIGGER AS $$
    DECLARE
        latest_total INTEGER;
        latest_record RECORD;
    BEGIN
        -- Lock the latest products_flow record for this store and product to prevent race conditions
        SELECT id, total INTO latest_record
        FROM products_flow
        WHERE store_id = NEW.store_id
        AND product_id = NEW.product_id
        AND (time < NEW.time OR (time = NEW.time AND id < NEW.id))
        ORDER BY time DESC, id DESC
        LIMIT 1
        FOR UPDATE;

        -- If no previous record exists, start from 0
        IF latest_record.total IS NULL THEN
            latest_total := 0;
        ELSE
            latest_total := latest_record.total;
        END IF;

        -- Update the total for the current row
        UPDATE products_flow
        SET total = COALESCE(NEW.amount, 0) + latest_total
        WHERE id = NEW.id
        AND store_id = NEW.store_id;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_products_flow_total_after_insert
    AFTER INSERT ON products_flow
    FOR EACH ROW
    EXECUTE FUNCTION update_products_flow_total_after_insert();
    """)

    # Create trigger to update notifications updated_at timestamp
    cur.execute("""
    -- Trigger to update updated_at timestamp on notifications
    CREATE OR REPLACE FUNCTION update_notification_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_notification_timestamp
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_timestamp();
    """)


def main():
    """Main function to initialize the database"""
    print("Initializing database...")
    conn, cur = connect_to_database()

    try:
        drop_all_tables(cur)
        create_all_tables(cur)
        create_all_triggers(cur)

        # Commit the changes
        conn.commit()
        print("Database initialized successfully!")
    except Exception as e:
        conn.rollback()
        print(f"Error initializing database: {str(e)}")
    finally:
        # Close the connection
        cur.close()
        conn.close()
        print("Database connection closed.")


if __name__ == "__main__":
    main()

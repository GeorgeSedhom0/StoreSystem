import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv
import bcrypt  # type: ignore
from datetime import datetime

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

# Drop all tables before creating
cur.execute("DROP TABLE IF EXISTS users CASCADE")
cur.execute("DROP TABLE IF EXISTS scopes CASCADE")
cur.execute("DROP TABLE IF EXISTS store_data CASCADE")
cur.execute("DROP TABLE IF EXISTS pages CASCADE")
cur.execute("DROP TABLE IF EXISTS products CASCADE")
cur.execute("DROP TABLE IF EXISTS bills CASCADE")
cur.execute("DROP TABLE IF EXISTS cash_flow CASCADE")
cur.execute("DROP TABLE IF EXISTS products_flow CASCADE")
cur.execute("DROP TABLE IF EXISTS shifts CASCADE")
cur.execute("DROP TABLE IF EXISTS assosiated_parties CASCADE")
cur.execute("DROP TABLE IF EXISTS reserved_products CASCADE")
cur.execute("DROP TABLE IF EXISTS installments CASCADE")
cur.execute("DROP TABLE IF EXISTS installments_flow CASCADE")

cur.execute("SET TIME ZONE 'Africa/Cairo'")

# Create the scopes table
cur.execute("""
CREATE TABLE scopes (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR UNIQUE,
    pages INT[]
)""")
cur.execute("""
INSERT INTO scopes (name, pages)
VALUES
('admin', ARRAY[1, 2, 3, 4, 5, 6, 7, 8])
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
('شراء', '/buy'),
('اضافة منتجات', '/add-to-storage'),
('الفواتير', '/bills'),
('المنتجات', '/products'),
('الحركات المالية', '/cash'),
('التقارير', '/analytics'),
('الاعدادات', '/settings')
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
    password.encode('utf-8'),
    bcrypt.gensalt(),
).decode('utf-8')
cur.execute(
    """
INSERT INTO users (username, password, email, phone, language, scope_id)
VALUES
('george', %s, 'myamazingemail@me.wow.so.cool.email', '01000000000', 'ar', 1)
""", (hashed_password, ))

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
INSERT INTO store_data (name, address, phone, extra_info)
VALUES
('', '', '', '{}')
""")

# Create the products table
cur.execute("""
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR,
  bar_code VARCHAR UNIQUE,
  wholesale_price FLOAT,
  price FLOAT,
  stock INT,
  category VARCHAR
)
""")

# Create reserverd products table
cur.execute("""
CREATE TABLE reserved_products (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES products(id),
    amount INT
)
""")

# Create the bills table
cur.execute("""
CREATE TABLE bills (
  id BIGSERIAL,
  store_id BIGINT,
  ref_id VARCHAR,
  time TIMESTAMP,
  discount FLOAT,
  total FLOAT,
  type VARCHAR, -- 'sell' or 'buy' or 'return' or 'BNPL',
  party_id BIGINT,
  PRIMARY KEY (id, store_id)
)
""")

# Create the cash_flow table
cur.execute("""
CREATE TABLE cash_flow (
  id BIGSERIAL,
  store_id BIGINT,
  time TIMESTAMP,
  amount FLOAT,
  type VARCHAR,
  bill_id VARCHAR,
  description VARCHAR,
  total FLOAT,
  party_id BIGINT,
  PRIMARY KEY (id, store_id)
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
    extra_info JSONB
)
""")

# Create Installments table
cur.execute("""
CREATE TABLE installments (
    id BIGSERIAL PRIMARY KEY,
    bill_id BIGINT,
    store_id BIGINT,
    paid float,
    installments_count INT,
    installment_interval INT
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
  store_id BIGINT,
  bill_id VARCHAR,
  product_id BIGINT REFERENCES products(id),
  wholesale_price FLOAT,
  price FLOAT,
  amount INT,
  PRIMARY KEY (id, store_id)
)
""")

# Create the shifts table
cur.execute("""
CREATE TABLE shifts (
  id BIGSERIAL,
  store_id BIGINT,
  start_date_time TIMESTAMP,
  end_date_time TIMESTAMP,
  current BOOLEAN,
  "user" INT REFERENCES users(id)
)
""")

# --------------------------------------------------------------------
# ----------------------------triggers--------------------------------
# --------------------------------------------------------------------

# Create the trigger to update stock after inserting a product flow
cur.execute("""
-- Trigger to update stock after insert
CREATE OR REPLACE FUNCTION update_stock_after_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products
    SET stock = stock + NEW.amount
    WHERE id = NEW.product_id;
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
        NEW.store_id || '_' || NEW.id,
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
        NEW.store_id || '_' || NEW.bill_id,
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
        (SELECT store_id || '_' || bill_id FROM installments
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

# Create the trigger to update ref_id after inserting a bill
cur.execute("""
-- Trigger to update ref_id after insert
CREATE OR REPLACE FUNCTION update_ref_id_after_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE bills
    SET ref_id = NEW.store_id || '_' || NEW.id
    WHERE id = NEW.id
    AND store_id = NEW.store_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ref_id_after_insert
AFTER INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION update_ref_id_after_insert();
""")

# Create the trigger to update product price when inserting a buy bill
cur.execute("""
-- Trigger to update product price when inserting a buy bill
CREATE OR REPLACE FUNCTION update_product_price_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT type FROM bills WHERE ref_id = NEW.bill_id) = 'buy' THEN
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
    latest_total FLOAT;
BEGIN
    SELECT total INTO latest_total FROM cash_flow
    WHERE id != NEW.id OR store_id != NEW.store_id
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

# create the trigger to bubble fix the total after updating a cash_flow
cur.execute("""
-- Trigger to bubble fix the total after update
CREATE OR REPLACE FUNCTION bubble_fix_total_after_update()
RETURNS TRIGGER AS $$
DECLARE
    amount_diff FLOAT;
BEGIN
    amount_diff := NEW.amount - OLD.amount;

    -- Bubble correct the total on all rows that were inserted after the updated row
    UPDATE cash_flow
    SET total = total + amount_diff
    WHERE time > OLD.time;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bubble_fix_total_after_update
AFTER UPDATE ON cash_flow
FOR EACH ROW
WHEN (NEW.amount != OLD.amount)
EXECUTE FUNCTION bubble_fix_total_after_update();
""")

# create the trigger to update cash_flow after updating a bill
cur.execute("""
-- Trigger to update cash_flow after update
CREATE OR REPLACE FUNCTION update_cash_flow_after_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE cash_flow
    SET
        amount = NEW.total,
        total = total + NEW.total - OLD.total
    WHERE bill_id = NEW.ref_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cash_flow_after_update
AFTER UPDATE ON bills
FOR EACH ROW
EXECUTE FUNCTION update_cash_flow_after_update();
""")

# Insert initial products
cur.execute("""
INSERT INTO products (name, bar_code, wholesale_price, price, stock, category)
VALUES
('Product A', '1234567890123', 10, 15, 100, 'General'),
('Product B', '1234567890124', 20, 25, 50, 'General')
""")

# Insert a bill with associated product flows
current_time = datetime.now().isoformat()
cur.execute("""
INSERT INTO bills (store_id, ref_id, time, discount, total, type, party_id)
VALUES (%s, %s, %s, %s, %s, %s, NULL) RETURNING id
""", (1, '1_1', current_time, 0, 15, 'sell'))

cur.execute("""
INSERT INTO products_flow (store_id, bill_id, product_id, wholesale_price, price, amount)
VALUES (%s, %s, (SELECT id FROM products WHERE name = %s), %s, %s, %s)
""", (1, '1_1', 'Product A', 10, 15, -1))

# --------------------------------------------------------------------
# --------------------------------------------------------------------

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

import psycopg2
from dotenv import load_dotenv
from os import getenv

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

# Create the products table
cur.execute("""
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR,
  bar_code VARCHAR UNIQUE,
  wholesale_price FLOAT,
  price FLOAT,
  stock INT,
  category VARCHAR,
  last_update TIMESTAMP
)
""")

# Create the syncs table
cur.execute("""
CREATE TABLE syncs (
  id BIGSERIAL PRIMARY KEY,
  time TIMESTAMP
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
  PRIMARY KEY (id, store_id)
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

# create the trigger to update the last_update column in products
cur.execute("""
CREATE OR REPLACE FUNCTION update_last_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_update := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_last_update
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_last_update();
""")

# Create the triggers between products and products_flow
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

-- Trigger to update stock after delete
CREATE OR REPLACE FUNCTION update_stock_after_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products
    SET stock = stock - OLD.amount
    WHERE id = OLD.product_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_delete
AFTER DELETE ON products_flow
FOR EACH ROW
EXECUTE FUNCTION update_stock_after_delete();
""")

# Create the triggers between bills and products_flow
cur.execute("""
-- Trigger to delete products_flow after deleting a corresponding bill
CREATE OR REPLACE FUNCTION delete_products_flow_after_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM products_flow
    WHERE bill_id = OLD.ref_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_delete_products_flow_after_delete
AFTER DELETE ON bills
FOR EACH ROW
EXECUTE FUNCTION delete_products_flow_after_delete();
""")

# Create the trigger to insert into cash_flow after inserting a bill
cur.execute("""
-- Trigger to insert into cash_flow after inserting a bill
CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert()
RETURNS TRIGGER AS $$
DECLARE
    latest_total FLOAT;
BEGIN
    SELECT total INTO latest_total FROM cash_flow ORDER BY time DESC LIMIT 1;

    IF latest_total IS NULL THEN
        latest_total := 0;
    END IF;

    INSERT INTO cash_flow (
        store_id,
        time,
        amount,
        type,
        bill_id,
        description,
        total
    ) VALUES (
        NEW.store_id,
        NEW.time,
        NEW.total,
        CASE WHEN NEW.total > 0 THEN 'sell' ELSE 'buy' END,
        NEW.store_id || '_' || NEW.id,
        CASE WHEN NEW.total > 0 THEN 'فاتورة بيع' ELSE 'فاتورة شراء' END,
        NEW.total + latest_total
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_insert_cash_flow_after_insert
AFTER INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION insert_cash_flow_after_insert();
""")

# Create the trigger to insert into cash_flow after deleting a bill
cur.execute("""
-- Trigger to insert into cash_flow after deleting a bill
CREATE OR REPLACE FUNCTION insert_cash_flow_after_delete()
RETURNS TRIGGER AS $$
DECLARE
  latest_total FLOAT;
BEGIN
  SELECT total INTO latest_total FROM cash_flow ORDER BY time DESC, id DESC LIMIT 1;

  IF latest_total IS NULL THEN
    latest_total := 0;
  END IF;

  INSERT INTO cash_flow (
    store_id,
    time,
    amount,
    type,
    bill_id,
    description,
    total
  ) VALUES (
    OLD.store_id,
    CURRENT_TIMESTAMP,  -- Use the current time
    -OLD.total,
    'delete',
    OLD.store_id || '_' || OLD.id,
    CASE WHEN OLD.total > 0 THEN 'استرجاع فاتورة بيع' ELSE 'استرجاع فاتورة شراء' END,
    latest_total - OLD.total
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_insert_cash_flow_after_delete
AFTER DELETE ON bills
FOR EACH ROW
EXECUTE FUNCTION insert_cash_flow_after_delete();
""")

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

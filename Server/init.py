import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
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

# Drop all tables before creating
cur.execute("DROP TABLE IF EXISTS products CASCADE")
cur.execute("DROP TABLE IF EXISTS bills CASCADE")
cur.execute("DROP TABLE IF EXISTS cash_flow CASCADE")
cur.execute("DROP TABLE IF EXISTS products_flow CASCADE")
cur.execute("DROP TABLE IF EXISTS shifts CASCADE")

cur.execute("SET TIME ZONE 'Africa/Cairo'")

# Create the products table
cur.execute(
    """
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR,
  bar_code VARCHAR UNIQUE,
  wholesale_price FLOAT,
  price FLOAT,
  stock INT,
  category VARCHAR
)
"""
)

# Create the bills table
cur.execute(
    """
CREATE TABLE bills (
  id BIGSERIAL,
  store_id BIGINT,
  ref_id VARCHAR,
  time TIMESTAMP,
  discount FLOAT,
  total FLOAT,
  type VARCHAR, -- 'sell' or 'buy' or 'return' or 'BNPL'
  PRIMARY KEY (id, store_id)
)
"""
)

# Create the cash_flow table
cur.execute(
    """
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
"""
)

# Create the products_flow table
cur.execute(
    """
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
"""
)

# Create the shifts table
cur.execute(
    """
CREATE TABLE shifts (
  id BIGSERIAL,
  store_id BIGINT,
  start_date_time TIMESTAMP,
  end_date_time TIMESTAMP,
  current BOOLEAN
)
"""
)

# --------------------------------------------------------------------
# ----------------------------triggers--------------------------------
# --------------------------------------------------------------------

# Create the trigger to update stock after inserting a product flow
cur.execute(
    """
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
"""
)

# Create the trigger to insert into cash_flow after inserting a bill
cur.execute(
    """
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
        description
    ) VALUES (
        NEW.store_id,
        NEW.time,
        NEW.total,
        CASE WHEN NEW.type = 'sell' THEN 'in' ELSE 'out' END,
        NEW.store_id || '_' || NEW.id,
        CASE WHEN NEW.type = 'sell' THEN 'فاتورة بيع'
              WHEN NEW.type = 'buy' THEN 'فاتورة شراء'
              WHEN NEW.type = 'return' THEN 'فاتورة مرتجع'
              ELSE 'فاتورة بيع اجل' END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_insert_cash_flow_after_insert
AFTER INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION insert_cash_flow_after_insert();
"""
)

# Create the trigger to update ref_id after inserting a bill
cur.execute(
    """
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
"""
)

# Create the trigger to update product price when inserting a buy bill
cur.execute(
    """
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
"""
)

# Create the trigger to update total after inserting a cash_flow
cur.execute(
    """
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
"""
)

# create the trigger to bubble fix the total after updating a cash_flow
cur.execute(
    """
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
"""
)

# create the trigger to update cash_flow after updating a bill
cur.execute(
    """
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
"""
)


# --------------------------------------------------------------------
# --------------------------------------------------------------------

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

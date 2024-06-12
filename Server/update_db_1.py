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

# add needs update column to all tables as a boolean, being false by default

cur.execute(
    "ALTER TABLE products ADD COLUMN needs_update BOOLEAN DEFAULT TRUE")
# remove the column last_update from the products table
cur.execute("ALTER TABLE products DROP COLUMN last_update")

cur.execute("ALTER TABLE bills ADD COLUMN needs_update BOOLEAN DEFAULT TRUE")
cur.execute(
    "ALTER TABLE cash_flow ADD COLUMN needs_update BOOLEAN DEFAULT TRUE")
cur.execute(
    "ALTER TABLE products_flow ADD COLUMN needs_update BOOLEAN DEFAULT TRUE")

# the column is not added on syncs/shifts tables as they are not synced between devices

# creating new triggers

# create the trigger to bubble fix the total after updating a cash_flow
cur.execute("""
-- Trigger to bubble fix the total after update
CREATE OR REPLACE FUNCTION bubble_fix_total_after_update()
RETURNS TRIGGER AS $$
DECLARE
    latest_total FLOAT;
BEGIN
    latest_total := OLD.total + OLD.amount;

    IF latest_total IS NULL THEN
        latest_total := 0;
    END IF;

    -- Update the total on the updated row
    UPDATE cash_flow
    SET
        total = NEW.amount + latest_total
    WHERE id = NEW.id
    AND store_id = NEW.store_id;

    -- Bubble correct the total on all rows that were inserted after the updated row
    UPDATE cash_flow
    SET total = total - OLD.amount + New.amount
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

# create the trigger to update cash_flow after updating a bill and set needs_update to true
cur.execute("""
-- Trigger to update cash_flow after update
CREATE OR REPLACE FUNCTION update_cash_flow_after_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE cash_flow
    SET amount = NEW.total
    WHERE bill_id = NEW.ref_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cash_flow_after_update
AFTER UPDATE ON bills
FOR EACH ROW
EXECUTE FUNCTION update_cash_flow_after_update();
""")

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

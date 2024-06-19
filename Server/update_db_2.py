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


cur.execute("ALTER TABLE products DROP COLUMN needs_update;")
cur.execute("ALTER TABLE products_flow DROP COLUMN needs_update;")
cur.execute("ALTER TABLE bills DROP COLUMN needs_update;")
cur.execute("ALTER TABLE cash_flow DROP COLUMN needs_update;")

# update the trigger function to bubble fix the total after updating a cash_flow
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
""")

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
""")

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

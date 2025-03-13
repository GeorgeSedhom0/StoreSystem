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

# Check if the trigger already exists
cur.execute("""
SELECT EXISTS (
    SELECT 1 
    FROM pg_trigger 
    WHERE tgname = 'trigger_insert_cash_flow_after_insert_salary'
);
""")

trigger_exists = cur.fetchone()[0]

if trigger_exists:
    print(
        "Trigger 'trigger_insert_cash_flow_after_insert_salary' already exists. No changes needed."
    )
    conn.close()
    exit(0)
else:
    print("Creating trigger and function...")

    # Drop the trigger and function if they already exist
    cur.execute("""
    DROP TRIGGER IF EXISTS trigger_insert_cash_flow_after_insert_salary ON salaries;
    DROP FUNCTION IF EXISTS insert_cash_flow_after_insert_salary;
    """)

    # Create the trigger to insert into cash_flow after inserting a salary
    cur.execute("""
    -- Trigger to insert into cash_flow after inserting a salary
    CREATE OR REPLACE FUNCTION insert_cash_flow_after_insert_salary()
    RETURNS TRIGGER AS $$
    DECLARE
        employee_name VARCHAR;
        emp_store_id BIGINT;
        formatted_date VARCHAR;
    BEGIN
        SELECT name INTO employee_name FROM employee WHERE id = NEW.employee_id;
        SELECT store_id INTO emp_store_id FROM employee WHERE id = NEW.employee_id;
        formatted_date := TO_CHAR(NEW.time, 'MM/YYYY');

        INSERT INTO cash_flow (
            store_id,
            time,
            amount,
            type,
            description,
            party_id
        ) VALUES (
            emp_store_id,
            NOW(),
            -NEW.amount - NEW.bonus + NEW.deductions,
            'out',
            'راتب ' || employee_name || ' بمبلغ ' || NEW.amount || ' ومكافأة ' || NEW.bonus || ' وخصم ' || NEW.deductions || ' لشهر ' || formatted_date,
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

    print("Trigger and function created successfully.")

    # Commit the changes and close the connection
    conn.commit()

cur.close()
conn.close()

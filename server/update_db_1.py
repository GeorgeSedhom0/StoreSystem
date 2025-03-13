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


def table_exists(table_name):
    """Check if a table exists in the database."""
    cur.execute(
        """
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name = %s
        )
    """,
        (table_name,),
    )
    return cur.fetchone()[0]


def function_exists(function_name):
    """Check if a function exists in the database."""
    cur.execute(
        """
        SELECT EXISTS (
            SELECT FROM pg_proc
            WHERE proname = %s
        )
    """,
        (function_name,),
    )
    return cur.fetchone()[0]


def trigger_exists(trigger_name):
    """Check if a trigger exists in the database."""
    cur.execute(
        """
        SELECT EXISTS (
            SELECT FROM pg_trigger
            WHERE tgname = %s
        )
    """,
        (trigger_name,),
    )
    return cur.fetchone()[0]


def page_exists(page_path):
    """Check if a page exists in the database."""
    cur.execute(
        """
        SELECT EXISTS (
            SELECT FROM pages
            WHERE path = %s
        )
    """,
        (page_path,),
    )
    return cur.fetchone()[0]


try:
    # Create the employee table if it doesn't exist
    if not table_exists("employee"):
        cur.execute("""
        CREATE TABLE employee (
            store_id BIGINT,
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR NOT NULL,
            phone VARCHAR,
            address VARCHAR,
            salary FLOAT,
            started_on TIMESTAMP,
            stopped_on TIMESTAMP
        )
        """)
        print("Created employee table")
    else:
        print("Employee table already exists")

    # Insert page if it doesn't exist
    if not page_exists("/employees"):
        cur.execute("""
        INSERT INTO pages (name, path)
        VALUES ('الموظفين', '/employees')
        """)
        print("Added employees page")
    else:
        print("Employees page already exists")

    # Create salaries table if it doesn't exist
    if not table_exists("salaries"):
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
        print("Created salaries table")
    else:
        print("Salaries table already exists")

    # Create the trigger function and trigger if they don't exist
    if not function_exists("insert_cash_flow_after_insert_salary"):
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
                NEW.amount + NEW.bonus - NEW.deductions,
                'out',
                'راتب ' || employee_name || ' بمبلغ ' || NEW.amount || ' ومكافأة ' || NEW.bonus || ' وخصم ' || NEW.deductions,
                NEW.employee_id
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """)
        print("Created trigger function")
    else:
        print("Trigger function already exists")

    if not trigger_exists("trigger_insert_cash_flow_after_insert_salary"):
        cur.execute("""
        CREATE TRIGGER trigger_insert_cash_flow_after_insert_salary
        AFTER INSERT ON salaries
        FOR EACH ROW
        EXECUTE FUNCTION insert_cash_flow_after_insert_salary();
        """)
        print("Created trigger")
    else:
        print("Trigger already exists")

    # Commit the changes
    conn.commit()
    print("Database updated successfully")

except Exception as e:
    # Rollback in case of error
    conn.rollback()
    print(f"An error occurred: {e}")
finally:
    # Close the connection
    cur.close()
    conn.close()
    print("Database connection closed")

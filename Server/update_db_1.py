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

# Create the employee table
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

cur.execute("""
INSERT INTO pages (name, path)
VALUES ('الموظفين', '/employees')
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
        NEW.amount + NEW.bonus - NEW.deductions,
        'out',
        'راتب ' || employee_name || ' بمبلغ ' || NEW.amount || ' ومكافأة ' || NEW.bonus || ' وخصم ' || NEW.deductions,
        NEW.employee_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_insert_cash_flow_after_insert_salary
AFTER INSERT ON salaries
FOR EACH ROW
EXECUTE FUNCTION insert_cash_flow_after_insert_salary();
""")

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

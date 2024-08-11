import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv
import bcrypt  # type: ignore

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

cur.execute("""
ALTER TABLE store_data ADD COLUMN extra_info JSONB
""")

cur.execute("""
INSERT INTO store_data (name, address, phone, extra_info)
VALUES
('', '', '', '{}')
""")

cur.execute("""
ALTER TABLE bills ADD COLUMN party_id BIGINT
""")

cur.execute("""
ALTER TABLE cash_flow ADD COLUMN party_id BIGINT
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

# Create reserverd products table
cur.execute("""
CREATE TABLE reserved_products (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT REFERENCES products(id),
    amount INT
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

DROP TRIGGER IF EXISTS trigger_insert_cash_flow_after_insert ON bills;

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
conn.commit()

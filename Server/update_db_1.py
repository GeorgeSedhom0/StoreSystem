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

conn.commit()

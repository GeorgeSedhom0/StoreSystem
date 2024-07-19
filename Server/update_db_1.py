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
conn.commit()

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

# Add the is_deleted column to the products table
cur.execute("""
ALTER TABLE products
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE
""")

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

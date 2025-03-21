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

# Check if the is_deleted column already exists in the products table
cur.execute("""
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'is_deleted'
""")

# Execute the ALTER TABLE only if the column doesn't exist
if cur.fetchone() is None:
    print("Adding is_deleted column to products table...")
    cur.execute("""
    ALTER TABLE products
    ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE
    """)
    print("Column added successfully.")
else:
    print("The is_deleted column already exists in products table. No changes made.")

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

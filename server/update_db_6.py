import psycopg2
from dotenv import load_dotenv
from os import getenv
from psycopg2.extras import DictCursor

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# Create the connection
conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)

# Use DictCursor to get results as dictionaries
cur = conn.cursor(cursor_factory=DictCursor)

print("Starting products table cleanup...")

# Check for deprecated columns in products table
deprecated_columns = ["store_id", "stock", "is_deleted"]

for column in deprecated_columns:
    # Check if column exists
    cur.execute(f"""
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = '{column}'
    """)

    if cur.fetchone():
        print(f"Removing deprecated column '{column}' from products table...")
        try:
            cur.execute(f"ALTER TABLE products DROP COLUMN {column}")
            conn.commit()
            print(f"Column '{column}' successfully removed.")
        except Exception as e:
            conn.rollback()
            print(f"Error removing column '{column}': {e}")
    else:
        print(f"Column '{column}' not found in products table. No action needed.")

# Check column structure to verify
cur.execute("""
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'products'
ORDER BY ordinal_position
""")

columns = [row["column_name"] for row in cur.fetchall()]
print("\nCurrent products table columns:", columns)

# Close the connection
cur.close()
conn.close()
print("\nProducts table cleanup completed.")

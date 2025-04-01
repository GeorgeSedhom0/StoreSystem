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

cur.execute("""
    UPDATE cash_flow
    SET total = s.cumulative_sum
    FROM (
    SELECT 
        id, 
        store_id, 
        SUM(amount) OVER (PARTITION BY store_id ORDER BY time, id) AS cumulative_sum
    FROM cash_flow
    ) s
    WHERE cash_flow.id = s.id
    AND cash_flow.store_id = s.store_id;
  """)

conn.commit()
cur.close()
conn.close()
print("Cash flow total updated successfully.")

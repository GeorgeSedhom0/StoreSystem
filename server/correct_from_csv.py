import psycopg2
from dotenv import load_dotenv
from os import getenv
import pandas as pd

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


# try to get into input.csv file
df = pd.read_csv("input.csv")

# Iterate over the rows in the DataFrame
for index, row in df.iterrows():
    # Process each row
    bar_code = str(row["code"])
    diff = int(row["diff"])
    store_id = 0
    bill_id = -1
    if not bar_code or not diff or bar_code == "nan" or diff == 0:
        continue
    print(bar_code, diff)
    cur.execute(
        """
        SELECT id, wholesale_price, price FROM products WHERE bar_code = %s
        """,
        (bar_code,),
    )
    product = cur.fetchone()
    product_id, wholesale_price, price = product

    if not product_id:
        print(f"Product with bar_code {bar_code} not found.")
        continue

    print(product_id, wholesale_price, price, diff)
    cur.execute(
        """
        INSERT INTO products_flow (store_id, bill_id, product_id, wholesale_price, price, amount, time)
        VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """,
        (
            store_id,
            bill_id,
            product_id,
            wholesale_price,
            price,
            diff,
        ),
    )
    conn.commit()
    print("Data inserted successfully.")

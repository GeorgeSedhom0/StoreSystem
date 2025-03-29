import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv
import bcrypt  # type: ignore
from psycopg2.extras import RealDictCursor  # type: ignore

HOST = "truenas-scale.taila74eaf.ts.net"
DATABASE = "store"
USER = "postgres"
PASS = "f121220"

# Create the connection
conn = psycopg2.connect(
    host=HOST, database=DATABASE, user=USER, password=PASS, port=5433
)

# Get a cursor
cur = conn.cursor(cursor_factory=RealDictCursor)

cur.execute(
    """
    SELECT id, name, wholesale_price, price
    FROM products
    """
)
prods = cur.fetchall()

corrected_prods_csv_path = "./corrected_products.csv"

from pandas import read_csv
import pandas as pd

# Read the CSV file
df = read_csv(corrected_prods_csv_path)
# Convert the DataFrame to a list of dictionaries
corrected_prods = df.to_dict(orient="records")

# Match product by name to add id to the corrected products
for prod in corrected_prods:
    for db_prod in prods:
        if db_prod["name"] == prod["name"]:
            if id in prod:
                print(f"Product {prod['name']} already has an id")
            prod["id"] = db_prod["id"]
            prod["wholesale_price"] = db_prod["wholesale_price"]
            prod["price"] = db_prod["price"]


# insert the diff into products_flow
for prod in corrected_prods:
    if prod["deleted"] == "TRUE":
        continue
    if "id" not in prod:
        print(f"Product {prod['name']} does not have an id")
        continue

    diff = prod["amount"] - prod["new_amount"]
    cur.execute(
        """
            INSERT INTO products_flow (
                    store_id, bill_id, product_id,
                    amount, wholesale_price, price
            ) VALUES (
                %s, %s, %s,
                %s, %s, %s
            )
    """,
        (1, -1, prod["id"], -diff, prod["wholesale_price"], prod["price"]),
    )

    cur.execute(
        """
            INSERT INTO products_flow (
                    store_id, bill_id, product_id,
                    amount, wholesale_price, price
            ) VALUES (
                %s, %s, %s,
                %s, %s, %s
            )
    """,
        (0, -2, prod["id"], diff, prod["wholesale_price"], prod["price"]),
    )

conn.commit()
cur.close()
conn.close()

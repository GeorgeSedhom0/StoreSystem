# read then print everything from olddata.xls

import xlrd  # type: ignore
import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv
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

# Open the workbook
book = xlrd.open_workbook("olddata.xls")

# Get the first sheet
sheet = book.sheet_by_index(0)

# Iterate through the sheet and add the data to the database
for row in range(sheet.nrows):
    # Skip the header row
    if row == 0:
        continue

    # Get the data from the row
    bar_code = sheet.cell(row, 1).value
    name = sheet.cell(row, 2).value
    price = float(sheet.cell(row, 9).value) if sheet.cell(row, 9).value else 0
    inprice = float(sheet.cell(row, 6).value) if sheet.cell(row, 6).value else 0
    stock = int(sheet.cell(row, 4).value) if sheet.cell(row, 4).value else 0
    # print(bar_code, name, price, inprice, stock)
    # continue

    # Insert the data into the database
    cur.execute(
        """
    INSERT INTO products (
        name, bar_code, wholesale_price,
        price, stock, category, last_update
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    -- skip if a constraint violation occurs
    ON CONFLICT (bar_code) DO NOTHING
    """, (name, bar_code, inprice, price, stock, 0, datetime.now().isoformat()))

# Commit the changes
conn.commit()
conn.close()

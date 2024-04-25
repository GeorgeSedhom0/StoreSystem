# read then print everything from olddata.xls

import xlrd
import psycopg2
from dotenv import load_dotenv
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
    name = sheet.cell(row, 0).value
    bar_code = sheet.cell(row, 1).value
    wholesale_price = sheet.cell(row, 2).value
    price = sheet.cell(row, 3).value
    stock = sheet.cell(row, 4).value
    category = sheet.cell(row, 5).value

    # Insert the data into the database
    cur.execute("""
    INSERT INTO products (name, bar_code, wholesale_price, price, stock, category, last_update)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (name, bar_code, wholesale_price, price, stock, category, datetime.now().isoformat()))

# Commit the changes
conn.commit()
conn.close()

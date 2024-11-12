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

# List of pages to insert
pages = [
    ("بيع", "/sell"),
    ("شراء", "/buy"),
    ("اضافة منتجات", "/add-to-storage"),
    ("الفواتير", "/bills"),
    ("المنتجات", "/products"),
    ("الحركات المالية", "/cash"),
    ("التقارير", "/analytics"),
    ("الاعدادات", "/settings"),
    ("اداارة الاقساط", "/installments"),
    ("الموظفين", "/employees"),
]

# Insert each page if it doesn't exist
for name, path in pages:
    cur.execute("SELECT 1 FROM pages WHERE name = %s", (name,))
    if not cur.fetchone():
        cur.execute("INSERT INTO pages (name, path) VALUES (%s, %s)", (name, path))

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

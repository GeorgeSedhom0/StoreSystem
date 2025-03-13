import psycopg2
from dotenv import load_dotenv
from os import getenv
import sys

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")


def check_changes_applied():
    """Check if the changes in this script have already been applied"""
    try:
        # Create a test connection
        conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)
        cur = conn.cursor()

        # Check if all pages from our list exist in the database
        all_pages_exist = True
        for name, path in pages:
            cur.execute(
                "SELECT 1 FROM pages WHERE name = %s AND path = %s", (name, path)
            )
            if not cur.fetchone():
                all_pages_exist = False
                break

        cur.close()
        conn.close()

        return all_pages_exist
    except Exception as e:
        print(f"Error checking for existing changes: {e}")
        return False


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

# Check if changes are already applied
if check_changes_applied():
    print("Changes have already been applied. Exiting.")
    sys.exit(0)

# Create the connection
conn = psycopg2.connect(host=HOST, database=DATABASE, user=USER, password=PASS)

# Get a cursor
cur = conn.cursor()

# Insert each page if it doesn't exist
for name, path in pages:
    cur.execute("SELECT 1 FROM pages WHERE name = %s", (name,))
    if not cur.fetchone():
        cur.execute("INSERT INTO pages (name, path) VALUES (%s, %s)", (name, path))

# Commit the changes and close the connection
conn.commit()
cur.close()
conn.close()

print("Database updates applied successfully.")

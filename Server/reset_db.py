import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv

def reset_db():
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

    # Drop all tables before creating
    cur.execute("DROP TABLE IF EXISTS products CASCADE")
    cur.execute("DROP TABLE IF EXISTS syncs CASCADE")
    cur.execute("DROP TABLE IF EXISTS bills CASCADE")
    cur.execute("DROP TABLE IF EXISTS cash_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS products_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS shifts CASCADE")

    cur.execute("SET TIME ZONE 'Africa/Cairo'")

    # Commit the changes and close the connection
    conn.commit()
    cur.close()
    conn.close()
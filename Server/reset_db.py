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

    cur.execute("DROP TABLE IF EXISTS users CASCADE")
    cur.execute("DROP TABLE IF EXISTS scopes CASCADE")
    cur.execute("DROP TABLE IF EXISTS store_data CASCADE")
    cur.execute("DROP TABLE IF EXISTS pages CASCADE")
    cur.execute("DROP TABLE IF EXISTS products CASCADE")
    cur.execute("DROP TABLE IF EXISTS bills CASCADE")
    cur.execute("DROP TABLE IF EXISTS cash_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS products_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS shifts CASCADE")
    cur.execute("DROP TABLE IF EXISTS assosiated_parties CASCADE")
    cur.execute("DROP TABLE IF EXISTS reserved_products CASCADE")
    cur.execute("DROP TABLE IF EXISTS installments CASCADE")
    cur.execute("DROP TABLE IF EXISTS installments_flow CASCADE")
    cur.execute("DROP TABLE IF EXISTS employee CASCADE")
    cur.execute("DROP TABLE IF EXISTS salaries CASCADE")

    cur.execute("SET TIME ZONE 'Africa/Cairo'")

    # Commit the changes and close the connection
    conn.commit()
    cur.close()
    conn.close()

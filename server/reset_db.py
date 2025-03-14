import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv
from init import drop_all_tables


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

    # Drop the tables
    drop_all_tables(cur)

    # Commit the changes and close the connection
    conn.commit()
    cur.close()
    conn.close()

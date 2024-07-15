import psycopg2  # type: ignore
from dotenv import load_dotenv  # type: ignore
from os import getenv
import bcrypt  # type: ignore

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

# Create the scopes table
cur.execute("""
CREATE TABLE scopes (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR UNIQUE,
    pages INT[]
)""")
cur.execute("""
INSERT INTO scopes (name, pages)
VALUES
('admin', ARRAY[1, 2, 3, 4, 5, 6, 7, 8])
""")

# Create pages table
cur.execute("""
CREATE TABLE pages (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR,
    path VARCHAR
)""")

cur.execute("""
INSERT INTO pages (name, path)
VALUES
('بيع', '/sell'),
('شراء', '/buy'),
('اضافة منتجات', '/add-to-storage'),
('الفواتير', '/bills'),
('المنتجات', '/products'),
('الحكرات المالية', '/cash'),
('التقارير', '/analytics'),
('الاعدادات', '/settings')
""")

# Create the users table
cur.execute("""
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR UNIQUE,
    password VARCHAR,
    email VARCHAR,
    phone VARCHAR,
    language VARCHAR,
    scope_id BIGINT REFERENCES scopes(id)
)
""")
# IF for god knows why reason you're using this and you're not me
# comment out the following query
password = "verystrongpassword"
hashed_password = bcrypt.hashpw(
    password.encode('utf-8'),
    bcrypt.gensalt(),
).decode('utf-8')
cur.execute(
    """
INSERT INTO users (username, password, email, phone, language, scope_id)
VALUES
('george', %s, 'myamazingemail@me.wow.so.cool.email', '01000000000', 'ar', 1)
""", (hashed_password, ))

# Create the store_data table
cur.execute("""
CREATE TABLE store_data (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR,
    address VARCHAR,
    phone VARCHAR
)""")

cur.execute('ALTER TABLE shifts ADD COLUMN "user" INT REFERENCES users(id)')

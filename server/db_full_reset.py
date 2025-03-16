import psycopg2
from dotenv import load_dotenv
from os import getenv
import sys
import os
import subprocess
import logging
import json  # Add import for JSON handling
from init import create_all_tables, drop_all_tables, create_all_triggers

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")


DATABASE_TEMP = "temp_store"


def restore_db_from_file(filepath):
    """
    Restores the database to a previous save point from a SQL file

    Args:
        filepath (str): Path to the SQL file containing the backup
    """
    try:
        # Validate environment variables
        assert PASS, "No password provided"
        assert HOST, "No host provided"
        assert USER, "No user provided"

        # Set target database to the temporary database
        target_db = DATABASE_TEMP

        # Check if file exists
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Backup file not found: {filepath}")

        # Set password for psql
        os.environ["PGPASSWORD"] = PASS

        # Create the temporary database if it doesn't exist
        conn = psycopg2.connect(
            host=HOST,
            database="postgres",
            user=USER,
            password=PASS,
        )
        conn.autocommit = True  # Set autocommit to True to allow CREATE DATABASE
        try:
            with conn.cursor() as cur:
                # Check if database exists first to avoid error
                cur.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s", (target_db,)
                )
                if not cur.fetchone():
                    cur.execute(f"CREATE DATABASE {target_db}")
                    logging.info("Temporary database created successfully")
                else:
                    logging.info(
                        "Temporary database already exists will be deleted and recreated"
                    )
                    cur.execute(f"DROP DATABASE {target_db}")
                    cur.execute(f"CREATE DATABASE {target_db}")
        finally:
            conn.commit()
            conn.close()

        # Restore the database using psql
        result = subprocess.run(
            ["psql", "-h", HOST, "-U", USER, "-d", target_db, "-f", filepath],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise Exception(f"Database restore failed: {result.stderr}")

        logging.info("Database restored successfully to %s", target_db)
        return True

    except Exception as e:
        logging.error(f"Error restoring database: {e}")
        raise e


def full_db_reset():
    with psycopg2.connect(
        host=HOST,
        database=DATABASE,
        user=USER,
        password=PASS,
    ) as conn:
        with conn.cursor() as cur:
            drop_all_tables(cur)
            create_all_tables(cur)
            conn.commit()


def get_old_data():
    with psycopg2.connect(
        host=HOST,
        database=DATABASE_TEMP,
        user=USER,
        password=PASS,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM scopes")
            scopes = cur.fetchall()

            cur.execute("SELECT * FROM users")
            users = cur.fetchall()

            cur.execute("SELECT * FROM products")
            products = cur.fetchall()

            cur.execute("SELECT * FROM store_data")
            store_data = cur.fetchall()

            cur.execute("SELECT * FROM pages")
            pages = cur.fetchall()

            cur.execute("SELECT * FROM bills")
            bills = cur.fetchall()

            cur.execute("SELECT * FROM cash_flow")
            cash_flow = cur.fetchall()

            cur.execute("SELECT * FROM products_flow")
            products_flow = cur.fetchall()

            cur.execute("SELECT * FROM shifts")
            shifts = cur.fetchall()

            cur.execute("SELECT * FROM assosiated_parties")
            associated_parties = cur.fetchall()

            cur.execute("SELECT * FROM reserved_products")
            reserved_products = cur.fetchall()

            cur.execute("SELECT * FROM installments")
            installments = cur.fetchall()

            cur.execute("SELECT * FROM installments_flow")
            installments_flow = cur.fetchall()

            cur.execute("SELECT * FROM employee")
            employees = cur.fetchall()

            cur.execute("SELECT * FROM salaries")
            salaries = cur.fetchall()

            return (
                scopes,
                users,
                products,
                store_data,
                pages,
                bills,
                cash_flow,
                products_flow,
                shifts,
                associated_parties,
                reserved_products,
                installments,
                installments_flow,
                employees,
                salaries,
            )


def insert_new_data(old_data):
    """
    Insert data from the old schema into the new schema

    Args:
        old_data (tuple): Tuple containing data from all tables in old schema
    """
    (
        scopes,
        users,
        products,
        store_data,
        pages,
        bills,
        cash_flow,
        products_flow,
        shifts,
        associated_parties,
        reserved_products,
        installments,
        installments_flow,
        employees,
        salaries,
    ) = old_data

    try:
        with psycopg2.connect(
            host=HOST,
            database=DATABASE,
            user=USER,
            password=PASS,
        ) as conn:
            with conn.cursor() as cur:
                # Insert scopes
                print("Inserting scopes...")
                for scope in scopes:
                    if scope[0] == 1:
                        continue
                    cur.execute(
                        "INSERT INTO scopes (id, name, pages) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                        (scope[0], scope[1], scope[2]),
                    )

                # # Insert pages
                # print("Inserting pages...")
                # for page in pages:
                #     cur.execute(
                #         "INSERT INTO pages (id, name, path) VALUES (%s, %s, %s)",
                #         (page[0], page[1], page[2]),
                #     )

                # Insert users (keeping same scope_id)
                print("Inserting users...")
                for user in users:
                    if user[0] == 1:
                        continue
                    cur.execute(
                        "INSERT INTO users (id, username, password, email, phone, language, scope_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (user[0], user[1], user[2], user[3], user[4], user[5], user[6]),
                    )

                # # Insert store data (only use store_id = 1)
                # print("Inserting store data...")
                # for data in store_data:
                #     if data[0] == 1:  # Only insert store_id = 1
                #         cur.execute(
                #             "INSERT INTO store_data (id, name, address, phone, extra_info) VALUES (%s, %s, %s, %s, %s)",
                #             (1, data[1], data[2], data[3], data[4]),
                #         )

                # Insert products (skip needs_update and is_deleted flag, as stock is now in product_inventory)
                print("Inserting products...")
                for product in products:
                    cur.execute(
                        "INSERT INTO products (id, name, bar_code, wholesale_price, price, category) VALUES (%s, %s, %s, %s, %s, %s)",
                        (
                            product[0],
                            product[1],
                            product[2],
                            product[3],
                            product[4],
                            product[6],
                        ),
                    )

                # Insert product inventory (move stock from products to product_inventory)
                print("Inserting product inventory...")
                for product in products:
                    # Only insert if not deleted
                    if not product[8]:  # is_deleted column
                        cur.execute(
                            "INSERT INTO product_inventory (store_id, product_id, stock, is_deleted) VALUES (%s, %s, %s, %s)",
                            (
                                1,
                                product[0],
                                product[5],
                                product[8],
                            ),  # Use store_id=1, product stock
                        )
                # Insert into product_inventory for all products store 0 with stock=0
                for product in products:
                    cur.execute(
                        "INSERT INTO product_inventory (store_id, product_id, stock, is_deleted) VALUES (%s, %s, %s, %s)",
                        (
                            0,
                            product[0],
                            0,
                            False,
                        ),  # Use store_id=0, product stock=0
                    )

                # Insert associated parties
                print("Inserting associated parties...")
                for party in associated_parties:
                    # Convert dict to JSON string if it's not None
                    extra_info = json.dumps(party[5]) if party[5] is not None else None

                    cur.execute(
                        "INSERT INTO assosiated_parties (id, name, phone, address, type, extra_info) VALUES (%s, %s, %s, %s, %s, %s)",
                        (party[0], party[1], party[2], party[3], party[4], extra_info),
                    )

                # Reset ID sequence for associated parties to be able to insert new parties
                cur.execute(
                    "SELECT setval('assosiated_parties_id_seq', (SELECT MAX(id) FROM assosiated_parties)+1)"
                )

                # Insert associated parties for the two stores
                print("Creating associated parties for stores...")
                cur.execute("""
                INSERT INTO assosiated_parties (name, phone, address, type, extra_info)
                VALUES ('المخزن', '', '', 'store', '{"store_id": 0}')
                ON CONFLICT DO NOTHING;
                """)

                cur.execute("""
                INSERT INTO assosiated_parties (name, phone, address, type, extra_info)
                VALUES ('المحل', '', '', 'store', '{"store_id": 1}')
                ON CONFLICT DO NOTHING;
                """)

                # Insert bills (convert string ref_id to bigint id, set store_id=1)
                print("Inserting bills...")
                for bill in bills:
                    # Convert string ref_id to int for the new schema if possible
                    bill_id = abs(bill[0])  # Use the original bill ID

                    cur.execute(
                        "INSERT INTO bills (id, store_id, time, discount, total, type, party_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (bill_id, 1, bill[3], bill[4], bill[5], bill[6], bill[8]),
                    )
                cur.execute(
                    "INSERT INTO bills (id, store_id) VALUES (%s, %s)",
                    (-1, 1),
                )

                # Insert cash_flow (convert string bill_id to bigint)
                print("Inserting cash flow...")
                for cf in cash_flow:
                    # Convert string bill_id to int for the new schema if it exists
                    bill_id = None
                    if cf[5]:
                        bill_id = abs(int(cf[5].split("_")[1]))

                    cur.execute(
                        "INSERT INTO cash_flow (id, store_id, time, amount, type, bill_id, description, total, party_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        (cf[0], 1, cf[2], cf[3], cf[4], bill_id, cf[6], cf[7], cf[9]),
                    )

                # Insert products_flow (convert string bill_id to bigint)
                print("Inserting products flow...")
                for pf in products_flow:
                    # Convert string bill_id to int for the new schema if it exists
                    bill_id = None
                    if pf[2]:
                        bill_id = abs(int(pf[2].split("_")[1]))

                    cur.execute(
                        "INSERT INTO products_flow (id, store_id, bill_id, product_id, wholesale_price, price, amount) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (pf[0], 1, bill_id, pf[3], pf[4], pf[5], pf[6]),
                    )

                # Insert shifts (set store_id=1, rename user to user_id)
                print("Inserting shifts...")
                for shift in shifts:
                    cur.execute(
                        "INSERT INTO shifts (id, store_id, start_date_time, end_date_time, current, user_id) VALUES (%s, %s, %s, %s, %s, %s)"
                        "ON CONFLICT DO NOTHING",
                        (shift[0], 1, shift[2], shift[3], shift[4], shift[5]),
                    )

                # Insert reserved products
                print("Inserting reserved products...")
                for rp in reserved_products:
                    cur.execute(
                        "INSERT INTO reserved_products (id, store_id, product_id, amount) VALUES (%s, %s, %s, %s)",
                        (rp[0], 1, rp[1], rp[2]),
                    )

                # Insert installments
                print("Inserting installments...")
                for inst in installments:
                    # Convert bill_id to int if it's not already
                    bill_id = inst[1]

                    cur.execute(
                        "INSERT INTO installments (id, bill_id, store_id, paid, installments_count, installment_interval) VALUES (%s, %s, %s, %s, %s, %s)",
                        (inst[0], bill_id, 1, inst[3], inst[4], inst[5]),
                    )

                # Insert installments_flow
                print("Inserting installments flow...")
                for flow in installments_flow:
                    cur.execute(
                        "INSERT INTO installments_flow (id, installment_id, amount, time) VALUES (%s, %s, %s, %s)",
                        (flow[0], flow[1], flow[2], flow[3]),
                    )

                # Insert employees (set store_id=1)
                print("Inserting employees...")
                for emp in employees:
                    cur.execute(
                        "INSERT INTO employee (id, store_id, name, phone, address, salary, started_on, stopped_on) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                        (emp[1], 1, emp[2], emp[3], emp[4], emp[5], emp[6], emp[7]),
                    )

                # Insert salaries
                print("Inserting salaries...")
                for sal in salaries:
                    cur.execute(
                        "INSERT INTO salaries (id, employee_id, amount, bonus, deductions, time) VALUES (%s, %s, %s, %s, %s, %s)",
                        (sal[0], sal[1], sal[2], sal[3], sal[4], sal[5]),
                    )

                conn.commit()
                print("Data migration completed successfully")

    except Exception as e:
        print(f"Error inserting data: {e}")
        raise e


def reset_all_sequences(cursor):
    """
    Reset all sequence values to the maximum value of their associated columns + 1
    to fix auto-increment after explicit ID inserts
    """
    print("Resetting sequences for all tables...")
    tables = [
        "scopes",
        "users",
        "products",
        "product_inventory",
        "assosiated_parties",
        "bills",
        "cash_flow",
        "products_flow",
        "shifts",
        "reserved_products",
        "installments",
        "installments_flow",
        "employee",
        "salaries",
    ]

    for table in tables:
        # Get primary key column (assumes id is the primary key for all tables)
        cursor.execute(
            f"SELECT column_name FROM information_schema.key_column_usage WHERE table_name = '{table}' AND constraint_name = '{table}_pkey'"
        )
        result = cursor.fetchone()
        if result:
            pk_column = result[0]
            # Get the sequence name
            cursor.execute(f"SELECT pg_get_serial_sequence('{table}', '{pk_column}')")
            seq_name = cursor.fetchone()[0]
            if seq_name:
                # Set the sequence to max value + 1
                cursor.execute(
                    f"SELECT setval('{seq_name}', COALESCE((SELECT MAX({pk_column})+1 FROM {table}), 1), false)"
                )
                print(f"Reset sequence for table {table}")


def migrate_data():
    """
    Migrate data from the old database to the new database
    """
    try:
        # Step 1: Get old data from temp database
        old_data = get_old_data()

        # Step 2: Reset the main database schema
        full_db_reset()

        # Step 3: Insert old data into new schema
        insert_new_data(old_data)

        # Step 4: Reset all sequences for auto-increment
        with psycopg2.connect(
            host=HOST,
            database=DATABASE,
            user=USER,
            password=PASS,
        ) as conn:
            with conn.cursor() as cur:
                reset_all_sequences(cur)
                conn.commit()

        # Step 5: Create all triggers
        with psycopg2.connect(
            host=HOST,
            database=DATABASE,
            user=USER,
            password=PASS,
        ) as conn:
            with conn.cursor() as cur:
                create_all_triggers(cur)
                conn.commit()

        return True
    except Exception as e:
        print(f"Error during migration: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "migrate":
        print("Starting migration process...")
        restore_db_from_file("./backup1.sql")
        if migrate_data():
            print("Migration completed successfully")
        else:
            print("Migration failed")
    else:
        print("Usage: python db_full_reset.py migrate")

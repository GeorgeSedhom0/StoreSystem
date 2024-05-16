from typing import Optional
from fastapi import FastAPI, HTTPException  # type: ignore
from fastapi.responses import JSONResponse  # type: ignore
from typing import Literal
from pydantic import BaseModel  # type: ignore
import psycopg2  # type: ignore
from psycopg2.extras import RealDictCursor  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
import requests  # type: ignore
from datetime import datetime
import logging
from dotenv import load_dotenv  # type: ignore
from os import getenv

load_dotenv()

STORE_ID = getenv("STORE_ID")

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")
OTHER_STORE = getenv("OTHER_STORE")

# Create the FastAPI application
app = FastAPI()

origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s [%(levelname)s] - %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')


class Product(BaseModel):
    "Define the Product model"

    id: Optional[int] = None
    name: str
    bar_code: str
    wholesale_price: float
    price: float
    category: str
    stock: Optional[int] = None


class ProductFlow(BaseModel):
    "Define the ProductFlow model"

    id: int
    quantity: int
    price: float
    wholesale_price: float


class Bill(BaseModel):
    "Define the Bill model"

    time: str
    discount: float
    total: float
    products_flow: list[ProductFlow]


class Database:
    "Database context manager to handle the connection and cursor"

    def __init__(self, host, database, user, password, real_dict_cursor=True):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor

    def __enter__(self):
        self.conn = psycopg2.connect(host=self.host,
                                     database=self.database,
                                     user=self.user,
                                     password=self.password)
        return self.conn.cursor(
            cursor_factory=RealDictCursor if self.real_dict_cursor else None)

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.commit()
        self.conn.close()


@app.get("/barcode")
def get_bar_code():
    """
    Get the next available bar code
    """
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            "SELECT COALESCE(MAX(bar_code), '100000000000') AS b FROM products"
        )
        return str(int(cur.fetchone()["b"]) + 1)


@app.get("/store-id")
def get_store_id():
    """
    Get the store ID
    """
    return STORE_ID


@app.get("/products")
def get_products():
    """
    Get all products from the database

    Returns:
        List[Dict]: A list of dictionaries containing the products

    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""SELECT
                        id, name, bar_code, wholesale_price,
                        price, stock, category
                        FROM products""")
            products = cur.fetchall()
        return JSONResponse(content=products)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/product")
def add_product(product: Product):
    """
    Add a product to the database

    Args:
        product (Product): The product to add

    Returns:
        Dict: The product added to the database
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            print(product)
            cur.execute(
                """
                INSERT INTO products (
                    name, bar_code, wholesale_price,
                    price, stock, category, last_update
                )
                VALUES (%s, %s, %s, %s, 0, %s, %s)
                RETURNING *
                """,
                (product.name, product.bar_code, product.wholesale_price,
                 product.price, product.category, datetime.now().isoformat()))
            return cur.fetchone()
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.put("/product/{product_id}")
def update_product(product_id: int, product: Product):
    """
    Update a product in the database

    Args:
        product_id (int): The ID of the product to update
        product (Product): The product data to update

    Returns:
        Dict: The updated product
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE products
                SET name = %s, bar_code = %s, last_update = %s
                WHERE id = %s
                RETURNING *
                """,
                (product.name, product.bar_code, datetime.now().isoformat(),
                 product_id))
            return cur.fetchone()
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.delete("/product/{product_id}")
def delete_product(product_id: int):
    """
    Delete a product from the database

    Args:
        product_id (int): The ID of the product to delete

    Returns:
        Dict: A message indicating the result of the operation
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                DELETE FROM products
                WHERE id = %s
                RETURNING *
                """, (product_id, ))
            return cur.fetchone()
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/bills")
def get_bills(start_date: Optional[str] = None,
              end_date: Optional[str] = None):
    """
    Get all bills from the database

    Returns:
        List[Dict]: A list of dictionaries containing the bills

    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """SELECT
                    bills.ref_id AS id,
                    bills.time,
                    bills.discount,
                    bills.total,
                    bills.type,
                    json_agg(
                        json_build_object(
                            'name', products.name,
                            'amount', products_flow.amount,
                            'wholesale_price', products_flow.wholesale_price,
                            'price', products_flow.price
                        )
                    ) AS products
                FROM bills
                JOIN products_flow ON bills.ref_id = products_flow.bill_id
                JOIN products ON products_flow.product_id = products.id
                WHERE bills.time >= %s
                AND bills.time <= %s
                GROUP BY bills.ref_id, bills.time, bills.discount,
                    bills.total, bills.type
                ORDER BY bills.time DESC
                    """,
                (start_date if start_date else "1970-01-01",
                 end_date if end_date else datetime.now().isoformat()))
            bills = cur.fetchall()
            return bills
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/bill")
def add_bill(bill: Bill, move_type: Literal["sell", "buy", "BNPL", "return"]):
    """
    Add a bill to the database

    Args:
        bill (Bill): The bill to add
        move_type (Literal["sell", "buy"]): The move_type of bill

    Returns:
        Dict: A message indicating the result of the operation
    """
    bill_total = (bill.total if move_type == "sell" else
                  -bill.total if move_type in ["buy", "return"] else 0)
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO bills (store_id, time, discount, total, type)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (STORE_ID, bill.time, bill.discount, bill_total, move_type))
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=400,
                                    detail="Insert into bills failed")
            bill_id = result["id"]

            # Create a list of tuples
            values = [(STORE_ID, f"{STORE_ID}_{bill_id}", product_flow.id,
                       -product_flow.quantity if move_type in ["sell", "BNPL"]
                       else product_flow.quantity,
                       product_flow.wholesale_price, product_flow.price)
                      for product_flow in bill.products_flow]

            cur.executemany(
                """
                INSERT INTO products_flow (
                    store_id, bill_id, product_id,
                    amount, wholesale_price, price
                )
                VALUES (%s, %s, %s, %s, %s, %s)

                """, values)
            if cur.rowcount != len(values):
                raise HTTPException(status_code=400,
                                    detail="Insert into products_flow failed")

            # get last bill for returnig
            cur.execute(
                """
                SELECT
                    bills.ref_id AS id,
                    bills.time,
                    bills.discount,
                    bills.total,
                    bills.type,
                    json_agg(
                        json_build_object(
                            'name', products.name,
                            'amount', products_flow.amount,
                            'wholesale_price', products_flow.wholesale_price,
                            'price', products_flow.price
                        )
                    ) AS products
                FROM bills
                JOIN products_flow ON bills.ref_id = products_flow.bill_id
                JOIN products ON products_flow.product_id = products.id
                WHERE bills.id = %s
                AND bills.store_id = %s
                GROUP BY bills.ref_id, bills.time, bills.discount, bills.total, bills.type
                    """, (bill_id, STORE_ID))

            bill = cur.fetchone()
        return {"message": "Bill added successfully", "bill": bill}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/cash-flow")
def get_cash_flow(start_date: Optional[str] = None,
                  end_date: Optional[str] = None):
    """
    Get all cash flow records from the database

    Returns:
        List[Dict]: A list of dictionaries containing the cash flow records

    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """SELECT
                    TO_CHAR(time, 'YYYY-MM-DD HH24:MI:SS') AS time,
                    amount,
                    type,
                    description,
                    total
                FROM cash_flow
                WHERE time >= %s
                AND time <= %s
                ORDER BY cash_flow.time DESC
                    """,
                (start_date if start_date else "1970-01-01",
                 end_date if end_date else datetime.now().isoformat()))
            cash_flow = cur.fetchall()
            return cash_flow
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/cash-flow")
def add_cash_flow(amount: float, move_type: Literal["in", "out"],
                  description: str):
    """
    Add a cash flow record to the database

    Args:
        amount (float): The amount of the cash flow
        move_type (Literal["in", "out"]): The type of the cash flow
        description (str): The description of the cash flow

    Returns:
        Dict: A message indicating the result of the operation
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO cash_flow (
                    store_id, time, amount, type, description
                )
                VALUES (%s, %s, %s, %s, %s)
                """, (
                    STORE_ID,
                    datetime.now().isoformat(),
                    amount,
                    move_type,
                    description,
                ))
            return {"message": "Cash flow record added successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/start-shift")
def start_shift():
    """
    Start a new shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""
                SELECT start_date_time FROM shifts
                WHERE current = True
                """)
            if cur.fetchone():
                raise HTTPException(status_code=400,
                                    detail="There is already a current shift")
            cur.execute(
                """
                INSERT INTO shifts (start_date_time, current)
                VALUES (%s, %s)
                RETURNING start_date_time
                """, (datetime.now(), True))
            return cur.fetchone()
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/end-shift")
def end_shift():
    """
    End the current shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE shifts
                SET end_date_time = %s, current = False
                WHERE current = True
                """, (datetime.now(), ))
            return {"message": "Shift ended successfully"}
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/current-shift")
def current_shift():
    """
    Get the current shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""
                SELECT start_date_time FROM shifts
                WHERE current = True
                """)
            current_shift = cur.fetchone()
            if not current_shift:
                return {"message": "No current shift"}
            return current_shift
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/shift-total")
def shift_total():
    """
    Get the total sales for the current shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""
                SELECT type, COALESCE(SUM(total), 0) AS total
                FROM bills
                WHERE time >= (
                    SELECT start_date_time FROM shifts
                    WHERE current = True
                )
                GROUP BY type
                """)
            data = cur.fetchall()

        totals = {"sell_total": 0, "buy_total": 0, "return_total": 0}
        for row in data:
            if row["type"] == "sell":
                totals["sell_total"] += row["total"]
            elif row["type"] == "buy":
                totals["buy_total"] += row["total"]
            elif row["type"] == "return":
                totals["return_total"] += row["total"]

        return totals
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/accept-sync")
def accept_sync(data: dict):
    """
    Accept the synchronization request and process the data
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Insert the products_flow data

            logging.info("Inserting products data...")

            for row in data["products"]:
                cur.execute(
                    """
                    INSERT INTO products (
                        id, name, bar_code, wholesale_price,
                        price, category, last_update, stock
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 0)
                    ON CONFLICT (id) DO NOTHING
                """, row)

            logging.info("Inserting bills data...")

            for row in data["bills"]:
                cur.execute(
                    """
                    INSERT INTO bills (
                        id, store_id, ref_id, time, discount, total, type
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id, store_id) DO NOTHING
                """, row)

            logging.info("Bills data inserted successfully.")

            # Insert the bills data
            logging.info("Inserting products_flow data...")

            for row in data["products_flow"]:
                cur.execute(
                    """
                    INSERT INTO products_flow (
                        id, store_id, bill_id, product_id,
                        wholesale_price, price, amount
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id, store_id) DO NOTHING
                """, row)

            logging.info("Products_flow data inserted successfully.")

            # Insert the cash_flow data
            logging.info("Inserting cash_flow data...")

            for row in data["cash_flow"]:
                cur.execute(
                    """
                    INSERT INTO cash_flow (
                        id, bill_id, store_id, time, amount, type, description
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id, store_id) DO NOTHING
                """, row)

            logging.info("Cash_flow data inserted successfully.")

            # Update the sync time
            logging.info("Updating the sync time...")

            cur.execute(
                """
                UPDATE syncs
                SET time = %s
                WHERE id = 1
            """, (data["sync_time"], ))

            logging.info("Sync time updated successfully.")

        if data["step"] == 0:
            sync(1, data["sync_time"])

        return {"message": "Sync completed successfully"}

    except Exception as e:
        logging.error("Error: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/send-sync")
def sync(step: int = 0, time_now: str = ""):
    """
    Synchronize the local database with the remote database
    """
    if not time_now:
        time_now = datetime.now().isoformat()
    start_time = datetime.now()
    try:
        with Database(HOST, DATABASE, USER, PASS,
                      real_dict_cursor=False) as cur:
            # Get the latest sync time
            logging.info("Fetching the latest sync time...")
            cur.execute("""
                SELECT time FROM syncs LIMIT 1
            """)
            latest_sync_time = cur.fetchone()
            if latest_sync_time:
                latest_sync_time = latest_sync_time[0]
            else:
                latest_sync_time = "1970-01-01T00:00:00"

            logging.info("Latest sync time: %s", latest_sync_time)

            # Fetch the changes since the last sync
            logging.info("Fetching the changes since the last sync...")

            cur.execute(
                """
                SELECT
                    products_flow.id,
                    products_flow.store_id,
                    products_flow.bill_id,
                    products_flow.product_id,
                    products_flow.wholesale_price,
                    products_flow.price,
                    products_flow.amount
                FROM products_flow
                JOIN bills ON ref_id = bill_id
                WHERE time > %s
                AND products_flow.store_id = %s
            """, (latest_sync_time, STORE_ID))

            products_flow = cur.fetchall()

            logging.info("Fetched %d products_flow records.",
                         len(products_flow))

            cur.execute(
                """
                SELECT
                    id,
                    store_id,
                    ref_id,
                    TO_CHAR(time, 'YYYY-MM-DD HH24:MI:SS.MS') AS time,
                    discount,
                    total,
                    type
                FROM bills
                WHERE time > %s
                AND store_id = %s
                ORDER BY time
            """, (latest_sync_time, STORE_ID))

            bills = cur.fetchall()

            logging.info("Fetched %d bills records.", len(bills))

            cur.execute(
                """
                SELECT
                    id,
                    bill_id,
                    store_id,
                    TO_CHAR(time, 'YYYY-MM-DD HH24:MI:SS.MS') AS time,
                    amount,
                    type,
                    description
                FROM cash_flow
                WHERE bill_id IS NULL
                AND time > %s
                AND store_id = %s
                ORDER BY time
            """, (latest_sync_time, STORE_ID))

            cash_flow = cur.fetchall()

            logging.info("Fetched %d cash_flow records.", len(cash_flow))

            cur.execute(
                """
                SELECT
                    id, name, bar_code, wholesale_price,
                    price, category,
                    TO_CHAR(
                        last_update, 'YYYY-MM-DD HH24:MI:SS.MS'
                    ) AS last_update
                FROM products
                WHERE last_update > %s
            """, (latest_sync_time, ))

            products = cur.fetchall()

            logging.info("Fetched %d products records.", len(products))

            # Send the data to the other store
            logging.info("Sending the data to the other store...")

            response = requests.post(f"{OTHER_STORE}/accept-sync",
                                     json={
                                         "products_flow": products_flow,
                                         "bills": bills,
                                         "cash_flow": cash_flow,
                                         "products": products,
                                         "sync_time": str(time_now),
                                         "step": step
                                     },
                                     timeout=250)

            response.raise_for_status()

            logging.info("Data sent to the other store successfully.")

        logging.info("Sync completed in %s.", datetime.now() - start_time)
        return {"message": "Sync completed successfully"}

    except Exception as e:
        logging.error("Error: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e

from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
import io
from typing import Literal
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
from datetime import datetime
import logging
from dotenv import load_dotenv
from os import getenv
from openpyxl import Workbook
from reset_db import reset_db
import subprocess
import os
from auth import router as auth_router
from settings import router as setting_router

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")
OTHER_STORE = getenv("OTHER_STORE")
SECRET = getenv("SECRET") or ""
ALGORITHM = getenv("ALGORITHM") or ""

# Create the FastAPI application
app = FastAPI()

app.include_router(auth_router)
app.include_router(setting_router)

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


class dbProduct(BaseModel):
    "Define the dbProductFlow model"

    id: int
    name: str
    bar_code: str
    amount: int
    wholesale_price: float
    price: float


class dbBill(BaseModel):
    "Define the dbBill model"

    id: str
    time: str
    discount: float
    total: float
    type: str
    products: list[dbProduct]


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
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.conn.close()


@app.get("/barcode")
def get_bar_code():
    """
    Get the next available bar code
    """
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            "SELECT COALESCE(MAX(CAST(bar_code AS BIGINT)), '100000000000') AS b FROM products"
        )
        return str(int(cur.fetchone()["b"]) + 1)


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
                        FROM products
                        ORDER BY name;
                        """)
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
                    price, stock, category
                )
                VALUES (%s, %s, %s, %s, 0, %s)
                RETURNING *
                """, (product.name, product.bar_code, product.wholesale_price,
                      product.price, product.category))
            return cur.fetchone()
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.put("/products")
def update_product(products: list[Product], store_id: int):
    """
    Update a product in the database

    Args:
        products (list[Product]): The products to update

    Returns:
        Dict: The updated product
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            db_products = []
            db_products_flow = []
            for product in products:
                db_products.append((product.name, product.bar_code,
                                    product.category, product.id))
                db_products_flow.append(
                    (store_id, f"{store_id}_-1", product.id, product.stock,
                     product.wholesale_price, product.price, product.id))

            cur.executemany(
                """
                UPDATE products
                SET
                    name = %s, bar_code = %s,
                    category = %s
                WHERE id = %s
                RETURNING *
                """, db_products)

            cur.executemany(
                """
                INSERT INTO products_flow (
                    store_id, bill_id, product_id,
                    amount, wholesale_price, price
                )
                SELECT %s, %s, %s,
                    %s - products.stock,
                    %s, %s
                FROM products
                WHERE id = %s
                """, db_products_flow)

            return JSONResponse(
                content={"message": "Products updated successfully"})
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
                            'id', products_flow.product_id,
                            'name', products.name,
                            'bar_code', products.bar_code,
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


@app.put("/bill")
def update_bill(bill: dbBill, store_id: int):
    """
    Update a bill in the database

    To update the bill successfully, you MUST follow these steps:
        1. Update the bill total, discount
        2. Set all the old products_flow assosiated with the bill to ref_id {id}_-1
        3. Insert the new products_flow with the "-1" ref_id that reverts the old products_flow
        4. Insert the new products_flow with the correct ref_id

    Args:
        bill (Bill): The bill to update

    Returns:
        Dict: The updated bill
    """
    # minuplate the bill to be able to update it
    # 1. set the total to a negative value in case of return or buy bills
    bill.total = (-bill.total
                  if bill.type in ["buy", "return"] else bill.total)
    # 2. set the amount in the products to a negative value in case of return or buy bills
    products = bill.products
    for product in products:
        product.amount = (-product.amount if bill.type in ["buy", "return"]
                          else product.amount)

    bill_id = bill.id.split("_")[1]

    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE bills
                SET
                    discount = %s,
                    total = %s
                WHERE ref_id = %s
                RETURNING *
                """, (bill.discount, bill.total, bill.id))

            cur.execute(
                """
                UPDATE products_flow
                SET
                    bill_id = %s
                WHERE bill_id = %s
                RETURNING *
                """, (f"{store_id}_-{bill_id}", bill.id))

            values_to_reverse = cur.fetchall()
            values = [(store_id, f"{store_id}_-{bill_id}",
                       product["product_id"], -product["amount"],
                       product["wholesale_price"], product["price"])
                      for product in values_to_reverse]

            values += [
                (store_id, bill.id, product_flow.id, -product_flow.amount,
                 product_flow.wholesale_price, product_flow.price)
                for product_flow in bill.products
            ]

            cur.executemany(
                """
                INSERT INTO products_flow (
                    store_id, bill_id, product_id,
                    amount, wholesale_price, price
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """, values)
            return JSONResponse(
                content={"message": "Bill updated successfully"})
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/bill")
def add_bill(bill: Bill, move_type: Literal["sell", "buy", "BNPL", "return"],
             store_id: int):
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
                (store_id, bill.time, bill.discount, bill_total, move_type))
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=400,
                                    detail="Insert into bills failed")
            bill_id = result["id"]

            # Create a list of tuples
            values = [(store_id, f"{store_id}_{bill_id}", product_flow.id,
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
                    """, (bill_id, store_id))

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
                  description: str, store_id: int):
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
                    store_id,
                    datetime.now().isoformat(),
                    amount,
                    move_type,
                    description,
                ))
            return {"message": "Cash flow record added successfully"}
    except Exception as e:
        print(f"Error: {e}")
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


@app.get("/last-shift")
def last_shift():
    """
    Get the last shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""
                SELECT
                    start_date_time,
                    COALESCE(end_date_time, CURRENT_TIMESTAMP)
                FROM shifts
                ORDER BY start_date_time DESC
                LIMIT 1
                """)
            last_shift = cur.fetchone()
            if not last_shift:
                return {"message": "No last shift"}
            return last_shift
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


def generate_xlsx(data):
    # Create an in-memory output file for the new workbook
    output = io.BytesIO()

    # Create a workbook and select the active worksheet
    wb = Workbook()
    ws = wb.active
    ws.title = "Inventory"

    # Column titles in Arabic
    ws.append(
        ["اسم المنتج", "الكمية بالمخزن", "سعر الشراء", "اجمالى قيمة المنتج"])

    total = 0
    for row in data:
        ws.append([
            row['name'], row['stock'], row['wholesale_price'],
            row['total_value']
        ])
        total += row['total_value']

    ws.append(["الاجمالى", "", "", total])

    # Save the workbook to the in-memory file
    wb.save(output)
    output.seek(0)

    return output


@app.get("/inventory")
async def inventory():
    """
    Get the products in the inventory and their total value
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""
                SELECT
                    name,
                    stock,
                    wholesale_price,
                    stock * wholesale_price AS total_value
                FROM products
                """)
            # make an .xlsx file and return it
            data = cur.fetchall()

            output = generate_xlsx(data)

            return StreamingResponse(
                output,
                media_type=
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": "attachment;filename=inv.xlsx"
                })

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/shifts-analytics")
def shifts_analytics(
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        bills_type: Optional[list[str]] = ["sell", "return"]) -> JSONResponse:
    """
    Get the total sales for each shift

    Args:
        start_date (Optional[str]): The start date of the shifts
        end_date (Optional[str]): The end date of the shifts

    Returns:
        JSONResponse: The total sales for each shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    start_date_time,
                    end_date_time,
                    (
                        SELECT COALESCE(SUM(total), 0)
                        FROM bills
                        WHERE time >= start_date_time
                        AND time <= COALESCE(end_date_time, CURRENT_TIMESTAMP)
                        AND type IN %s
                    ) AS total
                FROM shifts
                WHERE start_date_time >= %s
                AND start_date_time <= %s
                AND current = False
                ORDER BY start_date_time
                """, (tuple(bills_type), start_date, end_date))
            data = [{
                "start_date_time": str(row["start_date_time"]),
                "end_date_time": str(row["end_date_time"]),
                "total": row["total"]
            } for row in cur.fetchall()]
            return JSONResponse(content=data)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/backup")
async def backup():
    """
    Backs up everything in the database as a save point to restore later
    """
    try:
        # Create a .sql file to store the backup
        with open("backup.sql", "wb") as f:
            os.environ["PGPASSWORD"] = PASS
            subprocess.run(["pg_dump", "-h", HOST, "-U", USER, "-d", DATABASE],
                           stdout=f)

        # Return the file
        return StreamingResponse(
            open("backup.sql", "rb"),
            media_type="application/octet-stream",
            headers={"Content-Disposition": "attachment;filename=backup.sql"})

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/restore")
async def restore(file: UploadFile = File(...)):
    """
    Restores the database to a previous save point
    """
    try:
        reset_db()
        fileBytes = await file.read()
        with open("restore.sql", "wb") as f:
            f.write(fileBytes)

        # Restore the database
        os.environ["PGPASSWORD"] = PASS
        with open("restore.sql", "r") as f:
            subprocess.run(["psql", "-h", HOST, "-U", USER, "-d", DATABASE],
                           stdin=f)

        return {"message": "Database restored successfully"}

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

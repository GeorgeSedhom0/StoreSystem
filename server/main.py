from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
import io
from typing import Literal, Any
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
from parties import router as party_router
from installment import router as installment_router
from analytics import router as analytics_router
from employee import router as employee_router

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")
SECRET = getenv("SECRET") or ""
ALGORITHM = getenv("ALGORITHM") or ""

# Create the FastAPI application
app = FastAPI()

app.include_router(auth_router)
app.include_router(setting_router)
app.include_router(party_router)
app.include_router(installment_router)
app.include_router(analytics_router)
app.include_router(employee_router)

origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:5173",
    "https://localhost",
    "https://localhost:3000",
    "https://localhost:8000",
    "https://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


class Product(BaseModel):
    "Define the Product model"

    id: Optional[int] = None
    name: str
    bar_code: str
    wholesale_price: float
    price: float
    category: str
    stock: Optional[int] = None

    def dict(self, *args, **kwargs):
        data = super().dict(*args, **kwargs)
        data["wholesale_price"] = f"{self.wholesale_price:.2f}"
        data["price"] = f"{self.price:.2f}"
        return data


class ProductFlow(BaseModel):
    "Define the ProductFlow model"

    id: int
    quantity: int
    price: float
    wholesale_price: float

    def dict(self, *args, **kwargs):
        data = super().dict(*args, **kwargs)
        data["price"] = f"{self.price:.2f}"
        data["wholesale_price"] = f"{self.wholesale_price:.2f}"
        return data


class Bill(BaseModel):
    "Define the Bill model"

    time: str
    discount: float
    total: float
    products_flow: list[ProductFlow]

    def dict(self, *args, **kwargs):
        data = super().dict(*args, **kwargs)
        data["discount"] = f"{self.discount:.2f}"
        data["total"] = f"{self.total:.2f}"
        return data


class dbProduct(BaseModel):
    "Define the dbProductFlow model"

    id: int
    name: str
    bar_code: str
    amount: int
    wholesale_price: float
    price: float

    def dict(self, *args, **kwargs):
        data = super().dict(*args, **kwargs)
        data["wholesale_price"] = f"{self.wholesale_price:.2f}"
        data["price"] = f"{self.price:.2f}"
        return data


class dbBill(BaseModel):
    "Define the dbBill model"

    id: int
    time: str
    discount: float
    total: float
    type: str
    products: list[dbProduct]

    def dict(self, *args, **kwargs):
        data = super().dict(*args, **kwargs)
        data["discount"] = f"{self.discount:.2f}"
        data["total"] = f"{self.total:.2f}"
        return data


class Database:
    "Database context manager to handle the connection and cursor"

    def __init__(self, host, database, user, password, real_dict_cursor=True):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor
        self.conn = psycopg2.connect(
            host=self.host,
            database=self.database,
            user=self.user,
            password=self.password,
        )
        self.cursor = self.conn.cursor(
            cursor_factory=RealDictCursor if self.real_dict_cursor else None
        )

    def __enter__(self):
        return self.cursor

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.cursor.close()
        self.conn.close()


@app.get("/test")
def test():
    return "Hello, World!"


@app.get("/barcode")
def get_bar_code():
    """
    Get the first available barcode where the number right after it is available.
    """
    with Database(HOST, DATABASE, USER, PASS) as cur:
        # Find the first gap in the existing barcodes.
        cur.execute("""
            WITH OrderedBarcodes AS (
                SELECT bar_code, CAST(bar_code AS BIGINT) AS numeric_barcode
                FROM products
                WHERE bar_code ~ '^[0-9]+$'
                ORDER BY numeric_barcode ASC
            ), Gaps AS (
                SELECT numeric_barcode + 1 AS gap_start
                FROM OrderedBarcodes
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM OrderedBarcodes ob2
                    WHERE ob2.numeric_barcode = OrderedBarcodes.numeric_barcode + 1
                )
                AND numeric_barcode + 1 <= 999999999999 -- Assuming a maximum barcode value
            )
            SELECT MIN(gap_start) AS first_available_barcode
            FROM Gaps
            """)
        result = cur.fetchone()
        first_available_barcode = result["first_available_barcode"]
        if first_available_barcode is None:
            # If no gaps were found, find the maximum barcode and add 1.
            cur.execute("""
                SELECT COALESCE(MAX(CAST(bar_code AS BIGINT)), 100000000000) + 1 AS first_available_barcode
                FROM products
                WHERE bar_code ~ '^[0-9]+$'
                """)
            first_available_barcode = cur.fetchone()["first_available_barcode"]

        return str(first_available_barcode)


@app.get("/products")
def get_products(
    store_id: int,
    is_deleted: Optional[bool] = False,
):
    """
    Get all products from the database for a specific store

    Args:
        is_deleted (bool): Whether to include deleted products
        store_id (int): The store ID to get products for

    Returns:
        List[Dict]: A list of dictionaries containing the products
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get products with inventory for the specific store
            cur.execute(
                """SELECT
                    p.id, p.name, p.bar_code, p.wholesale_price,
                    p.price, pi.stock, p.category
                FROM products p
                JOIN product_inventory pi ON p.id = pi.product_id
                WHERE pi.is_deleted = %s
                AND pi.store_id = %s
                ORDER BY p.name;
                """,
                (is_deleted, store_id),
            )
            products = cur.fetchall()

            # Get reserved products for the specific store
            cur.execute(
                """
                SELECT
                    p.id,
                    p.name,
                    p.bar_code,
                    SUM(rp.amount) AS stock,
                    p.wholesale_price,
                    p.price,
                    p.category
                FROM reserved_products rp
                JOIN products p ON rp.product_id = p.id
                WHERE rp.store_id = %s
                GROUP BY p.id, p.name, p.bar_code,
                    p.wholesale_price, p.price, p.category
                """,
                (store_id,),
            )

            reserved_products = cur.fetchall()
            reserved_products = {
                product["id"]: product for product in reserved_products
            }

        return JSONResponse(
            content={"products": products, "reserved_products": reserved_products}
        )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/admin/products")
def get_products_as_admin():
    """
    Get all products from the database for all stores as admin

    Returns:
        List[Dict]: A dictionary containing products with their stocks across all stores
                    and any reserved products
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get products with inventory for all stores
            cur.execute(
                """WITH all_stores AS (
                SELECT id, name FROM store_data
                ),
                product_stocks AS (
                    SELECT 
                        p.id,
                        p.name,
                        p.bar_code,
                        p.wholesale_price,
                        p.price,
                        p.category,
                        jsonb_object_agg(
                            CASE 
                                WHEN s.name IS NOT NULL AND s.name != '' THEN s.name 
                                ELSE s.id::text 
                            END, 
                            COALESCE(pi.stock, 0)
                        ) AS stock_by_store
                    FROM products p
                    CROSS JOIN all_stores s
                    LEFT JOIN product_inventory pi ON p.id = pi.product_id AND s.id = pi.store_id
                    GROUP BY p.id, p.name, p.bar_code, p.wholesale_price, p.price, p.category
                )
                SELECT * FROM product_stocks
                ORDER BY name;
                """
            )
            products = cur.fetchall()

            # Get reserved products across all stores with store names
            cur.execute(
                """
                SELECT
                    rp.product_id,
                    rp.store_id,
                    sd.name AS store_name,
                    rp.amount
                FROM reserved_products rp
                JOIN store_data sd ON rp.store_id = sd.id
                """
            )

            reserved_products_raw = cur.fetchall()

            # Create a structure where reserved_products is {product_id: {store_key: amount}}
            reserved_products = {}
            for record in reserved_products_raw:
                product_id = record["product_id"]
                store_id = record["store_id"]
                store_name = record["store_name"]
                amount = record["amount"]

                # Use store name if available, otherwise use store_id as string
                store_key = (
                    store_name if store_name and store_name != "" else str(store_id)
                )

                if product_id not in reserved_products:
                    reserved_products[product_id] = {}

                reserved_products[product_id][store_key] = amount

        return JSONResponse(
            content={"products": products, "reserved_products": reserved_products}
        )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/product")
def add_product(product: Product, store_id: int):
    """
    Add a product to the database

    Args:
        product (Product): The product to add
        store_id (int): The store ID to add the product to

    Returns:
        Dict: The product added to the database
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # First add to the central products table
            cur.execute(
                """
                INSERT INTO products (
                    name, bar_code, wholesale_price,
                    price, category
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    product.name,
                    product.bar_code,
                    product.wholesale_price,
                    product.price,
                    product.category,
                ),
            )

            result = cur.fetchone()
            return result
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.put("/products")
def update_product(products: list[Product], store_id: int):
    """
    Update products in the database

    Args:
        products (list[Product]): The products to update
        store_id (int): The store ID for the products

    Returns:
        Dict: A message indicating successful update
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            for product in products:
                # Update product basic information in the central products table
                cur.execute(
                    """
                    UPDATE products
                    SET
                        name = %s,
                        bar_code = %s,
                        wholesale_price = %s,
                        price = %s,
                        category = %s
                    WHERE id = %s
                    """,
                    (
                        product.name,
                        product.bar_code,
                        product.wholesale_price,
                        product.price,
                        product.category,
                        product.id,
                    ),
                )

                # If stock is provided, update the store-specific inventory
                if product.stock is not None:
                    # First, check if an inventory entry exists for this product in this store
                    cur.execute(
                        """
                        SELECT stock FROM product_inventory
                        WHERE product_id = %s AND store_id = %s
                        """,
                        (product.id, store_id),
                    )
                    inventory = cur.fetchone()

                    if inventory:
                        current_stock = inventory["stock"]
                        # Calculate stock difference
                        stock_difference = product.stock - current_stock

                        if stock_difference != 0:
                            # Create a products_flow entry to update stock
                            # Using special bill_id with store_id prefix to indicate inventory adjustment
                            cur.execute(
                                """
                                INSERT INTO products_flow (
                                    store_id, bill_id, product_id,
                                    amount, wholesale_price, price
                                )
                                VALUES (%s, %s, %s, %s, %s, %s)
                                """,
                                (
                                    store_id,
                                    -1,
                                    product.id,
                                    stock_difference,
                                    product.wholesale_price,
                                    product.price,
                                ),
                            )
                    else:
                        # If no inventory entry exists, create one
                        cur.execute(
                            """
                            INSERT INTO product_inventory (
                                store_id, product_id, stock, is_deleted
                            )
                            VALUES (%s, %s, %s, %s)
                            """,
                            (
                                store_id,
                                product.id,
                                product.stock,
                                False,
                            ),
                        )

            return JSONResponse(content={"message": "Products updated successfully"})
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.put("/product/delete")
def delete_product(product_id: int, store_id: int):
    """
    Mark a product as deleted in a specific store

    Args:
        product_id (int): The ID of the product to mark as deleted
        store_id (int): The store ID where the product should be marked as deleted

    Returns:
        Dict: A message indicating the result of the operation
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE product_inventory
                SET is_deleted = TRUE
                WHERE product_id = %s AND store_id = %s
                """,
                (product_id, store_id),
            )
            return JSONResponse(
                content={
                    "message": "Product marked as deleted successfully in this store"
                }
            )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.put("/product/restore")
def restore_product(product_id: int, store_id: int):
    """
    Restore a product that was marked as deleted in a specific store

    Args:
        product_id (int): The ID of the product to restore
        store_id (int): The store ID where the product should be restored

    Returns:
        Dict: A message indicating the result of the operation
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE product_inventory
                SET is_deleted = FALSE
                WHERE product_id = %s AND store_id = %s
                """,
                (product_id, store_id),
            )
            return JSONResponse(
                content={"message": "Product restored successfully in this store"}
            )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/bills")
def get_bills(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    party_id: Optional[int] = None,
):
    """
    Get all bills from the database

    Returns:
        List[Dict]: A list of dictionaries containing the bills

    """
    extra_condition = ""
    params: tuple = (
        start_date if start_date else "1970-01-01",
        end_date if end_date else datetime.now().isoformat(),
        store_id,
    )
    if party_id:
        extra_condition = "AND party_id = %s"
        params = (
            start_date if start_date else "1970-01-01",
            end_date if end_date else datetime.now().isoformat(),
            party_id,
            store_id,
        )
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                f"""SELECT
                    bills.id,
                    bills.time,
                    bills.discount,
                    bills.total,
                    bills.type,
                    assosiated_parties.name AS party_name,
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
                JOIN products_flow ON bills.id = products_flow.bill_id
                JOIN products ON products_flow.product_id = products.id
                LEFT JOIN assosiated_parties ON bills.party_id = assosiated_parties.id
                WHERE bills.time >= %s
                AND bills.time <= %s
                {extra_condition}
                AND bills.store_id = %s
                GROUP BY bills.id, bills.time, bills.discount,
                    bills.total, bills.type, bills.party_id, assosiated_parties.name
                ORDER BY bills.time DESC
                    """,
                params,
            )
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
        2. Insert a bill with id -(the original id) to revert the old bill
        3. Set all the old products_flow associated with the bill to id to -(the original id)
        3. Insert the new products_flow with the -(the original id) that reverts the old products_flow
        4. Insert the new products_flow with the correct original id

    Args:
        bill (Bill): The bill to update

    Returns:
        Dict: The updated bill
    """
    # manipulate the bill to be able to update it
    # 1. set the total to a negative value in case of return or buy bills
    bill.total = -bill.total if bill.type in ["buy", "return"] else bill.total
    # 2. set the amount in the products to a negative value in case of return or buy bills
    products = bill.products
    for product in products:
        product.amount = (
            -product.amount if bill.type in ["buy", "return"] else product.amount
        )

    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Update the bill details
            cur.execute(
                """
                UPDATE bills
                SET
                    discount = %s,
                    total = %s
                WHERE id = %s
                RETURNING *
                """,
                (bill.discount, bill.total, bill.id),
            )
            negative_bill_id = f"-{bill.id}"

            cur.execute(
                """
                INSERT INTO bills (id, store_id)
                VALUES (%s, %s)
                """,
                (negative_bill_id, store_id),
            )

            # Get the products_flow entries associated with this bill
            cur.execute(
                """
                SELECT * FROM products_flow
                WHERE bill_id = %s
                """,
                (bill.id,),
            )
            old_products_flow = cur.fetchall()

            # Create a negative bill ID for reversal entries

            # Update the old products_flow entries to use
            #  the negative bill ID
            cur.execute(
                """
                UPDATE products_flow
                SET bill_id = %s
                WHERE bill_id = %s
                RETURNING *
                """,
                (negative_bill_id, bill.id),
            )

            # Create reversal entries for the old products
            values: Any = [
                (
                    store_id,
                    negative_bill_id,
                    product["product_id"],
                    -product["amount"],
                    product["wholesale_price"],
                    product["price"],
                )
                for product in old_products_flow
            ]

            # Create entries for the new products
            values += [
                (
                    store_id,
                    bill.id,
                    product_flow.id,
                    product_flow.amount,
                    product_flow.wholesale_price,
                    product_flow.price,
                )
                for product_flow in bill.products
            ]

            # Insert all product flow entries
            cur.executemany(
                """
                INSERT INTO products_flow (
                    store_id, bill_id, product_id,
                    amount, wholesale_price, price
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                values,
            )
            return JSONResponse(content={"message": "Bill updated successfully"})
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/bill")
def add_bill(
    bill: Bill,
    move_type: Literal[
        "sell", "buy", "BNPL", "return", "reserve", "installment", "buy-return"
    ],
    store_id: int,
    party_id: Optional[int] = None,
    paid: Optional[float] = None,
    installments: Optional[int] = None,
    installment_interval: Optional[int] = None,
):
    """
    Add a bill to the database

    Args:
        bill (Bill): The bill to add
        move_type (Literal["sell", "buy", "BNPL", "return",
                        "reserve", "installment", "buy-return"]): The type of the bill
        store_id (int): The store ID
        party_id (Optional[int]): The party ID
        paid (Optional[float]): The amount paid
        installments (Optional[int]): The number of installments
        installment_interval (Optional[int]): The interval between installments

    Returns:
        Dict: A message indicating the result of the operation
    """
    bill_total = (
        bill.total
        if move_type in ["buy-return", "sell", "reserve"]
        else -bill.total
        if move_type in ["buy", "return"]
        else 0
    )
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO bills (store_id, time, discount, total, type, party_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    store_id,
                    bill.time,
                    bill.discount,
                    bill_total,
                    move_type,
                    party_id,
                ),
            )
            result = cur.fetchone()
            if not result:
                raise HTTPException(status_code=400, detail="Insert into bills failed")
            bill_id = result["id"]

            # Create a list of tuples
            values = [
                (
                    store_id,
                    bill_id,
                    product_flow.id,
                    -product_flow.quantity
                    if move_type
                    in ["sell", "BNPL", "installment", "reserve", "buy-return"]
                    else product_flow.quantity,
                    product_flow.wholesale_price,
                    product_flow.price,
                )
                for product_flow in bill.products_flow
            ]

            cur.executemany(
                """
                INSERT INTO products_flow (
                    store_id, bill_id, product_id,
                    amount, wholesale_price, price
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                values,
            )

            if cur.rowcount != len(values):
                raise HTTPException(
                    status_code=400, detail="Insert into products_flow failed"
                )

            if move_type == "reserve":
                cur.executemany(
                    """
                    INSERT INTO reserved_products (product_id, amount, store_id)
                    VALUES (%s, %s, %s)
                    """,
                    [
                        (product_flow.id, product_flow.quantity, store_id)
                        for product_flow in bill.products_flow
                    ],
                )

            if move_type == "installment":
                cur.execute(
                    """
                    INSERT INTO installments (bill_id, store_id, paid, installments_count, installment_interval)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (bill_id, store_id, paid, installments, installment_interval),
                )

            # get the inserted bill to return it
            cur.execute(
                """
                SELECT
                    bills.id,
                    bills.time,
                    bills.discount,
                    bills.total,
                    bills.type,
                    assosiated_parties.name AS party_name,
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
                JOIN products_flow ON bills.id = products_flow.bill_id
                JOIN products ON products_flow.product_id = products.id
                LEFT JOIN assosiated_parties ON bills.party_id = assosiated_parties.id
                WHERE bills.id = %s
                GROUP BY bills.id, bills.time, bills.discount,
                    bills.total, bills.type, bills.party_id, assosiated_parties.name
                """,
                (bill_id,),
            )

            bill = cur.fetchone()

        return {"message": "Bill added successfully", "bill": bill}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/admin/move-products")
def move_products(
    bill: Bill,
    source_store_id: int,
    destination_store_id: int,
):
    """
    Move products from one store to another by
    1. Adding a new "sell" bill to the source store with destination store as party
    2. Adding a new "buy" bill to the destination store with source store as party

    Args:
        bill (Bill): The bill to move products
        source_store_id (int): The source store ID
        destination_store_id (int): The destination store ID

    Returns:
        Dict: A message indicating the result of the operation
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get the associated party ID for destination store
            cur.execute(
                """
                SELECT id FROM assosiated_parties 
                WHERE extra_info->>'store_id' = %s
                """,
                (str(destination_store_id),),
            )
            destination_party = cur.fetchone()
            destination_party_id = (
                destination_party["id"] if destination_party else None
            )

            # Get the associated party ID for source store
            cur.execute(
                """
                SELECT id FROM assosiated_parties 
                WHERE extra_info->>'store_id' = %s
                """,
                (str(source_store_id),),
            )
            source_party = cur.fetchone()
            source_party_id = source_party["id"] if source_party else None

        # Add sell bill to source store (with destination store as party)
        add_bill(
            Bill(
                time=bill.time,
                discount=bill.discount,
                total=bill.total,
                products_flow=[
                    ProductFlow(
                        id=product_flow.id,
                        quantity=product_flow.quantity,
                        price=product_flow.wholesale_price,
                        wholesale_price=product_flow.wholesale_price,
                    )
                    for product_flow in bill.products_flow
                ],
            ),
            "sell",
            source_store_id,
            destination_party_id,  # Use destination store's associated party ID
        )

        # Add buy bill to destination store (with source store as party)
        add_bill(
            bill,
            "buy",
            destination_store_id,
            source_party_id,  # Use source store's associated party ID
        )

        return {"message": "Products moved successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/end-reservation")
def end_reservation(bill_id: str, store_id: int):
    """
    End a reservation for all products in a reservation bill
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT product_id, amount
                FROM products_flow
                WHERE bill_id = %s
                AND store_id = %s
                """,
                (bill_id, store_id),
            )
            products = cur.fetchall()

            cur.execute(
                """
                UPDATE bills
                SET type = 'sell'
                WHERE id = %s
                AND store_id = %s
                """,
                (bill_id, store_id),
            )

            cur.executemany(
                """
                DELETE FROM reserved_products
                WHERE id IN (
                    SELECT id
                    FROM reserved_products
                    WHERE product_id = %s
                    AND amount = %s
                    AND store_id = %s
                    LIMIT 1
                )
                """,
                [
                    (product["product_id"], product["amount"] * -1, store_id)
                    for product in products
                ],
            )

            return {"message": "Reservation ended successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/complete-bnpl-payment")
def complete_bnpl_payment(bill_id: str, store_id: int):
    """
    Complete payment for a BNPL (Buy Now Pay Later) bill by changing it to a regular sell bill
    and updating the bill total to reflect the actual payment received.
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # First, check if the bill is actually a BNPL bill
            cur.execute(
                """
                SELECT discount FROM bills
                WHERE id = %s
                AND store_id = %s
                AND type = 'BNPL'
                """,
                (bill_id, store_id),
            )
            bill_discount = cur.fetchone()["discount"]

            if not bill_discount:
                raise HTTPException(status_code=404, detail="BNPL bill not found")

            # Get the corrected total from the products_flow
            cur.execute(
                """
                SELECT SUM(amount * price) AS total
                FROM products_flow
                WHERE bill_id = %s
                AND store_id = %s
                """,
                (bill_id, store_id),
            )

            corrected_total = cur.fetchone()["total"]

            # Update the bill type to 'sell' to indicate payment received
            cur.execute(
                """
                UPDATE bills
                SET
                    type = 'sell',
                    total = %s
                WHERE id = %s
                AND store_id = %s
                """,
                (abs(corrected_total - bill_discount), bill_id, store_id),
            )

            return {"message": "BNPL payment completed successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/cash-flow")
def get_cash_flow(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    party_id: Optional[int] = None,
) -> JSONResponse:
    """
    Get all cash flow records from the database

    Returns:
        List[Dict]: A list of dictionaries containing the cash flow records

    """

    extra_condition = ""
    params: tuple = (
        start_date if start_date else "1970-01-01",
        end_date if end_date else datetime.now().isoformat(),
        store_id,
    )
    if party_id:
        extra_condition = "AND party_id = %s"
        params = (
            start_date if start_date else "1970-01-01",
            end_date if end_date else datetime.now().isoformat(),
            party_id,
            store_id,
        )

    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                f"""SELECT
                    TO_CHAR(time, 'YYYY-MM-DD HH24:MI:SS') AS time,
                    amount,
                    cash_flow.type,
                    description,
                    total,
                    assosiated_parties.name AS party_name
                FROM cash_flow
                LEFT JOIN assosiated_parties ON cash_flow.party_id = assosiated_parties.id
                WHERE time >= %s
                AND time <= %s
                AND store_id = %s
                {extra_condition}
                ORDER BY cash_flow.time DESC
                """,
                params,
            )
            cash_flow = cur.fetchall()
            return JSONResponse(content=cash_flow, status_code=200)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/cash-flow")
def add_cash_flow(
    amount: float,
    move_type: Literal["in", "out"],
    description: str,
    store_id: int,
    party_id: Optional[int] = None,
):
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
                    store_id, time, amount, type, description, party_id
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    store_id,
                    datetime.now().isoformat(),
                    move_type == "in" and amount or -amount,
                    move_type,
                    description,
                    party_id,
                ),
            )
            return {"message": "Cash flow record added successfully"}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/current-shift")
def current_shift(
    store_id: int,
):
    """
    Get the current shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT start_date_time FROM shifts
                WHERE current = True AND store_id = %s
                """,
                (store_id,),
            )
            current_shift = cur.fetchone()
            if not current_shift:
                return {"message": "No current shift"}
            return current_shift
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/last-shift")
def last_shift(
    store_id: int,
):
    """
    Get the last shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    start_date_time,
                    COALESCE(end_date_time, CURRENT_TIMESTAMP)
                FROM shifts
                WHERE store_id = %s
                ORDER BY start_date_time DESC
                LIMIT 1
                """,
                (store_id,),
            )
            last_shift = cur.fetchone()
            if not last_shift:
                return {"message": "No last shift"}
            return last_shift
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/shift-total")
def shift_total(
    store_id: int,
):
    """
    Get the total sales for the current shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT type, COALESCE(SUM(total), 0) AS total
                FROM bills
                WHERE time >= (
                    SELECT start_date_time FROM shifts
                    WHERE current = True AND store_id = %s
                )
                AND bills.store_id = %s
                GROUP BY type
                """,
                (store_id, store_id),
            )
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
    ws.append(["اسم المنتج", "الكمية بالمخزن", "سعر الشراء", "اجمالى قيمة المنتج"])

    total = 0
    for row in data:
        ws.append(
            [row["name"], row["stock"], row["wholesale_price"], row["total_value"]]
        )
        total += row["total_value"]

    ws.append(["الاجمالى", "", "", total])

    # Save the workbook to the in-memory file
    wb.save(output)
    output.seek(0)

    return output


@app.get("/inventory")
async def inventory(store_id: int):
    """
    Get the products in the inventory and their total value for a specific store

    Args:
        store_id (int): The store ID to get inventory for

    Returns:
        StreamingResponse: Excel file with inventory data
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    p.name,
                    pi.stock,
                    p.wholesale_price,
                    pi.stock * p.wholesale_price AS total_value
                FROM products p
                JOIN product_inventory pi ON p.id = pi.product_id
                WHERE pi.store_id = %s AND pi.is_deleted = FALSE
                """,
                (store_id,),
            )
            # make an .xlsx file and return it
            data = cur.fetchall()

            output = generate_xlsx(data)

            return StreamingResponse(
                output,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment;filename=inventory.xlsx"},
            )

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


def generate_xlsx_admin(data, store_names):
    # Create an in-memory output file for the new workbook
    output = io.BytesIO()

    # Create a workbook and select the active worksheet
    wb = Workbook()
    ws = wb.active
    ws.title = "Inventory"

    # Create headers with store names
    headers = ["اسم المنتج", "الباركود", "سعر الشراء", "سعر البيع", "القسم"]
    for store_name in store_names:
        headers.append(f"كمية {store_name}")
    headers.append("الكمية الإجمالية")
    headers.append("إجمالي القيمة")

    ws.append(headers)

    # Calculate store totals and grand total
    store_totals = {store_name: 0 for store_name in store_names}
    grand_total = 0

    for row in data:
        # Prepare row data
        row_data = [
            row["name"],
            row["bar_code"],
            row["wholesale_price"],
            row["price"],
            row["category"],
        ]

        # Add quantities for each store
        total_qty = 0
        for store_name in store_names:
            qty = row["stock_by_store"].get(store_name, 0)
            total_qty += qty
            row_data.append(qty)

        # Add total quantity and value
        row_data.append(total_qty)
        total_value = total_qty * float(row["wholesale_price"])
        row_data.append(total_value)

        # Update totals
        for i, store_name in enumerate(store_names):
            store_totals[store_name] += row["stock_by_store"].get(
                store_name, 0
            ) * float(row["wholesale_price"])
        grand_total += total_value

        ws.append(row_data)

    # Add totals row
    total_row = ["الإجمالي", "", "", "", ""]
    for store_name in store_names:
        total_row.append("")
    total_row.append("")
    total_row.append(grand_total)
    ws.append(total_row)

    # Add store subtotals
    for store_name, total in store_totals.items():
        subtotal_row = [f"إجمالي {store_name}", "", "", "", ""]
        for _ in range(len(store_names)):
            subtotal_row.append("")
        subtotal_row.append("")
        subtotal_row.append(total)
        ws.append(subtotal_row)

    # Save the workbook to the in-memory file
    wb.save(output)
    output.seek(0)

    return output


@app.get("/admin/inventory")
async def inventory_as_admin():
    """
    Get the products in the inventory and their total value for all stores with totals separately and combined

    Returns:
        StreamingResponse: Excel file with inventory data
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get all store names
            cur.execute(
                """
                SELECT id, name FROM store_data
                ORDER BY id
                """
            )
            stores = cur.fetchall()
            store_names = [
                store["name"]
                if store["name"] and store["name"] != ""
                else str(store["id"])
                for store in stores
            ]

            # Get all products with their stock by store
            cur.execute(
                """
                WITH all_stores AS (
                SELECT id, name FROM store_data
                ),
                product_stocks AS (
                    SELECT 
                        p.id,
                        p.name,
                        p.bar_code,
                        p.wholesale_price,
                        p.price,
                        p.category,
                        jsonb_object_agg(
                            CASE 
                                WHEN s.name IS NOT NULL AND s.name != '' THEN s.name 
                                ELSE s.id::text 
                            END, 
                            COALESCE(pi.stock, 0)
                        ) AS stock_by_store
                    FROM products p
                    CROSS JOIN all_stores s
                    LEFT JOIN product_inventory pi ON p.id = pi.product_id AND s.id = pi.store_id AND pi.is_deleted = FALSE
                    GROUP BY p.id, p.name, p.bar_code, p.wholesale_price, p.price, p.category
                )
                SELECT * FROM product_stocks
                ORDER BY name
                """
            )

            data = cur.fetchall()
            output = generate_xlsx_admin(data, store_names)

            return StreamingResponse(
                output,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment;filename=inventory.xlsx"},
            )

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/shifts-analytics")
def shifts_analytics(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    bills_type: list[str] = ["sell", "return"],
) -> JSONResponse:
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
                AND store_id = %s
                AND current = False
                ORDER BY start_date_time
                """,
                (tuple(bills_type), start_date, end_date, store_id),
            )
            data = [
                {
                    "start_date_time": str(row["start_date_time"]),
                    "end_date_time": str(row["end_date_time"]),
                    "total": row["total"],
                }
                for row in cur.fetchall()
            ]
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
            subprocess.run(
                ["pg_dump", "-h", HOST, "-U", USER, "-d", DATABASE], stdout=f
            )

        # Return the file
        return StreamingResponse(
            open("backup.sql", "rb"),
            media_type="application/octet-stream",
            headers={"Content-Disposition": "attachment;filename=backup.sql"},
        )

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

        assert PASS, "No password provided"
        assert HOST, "No host provided"
        assert USER, "No user provided"
        assert DATABASE, "No database provided"

        # Restore the database
        os.environ["PGPASSWORD"] = PASS
        with open("restore.sql", "r") as f:
            subprocess.run(["psql", "-h", HOST, "-U", USER, "-d", DATABASE], stdin=f)

        return {"message": "Database restored successfully"}

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

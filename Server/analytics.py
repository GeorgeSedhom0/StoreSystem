import bcrypt
from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import Cookie, Form, Depends
from pydantic import BaseModel
from datetime import datetime
import logging
from dotenv import load_dotenv
from os import getenv
from fastapi import APIRouter
from typing import Optional
import json

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
router = APIRouter()

origins = [
    "http://localhost:5173",
]

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s [%(levelname)s] - %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')


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


@router.get("/analytics/top-products")
def top_products(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    "Get the daily selling series of the top 5 products"
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            cursor.execute("""
                SELECT products.id
                FROM products_flow JOIN products ON products_flow.product_id = products.id
                JOIN bills ON products_flow.bill_id = bills.ref_id
                WHERE bills.time > %s AND bills.time <= %s
                AND amount < 0
                GROUP BY products.id
                ORDER BY SUM(amount) ASC
                LIMIT 5
            """, (start_date, end_date))

            products = cursor.fetchall()
            if not products:
                return JSONResponse(content={"message": "No data found"}, status_code=404)
            products = [product["id"] for product in products]

            cursor.execute("""
                SELECT products.name, DATE_TRUNC('day', bills.time) AS day, SUM(amount) * -1 AS total
                FROM products_flow JOIN products ON products_flow.product_id = products.id
                JOIN bills ON products_flow.bill_id = bills.ref_id
                WHERE products.id IN %s
                AND amount < 0
                AND bills.time > %s AND bills.time <= %s
                GROUP BY products.name, day
                ORDER BY day, total ASC
            """, (tuple(products), start_date, end_date))

            data = cursor.fetchall()
            ret = {}
            for row in data:
                if row["name"] not in ret:
                    ret[row["name"]] = [[row["day"], row["total"]]]
                else:
                    ret[row["name"]].append([row["day"], row["total"]])
            return ret

    except psycopg2.Error as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail="Database error")
    
            
                       
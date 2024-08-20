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
import pandas as pd
from datetime import timedelta
import random
import math

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
            cursor.execute(
                """
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
                return JSONResponse(content={"message": "No data found"},
                                    status_code=404)
            products = [product["id"] for product in products]

            cursor.execute(
                """
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


def calculate_days_left(row, selling_days):
    stock = row['stock']
    for i, day in enumerate(selling_days):
        if day in row['days_mean']:
            stock -= row['days_mean'][day]
            if stock <= 0:
                return i
    return len(selling_days)


@router.get("/analytics/alerts")
def alerts():
    """Get the alerts for the products that are running low in stock"""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            # First get the selling entries for the last 30 days
            cursor.execute("""
                SELECT product_id, amount * -1 as amount, time
                FROM products_flow JOIN bills ON products_flow.bill_id = bills.ref_id
                WHERE time > (NOW() - INTERVAL '45 days')
                AND amount < 0
            """)
            selling = cursor.fetchall()

            # Then get the current stock for each product
            cursor.execute("""
                SELECT id, name, stock
                FROM products
            """)
            products = cursor.fetchall()
            # Initialize the dataframes
        selling = pd.DataFrame(selling)
        products = pd.DataFrame(products)

        # Converting the time to date wihtout the time for grouping
        selling["time"] = selling["time"].dt.date

        # Grouping the data by product and day of the week
        selling = selling.groupby(["product_id", "time"]).sum().reset_index()

        # Converting the time to date to group by day of the week
        selling["time"] = pd.to_datetime(selling["time"]).dt.dayofweek
        
        # Calculating the mean and standard deviation for each product
        selling["mean"] = selling.groupby(["product_id", "time"])["amount"].transform(
            "mean")
        selling["std"] = selling.groupby(["product_id", "time"])["amount"].transform(
            "std")

        # Calculating the z-score for each entry
        selling["z"] = (selling["amount"] - selling["mean"]) / selling["std"]

        # If the z-score is above 3, then it's an outlier
        selling = selling[selling["z"] < 3]

        # Drop the columns that are not needed
        selling.drop(columns=["std", "z", "amount"], inplace=True)

        # Merging the products and the selling data
        data = pd.merge(products, selling, left_on="id", right_on="product_id")

        # Aggregating the means with their respective days
        data = data.groupby("id").agg({
            "mean": list,
            "time": list,
            "name": "first",
            "stock": "first"
        })

        # Create a dictionary where 'time' is the key and 'mean' is the value for each group
        data['days_mean'] = data.apply(
            lambda row: dict(zip(row['time'], row['mean'])), axis=1)

        # Drop the columns that are not needed
        data = data.drop(columns=['mean', 'time'])

        # Get the selling days for the next week
        today = datetime.now().date().weekday()
        selling_days = [i % 7 for i in range(today, today + 11)]

        data['days_left'] = data.apply(
            lambda row: calculate_days_left(row, selling_days), axis=1)
        # Get the alerts
        alerts = data[data['days_left'] < 10]
        alerts_info = []
        for _, row in alerts.iterrows():
            alert_dict = {
                'name': row['name'],
                'stock': row['stock'],
                'days_left': math.floor(row['days_left']),
                "days_mean": row['days_mean']
            }
            if row["days_left"] < 2 or row["stock"] < 5:
                alert_dict['urgent'] = True
            else:
                alert_dict['urgent'] = False
                alert_dict['restock_date'] = (datetime.now() + timedelta(
                    days=alert_dict['days_left'])).strftime("%Y-%m-%d")
            alerts_info.append(alert_dict)

        return JSONResponse(content=alerts_info)

    except Exception as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail="An error occurred")

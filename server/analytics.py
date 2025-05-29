from fastapi import HTTPException, APIRouter
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
import logging
from dotenv import load_dotenv
from os import getenv
from typing import Optional, List, Dict, Tuple, Union
import pandas as pd
import numpy as np
from dateutil import parser as dateutil_parser
from decimal import Decimal
from ml_utils import (
    create_features_for_sales,
    train_sales_prediction_model,
    calculate_days_until_stockout,
    predict_product_sales,
)
import xgboost as xgb

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")

# Create the FastAPI application
router = APIRouter()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


class Database:
    """Database context manager to handle the connection and cursor"""

    def __init__(
        self,
        host: str,
        database: str,
        user: str,
        password: str,
        real_dict_cursor: bool = True,
    ):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor
        self.conn = None

    def __enter__(self):
        self.conn = psycopg2.connect(
            host=self.host,
            database=self.database,
            user=self.user,
            password=self.password,
        )
        return self.conn.cursor(
            cursor_factory=RealDictCursor if self.real_dict_cursor else None
        )

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            if exc_type is not None:
                self.conn.rollback()
            else:
                self.conn.commit()
            self.conn.close()


def parse_date(date_str: str) -> datetime:
    """Parse date string handling ISO 8601 and date-only format, always return naive datetime."""
    try:
        parsed_date = dateutil_parser.parse(date_str)
        # Always return naive datetime (strip tzinfo)
        return parsed_date.replace(tzinfo=None)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid date format: {date_str} error: {e}"
        )


def to_float(value: Union[Decimal, float, int]) -> float:
    """Convert Decimal or numeric types to float"""
    if isinstance(value, Decimal):
        return float(value)
    return float(value) if value is not None else 0.0


def get_product_info(product_id: int, store_id: int) -> Optional[Dict]:
    """Get product information to avoid repeated queries"""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            cursor.execute(
                """
                SELECT p.id, p.name
                FROM products p
                JOIN product_inventory pi ON p.id = pi.product_id
                WHERE p.id = %s AND pi.store_id = %s AND pi.is_deleted = FALSE
                """,
                (product_id, store_id),
            )
            return cursor.fetchone()
    except Exception as e:
        logging.error(f"Error fetching product info: {e}")
        return None


def get_historical_sales_data(
    product_id: int, store_id: int, days_back: int = 365
) -> List[Tuple[datetime, float]]:
    """Fetch historical sales data for a product"""
    end_date = datetime.now() - timedelta(days=1)
    start_date = end_date - timedelta(days=days_back)

    with Database(HOST, DATABASE, USER, PASS) as cursor:
        cursor.execute(
            """
            WITH date_series AS (
                SELECT generate_series(%s::date, %s::date, '1 day'::interval)::date AS day
            ),
            sales_data AS (
                SELECT
                    DATE_TRUNC('day', bills.time)::date AS day,
                    COALESCE(SUM(pf.amount) * -1, 0) AS total
                FROM products_flow pf
                JOIN bills ON pf.bill_id = bills.id
                WHERE pf.product_id = %s
                AND bills.store_id = %s
                AND bills.type = 'sell'
                AND pf.amount < 0
                AND bills.time >= %s AND bills.time <= %s
                GROUP BY DATE_TRUNC('day', bills.time)::date
            )
            SELECT 
                ds.day,
                COALESCE(sd.total, 0) AS total
            FROM date_series ds
            LEFT JOIN sales_data sd ON ds.day = sd.day
            ORDER BY ds.day
            """,
            (
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d"),
                product_id,
                store_id,
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d"),
            ),
        )

        data = cursor.fetchall()
        return [(row["day"], float(row["total"])) for row in data]


@router.get("/analytics/alerts")
def alerts(store_id: int):
    """Get alerts for products running low in stock using statistical methods"""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            # Get all products with recent sales activity
            cursor.execute(
                """
                WITH recent_sales AS (
                    SELECT DISTINCT pf.product_id
                    FROM products_flow pf
                    JOIN bills b ON pf.bill_id = b.id
                    WHERE b.store_id = %s
                    AND b.type = 'sell'
                    AND pf.amount < 0
                    AND b.time >= NOW() - INTERVAL '90 days'
                ),
                product_sales_stats AS (
                    SELECT 
                        pf.product_id,
                        COUNT(DISTINCT DATE_TRUNC('day', b.time)) as active_days,
                        SUM(pf.amount) * -1 as total_sold,
                        AVG(pf.amount) * -1 as avg_per_transaction
                    FROM products_flow pf
                    JOIN bills b ON pf.bill_id = b.id
                    WHERE b.store_id = %s
                    AND b.type = 'sell'
                    AND pf.amount < 0
                    AND b.time >= NOW() - INTERVAL '60 days'
                    GROUP BY pf.product_id
                )
                SELECT 
                    p.id, 
                    p.name, 
                    p.category, 
                    pi.stock,
                    COALESCE(pss.active_days, 0) as active_days,
                    COALESCE(pss.total_sold, 0) as total_sold,
                    COALESCE(pss.avg_per_transaction, 0) as avg_per_transaction
                FROM products p
                JOIN product_inventory pi ON p.id = pi.product_id
                LEFT JOIN recent_sales rs ON p.id = rs.product_id
                LEFT JOIN product_sales_stats pss ON p.id = pss.product_id
                WHERE pi.store_id = %s
                AND pi.is_deleted = FALSE
                AND rs.product_id IS NOT NULL
                AND pss.total_sold > 0
                ORDER BY pi.stock ASC, p.name
                """,
                (store_id, store_id, store_id),
            )

            products = cursor.fetchall()

        if not products:
            return []

        # Convert Decimal fields to float
        for prod in products:
            for key in ["stock", "total_sold", "avg_per_transaction"]:
                if key in prod:
                    prod[key] = to_float(prod[key])

        df = pd.DataFrame(products)

        # Calculate daily consumption rate for each product
        df["daily_consumption"] = 0.0
        df["days_left"] = 999
        df["urgent"] = False

        # Vectorized calculation using recent sales data
        for idx, row in df.iterrows():
            product_id = row["id"]
            current_stock = float(row["stock"])
            active_days = max(1, row["active_days"])
            total_sold = float(row["total_sold"])

            # Calculate daily consumption using multiple methods
            methods = []

            # Method 1: Simple average over active days
            if active_days > 0:
                simple_avg = total_sold / active_days
                methods.append(simple_avg)

            # Method 2: Weighted consumption based on transaction patterns
            if row["avg_per_transaction"] > 0:
                transaction_based = float(row["avg_per_transaction"]) * 0.8
                methods.append(transaction_based)

            # Method 3: Get more detailed calculation if we have enough data
            detailed_rate = calculate_days_until_stockout(product_id, store_id)
            if detailed_rate is not None:
                methods.append(detailed_rate)

            # Use the median of available methods
            if methods:
                daily_consumption = float(np.median(methods))
                daily_consumption = max(0.1, daily_consumption)
            else:
                daily_consumption = 0.5

            df.at[idx, "daily_consumption"] = daily_consumption
            df.at[idx, "days_left"] = calculate_days_until_stockout(
                current_stock, daily_consumption
            )

        # Filter for alerts (products running out in < 30 days)
        alerts_df = df[df["days_left"] < 30].copy()

        # Determine urgency
        alerts_df["urgent"] = (alerts_df["days_left"] < 5) | (alerts_df["stock"] < 3)

        # Sort by urgency then by days left
        alerts_df = alerts_df.sort_values(
            ["urgent", "days_left"], ascending=[False, True]
        )

        # Convert to list of dictionaries
        alerts_list = []
        for _, row in alerts_df.iterrows():
            alert_dict = {
                "name": row["name"],
                "category": row["category"] or "غير مصنف",
                "stock": float(row["stock"]),
                "days_left": int(row["days_left"]),
                "urgent": bool(row["urgent"]),
            }
            alerts_list.append(alert_dict)

        return alerts_list

    except Exception as e:
        logging.error(f"Error in alerts endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


def predict_total_sales(
    store_id: int, days_to_predict: int = 15
) -> List[Tuple[str, float]]:
    """Predict total sales for future days"""
    try:
        # Get historical sales data for the store
        end_date = datetime.now() - timedelta(days=1)
        start_date = end_date - timedelta(days=365)

        with Database(HOST, DATABASE, USER, PASS) as cursor:
            cursor.execute(
                """
                WITH date_series AS (
                    SELECT generate_series(%s::date, %s::date, '1 day'::interval)::date AS day
                ),
                sales_data AS (
                    SELECT
                        DATE_TRUNC('day', bills.time)::date AS day,
                        COALESCE(SUM(bills.total), 0) AS total
                    FROM bills
                    WHERE bills.store_id = %s
                    AND bills.type IN ('sell', 'return')
                    AND bills.time >= %s AND bills.time <= %s
                    GROUP BY DATE_TRUNC('day', bills.time)::date
                )
                SELECT 
                    ds.day,
                    COALESCE(sd.total, 0) AS total
                FROM date_series ds
                LEFT JOIN sales_data sd ON ds.day = sd.day
                ORDER BY ds.day
                """,
                (
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d"),
                    store_id,
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d"),
                ),
            )

            historical_data = [
                (row["day"], float(row["total"])) for row in cursor.fetchall()
            ]

        if len(historical_data) < 14:
            # Not enough data, use simple average
            if len(historical_data) > 0:
                recent_avg = float(
                    np.mean([sales for _, sales in historical_data[-7:]])
                )
                predictions = []
                for i in range(days_to_predict):
                    date = (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d")
                    predictions.append((date, recent_avg))
                return predictions
            return []

        # Use similar prediction logic as product sales
        model = train_sales_prediction_model(historical_data)

        if model is None:
            # Fallback to weighted average
            weights = np.exp(np.linspace(-1, 0, min(14, len(historical_data))))
            weights /= weights.sum()
            recent_sales = [sales for _, sales in historical_data[-14:]]
            weighted_avg = np.dot(weights, recent_sales[-len(weights) :])

            predictions = []
            for i in range(days_to_predict):
                date = (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d")
                predictions.append((date, weighted_avg))
            return predictions

        # Generate predictions
        future_dates = pd.date_range(
            start=datetime.now().date(), periods=days_to_predict, freq="D"
        )
        future_features = create_features_for_sales(future_dates)

        # Add lag features
        recent_sales = [sales for _, sales in historical_data[-7:]]
        avg_recent = np.mean(recent_sales) if recent_sales else 0

        for lag in [1, 3, 7]:
            if f"lag_{lag}" in model.feature_names_in_:
                if lag <= len(recent_sales):
                    future_features[f"lag_{lag}"] = recent_sales[-lag]
                else:
                    future_features[f"lag_{lag}"] = avg_recent

        predictions_raw = model.predict(future_features)
        predictions_raw = np.maximum(predictions_raw, 0)
        predictions_raw = np.round(predictions_raw, 0)

        predictions = []
        for i, pred in enumerate(predictions_raw):
            date = future_dates[i].strftime("%Y-%m-%d")
            predictions.append((date, float(pred)))

        return predictions

    except Exception as e:
        logging.error(f"Sales prediction failed: {e}")
        return []


@router.post("/analytics/sales")
def sales(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    types: Optional[List[str]] = None,
):
    """Get daily sales for a specific store with prediction support"""
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if types is None:
        types = ["sell", "return"]

    # Parse dates
    start_date_obj = parse_date(start_date)
    end_date_obj = parse_date(end_date)
    today = datetime.now()
    is_future_prediction = end_date_obj.date() > today.date()
    historical_end_date = min(end_date_obj, today - timedelta(days=1))

    try:
        with Database(HOST, DATABASE, USER, PASS, real_dict_cursor=False) as cursor:
            cursor.execute(
                """
                SELECT
                    DATE_TRUNC('day', bills.time) AS day,
                    SUM(total) as total
                FROM bills
                WHERE bills.time > %s AND bills.time <= %s
                AND bills.type IN %s
                AND bills.store_id = %s
                GROUP BY day
                ORDER BY day
                """,
                (
                    start_date_obj.date(),
                    historical_end_date.date(),
                    tuple(types),
                    store_id,
                ),
            )

            historical_data = cursor.fetchall()

            # Convert to list format
            result_data = [
                [row[0].strftime("%Y-%m-%d"), float(row[1]), False]
                for row in historical_data
            ]

            # Add predictions if needed
            if is_future_prediction:
                prediction_days = (end_date_obj.date() - today.date()).days + 1
                predictions = predict_total_sales(store_id, prediction_days)
                for date_str, predicted_value in predictions:
                    result_data.append([date_str, predicted_value, True])

            # Ensure all days in range are present
            all_dates = pd.date_range(
                start=start_date_obj.strftime("%Y-%m-%d"),
                end=end_date_obj.strftime("%Y-%m-%d"),
            )
            data_map = {d[0]: d for d in result_data}
            final_result = []
            for dt in all_dates:
                date_str = dt.strftime("%Y-%m-%d")
                if date_str in data_map:
                    final_result.append(data_map[date_str])
                else:
                    final_result.append([date_str, 0, False])
            return final_result

    except psycopg2.Error as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/analytics/income")
def income_analytics(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get income analytics including cash flow and profit data"""
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            # Get cash flow summary
            cursor.execute(
                """
                SELECT 
                    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as cash_in,
                    SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) as cash_out
                FROM cash_flow
                WHERE store_id = %s 
                AND time > %s AND time <= %s
                """,
                (store_id, start_date, end_date),
            )

            cash_summary = cursor.fetchone()

            # Calculate profit
            cursor.execute(
                """
                SELECT 
                    COALESCE(SUM((pf.price - p.wholesale_price) * (-pf.amount)), 0) as profit
                FROM products_flow pf
                JOIN products p ON pf.product_id = p.id
                JOIN bills b ON pf.bill_id = b.id
                WHERE pf.store_id = %s
                AND b.time > %s AND b.time <= %s
                AND pf.amount < 0
                AND b.type = 'sell'
                """,
                (store_id, start_date, end_date),
            )

            profit_data = cursor.fetchone()

            # Get daily cash flow
            cursor.execute(
                """
                SELECT 
                    DATE_TRUNC('day', time) AS day,
                    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as cash_in,
                    SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) as cash_out
                FROM cash_flow
                WHERE store_id = %s
                AND time > %s AND time <= %s
                GROUP BY day
                ORDER BY day
                """,
                (store_id, start_date, end_date),
            )

            daily_cashflow = cursor.fetchall()

            # Get daily profit
            cursor.execute(
                """
                SELECT 
                    DATE_TRUNC('day', b.time) AS day,
                    SUM((pf.price - p.wholesale_price) * (-pf.amount)) as profit
                FROM products_flow pf
                JOIN products p ON pf.product_id = p.id
                JOIN bills b ON pf.bill_id = b.id
                WHERE pf.store_id = %s
                AND b.time > %s AND b.time <= %s
                AND pf.amount < 0
                AND b.type = 'sell'
                GROUP BY day
                ORDER BY day
                """,
                (store_id, start_date, end_date),
            )

            daily_profit = cursor.fetchall()

            # Process daily cashflow data
            cashflow_data = []
            for row in daily_cashflow:
                day = row["day"].strftime("%Y-%m-%d")
                cash_in = float(row["cash_in"] or 0)
                cash_out = float(row["cash_out"] or 0)
                net = cash_in - cash_out
                cashflow_data.append([day, cash_in, cash_out, net])

            # Process daily profit data
            profit_data_list = []
            for row in daily_profit:
                day = row["day"].strftime("%Y-%m-%d")
                profit = float(row["profit"] or 0)
                profit_data_list.append([day, profit])

            # Prepare response
            return {
                "cash_in": float(cash_summary["cash_in"] or 0),
                "cash_out": float(cash_summary["cash_out"] or 0),
                "net_cash": float(cash_summary["cash_in"] or 0)
                - float(cash_summary["cash_out"] or 0),
                "profit": float(profit_data["profit"] or 0),
                "daily_cashflow": cashflow_data,
                "daily_profit": profit_data_list,
            }

    except Exception as e:
        logging.error(f"Error in income analytics: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


def process_products_data_with_predictions(
    products_data: Dict[str, List],
    products_ids: List[int],
    store_id: int,
    end_date: datetime,
    today: datetime,
) -> Dict[str, List]:
    """Add predictions to historical product data"""
    prediction_days = (end_date.date() - today.date()).days + 1

    for product_id in products_ids:
        # Get product name
        product_info = get_product_info(product_id, store_id)
        if not product_info:
            continue

        product_name = product_info["name"]
        if product_name not in products_data:
            products_data[product_name] = []

        # Get predictions
        predictions = predict_product_sales(
            product_id, store_id, prediction_days,
            get_product_info=get_product_info,
            get_historical_sales_data=get_historical_sales_data
        )

        if predictions:
            for date_str, predicted_value in predictions:
                products_data[product_name].append(
                    [date_str, float(predicted_value), True]
                )

    return products_data


@router.get("/analytics/top-products")
def top_products(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get daily selling series of top 5 products"""
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    # Parse dates
    start_date_obj = parse_date(start_date)
    end_date_obj = parse_date(end_date)
    today = datetime.now()
    is_future_prediction = end_date_obj.date() > today.date()
    historical_end_date = min(end_date_obj, today - timedelta(days=1))

    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            # Get top 5 products by sales volume
            cursor.execute(
                """
                SELECT
                    p.id,
                    p.name,
                    SUM(pf.amount) * -1 as total_sold
                FROM products_flow pf
                JOIN products p ON pf.product_id = p.id
                JOIN bills b ON pf.bill_id = b.id
                WHERE b.time > %s AND b.time <= %s
                AND pf.store_id = %s
                AND b.type = 'sell'
                GROUP BY p.id, p.name
                ORDER BY total_sold DESC
                LIMIT 5
                """,
                (start_date_obj.date(), historical_end_date.date(), store_id),
            )

            top_products_info = cursor.fetchall()
            if not top_products_info:
                return {}

            product_ids = [p["id"] for p in top_products_info]

            # Get historical daily data
            cursor.execute(
                """
                SELECT p.name, DATE_TRUNC('day', b.time) AS day, 
                       SUM(pf.amount) * -1 AS total
                FROM products_flow pf
                JOIN products p ON pf.product_id = p.id
                JOIN bills b ON pf.bill_id = b.id
                WHERE p.id IN %s
                AND b.store_id = %s
                AND pf.amount < 0
                AND b.type = 'sell'
                AND b.time > %s AND b.time <= %s
                GROUP BY p.name, day
                ORDER BY day
                """,
                (
                    tuple(product_ids),
                    store_id,
                    start_date_obj.date(),
                    historical_end_date.date(),
                ),
            )

            data = cursor.fetchall()

            # Organize data by product
            products_data: Dict[str, List] = {}
            for row in data:
                product_name = row["name"]
                day_str = row["day"].strftime("%Y-%m-%d")
                if product_name not in products_data:
                    products_data[product_name] = []
                products_data[product_name].append(
                    [day_str, float(row["total"]), False]
                )

            # Add predictions if needed
            if is_future_prediction:
                products_data = process_products_data_with_predictions(
                    products_data, product_ids, store_id, end_date_obj, today
                )

            # Ensure all days in range are present for each product
            all_dates = pd.date_range(
                start=start_date_obj.strftime("%Y-%m-%d"),
                end=end_date_obj.strftime("%Y-%m-%d"),
            )
            for pname, arr in products_data.items():
                date_map = {d[0]: d for d in arr}
                filled = []
                for dt in all_dates:
                    date_str = dt.strftime("%Y-%m-%d")
                    if date_str in date_map:
                        filled.append(date_map[date_str])
                    else:
                        filled.append([date_str, 0, False])
                products_data[pname] = filled

            return products_data

    except Exception as e:
        logging.error(f"Error in top-products: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/analytics/products")
def products(
    store_id: int,
    products_ids: List[int],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Get daily selling series for specific products"""
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    if not products_ids:
        return JSONResponse(
            content={"message": "No products selected"}, status_code=400
        )

    # Parse dates
    start_date_obj = parse_date(start_date)
    end_date_obj = parse_date(end_date)
    today = datetime.now()
    is_future_prediction = end_date_obj.date() > today.date()
    historical_end_date = min(end_date_obj, today - timedelta(days=1))

    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            cursor.execute(
                """
                SELECT p.name, DATE_TRUNC('day', b.time) AS day, 
                       SUM(pf.amount) * -1 AS total
                FROM products_flow pf
                JOIN products p ON pf.product_id = p.id
                JOIN bills b ON pf.bill_id = b.id
                WHERE p.id IN %s
                AND b.store_id = %s
                AND pf.amount < 0
                AND b.type = 'sell'
                AND b.time > %s AND b.time <= %s
                GROUP BY p.name, day
                ORDER BY day
                """,
                (
                    tuple(products_ids),
                    store_id,
                    start_date_obj.date(),
                    historical_end_date.date(),
                ),
            )

            data = cursor.fetchall()

            # Organize data by product
            products_data: Dict[str, List] = {}
            for row in data:
                product_name = row["name"]
                day_str = row["day"].strftime("%Y-%m-%d")
                if product_name not in products_data:
                    products_data[product_name] = []
                products_data[product_name].append(
                    [day_str, float(row["total"]), False]
                )

            # Add predictions if needed
            if is_future_prediction:
                products_data = process_products_data_with_predictions(
                    products_data, products_ids, store_id, end_date_obj, today
                )

            # Ensure all days in range are present for each product
            all_dates = pd.date_range(
                start=start_date_obj.strftime("%Y-%m-%d"),
                end=end_date_obj.strftime("%Y-%m-%d"),
            )
            for pname, arr in products_data.items():
                date_map = {d[0]: d for d in arr}
                filled = []
                for dt in all_dates:
                    date_str = dt.strftime("%Y-%m-%d")
                    if date_str in date_map:
                        filled.append(date_map[date_str])
                    else:
                        filled.append([date_str, 0, False])
                products_data[pname] = filled

            return products_data

    except Exception as e:
        logging.error(f"Error in products endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/shifts-analytics")
def shifts_analytics(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    bills_type: List[str] = None,
) -> JSONResponse:
    """
    Get the total sales for each shift with ML-based prediction support.
    Uses 60+ days of historical data for training, similar to other analytics endpoints.
    """
    if bills_type is None:
        bills_type = ["sell", "return"]

    try:
        # Parse dates
        if end_date:
            end_date_obj = parse_date(end_date)
            start_date_obj = parse_date(start_date)
            today = datetime.now()
            is_future_prediction = end_date_obj.date() > today.date()
            historical_end_date = min(end_date_obj, today - timedelta(days=1))
        else:
            end_date_obj = datetime.now()
            start_date_obj = parse_date(start_date)
            today = datetime.now()
            is_future_prediction = False
            historical_end_date = today - timedelta(days=1)

        # Get extended historical data for ML training (similar to other endpoints)
        training_start_date = historical_end_date - timedelta(
            days=120
        )  # 4 months for better training

        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get all historical shift data for training
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
                        AND store_id = %s
                    ) AS total
                FROM shifts
                WHERE start_date_time >= %s
                AND start_date_time <= %s
                AND store_id = %s
                AND current = FALSE
                ORDER BY start_date_time
                """,
                (
                    tuple(bills_type),
                    store_id,
                    training_start_date,
                    historical_end_date,
                    store_id,
                ),
            )

            training_rows = cur.fetchall()

            # Get data for the requested date range
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
                        AND store_id = %s
                    ) AS total
                FROM shifts
                WHERE start_date_time >= %s
                AND start_date_time <= %s
                AND store_id = %s
                AND current = FALSE
                ORDER BY start_date_time
                """,
                (
                    tuple(bills_type),
                    store_id,
                    start_date_obj,
                    historical_end_date,
                    store_id,
                ),
            )

            requested_rows = cur.fetchall()

        # Process historical data for display
        historical_data = []
        for row in requested_rows:
            start_dt = pd.to_datetime(row["start_date_time"])
            end_dt = pd.to_datetime(row["end_date_time"])
            duration_hours = max(1, int((end_dt - start_dt).total_seconds() / 3600))
            historical_data.append(
                {
                    "start_date_time": str(row["start_date_time"]),
                    "end_date_time": str(row["end_date_time"]),
                    "duration_hours": duration_hours,
                    "total": float(row["total"]),
                    "is_prediction": False,
                }
            )

        # Prepare training data
        training_data = []
        for row in training_rows:
            start_dt = pd.to_datetime(row["start_date_time"])
            end_dt = pd.to_datetime(row["end_date_time"])
            duration_hours = max(1, int((end_dt - start_dt).total_seconds() / 3600))
            training_data.append(
                {
                    "start_date_time": start_dt,
                    "end_date_time": end_dt,
                    "duration_hours": duration_hours,
                    "total": float(row["total"]),
                }
            )

        # Check if we have enough data for ML
        if len(training_data) < 14:
            # Not enough data for ML, use simple average
            avg_shift_total = (
                float(np.mean([d["total"] for d in training_data]))
                if training_data
                else 0
            )
            avg_duration = (
                float(np.mean([d["duration_hours"] for d in training_data]))
                if training_data
                else 8
            )

            result = historical_data.copy()
            if is_future_prediction:
                current_date = today.date() + timedelta(days=1)
                while current_date <= end_date_obj.date():
                    # Use consistent shift timing (8 AM to 6 PM as default)
                    start_hour = 8
                    end_hour = 18
                    result.append(
                        {
                            "start_date_time": f"{current_date.strftime('%Y-%m-%d')} {start_hour:02d}:00:00",
                            "end_date_time": f"{current_date.strftime('%Y-%m-%d')} {end_hour:02d}:00:00",
                            "duration_hours": int(avg_duration),
                            "total": round(avg_shift_total, 2),
                            "is_prediction": True,
                        }
                    )
                    current_date += timedelta(days=1)
            return JSONResponse(content=result)

        # Train ML model similar to other endpoints
        df = pd.DataFrame(training_data)
        df["start_dt"] = pd.to_datetime(df["start_date_time"])
        df["end_dt"] = pd.to_datetime(df["end_date_time"])

        # Create features similar to sales prediction
        df["day_of_week"] = df["start_dt"].dt.dayofweek
        df["day_of_month"] = df["start_dt"].dt.day
        df["month"] = df["start_dt"].dt.month
        df["start_hour"] = df["start_dt"].dt.hour
        df["end_hour"] = df["end_dt"].dt.hour
        df["is_weekend"] = (df["start_dt"].dt.dayofweek >= 5).astype(int)

        # Add lag features
        df = df.sort_values("start_dt").reset_index(drop=True)
        for lag in [1, 3, 7]:
            if len(df) > lag:
                df[f"lag_{lag}_total"] = (
                    df["total"].shift(lag).fillna(df["total"].mean())
                )
                df[f"lag_{lag}_duration"] = (
                    df["duration_hours"].shift(lag).fillna(df["duration_hours"].mean())
                )

        # Train models
        feature_cols = [
            "day_of_week",
            "day_of_month",
            "month",
            "duration_hours",
            "is_weekend",
        ]
        for lag in [1, 3, 7]:
            if f"lag_{lag}_total" in df.columns:
                feature_cols.extend([f"lag_{lag}_total", f"lag_{lag}_duration"])

        # Remove rows with NaN values
        mask = ~df[feature_cols + ["total"]].isna().any(axis=1)
        X_train = df[mask][feature_cols]
        y_train = df[mask]["total"]

        if len(X_train) < 5:
            # Fallback to weighted average
            weights = np.exp(np.linspace(-1, 0, len(training_data)))
            weights /= weights.sum()
            weighted_avg = np.dot(weights, [d["total"] for d in training_data])
            avg_duration = np.mean([d["duration_hours"] for d in training_data])

            result = historical_data.copy()
            if is_future_prediction:
                current_date = today.date() + timedelta(days=1)
                while current_date <= end_date_obj.date():
                    result.append(
                        {
                            "start_date_time": f"{current_date.strftime('%Y-%m-%d')} 08:00:00",
                            "end_date_time": f"{current_date.strftime('%Y-%m-%d')} 18:00:00",
                            "duration_hours": int(avg_duration),
                            "total": round(weighted_avg, 2),
                            "is_prediction": True,
                        }
                    )
                    current_date += timedelta(days=1)
            return JSONResponse(content=result)

        # Train XGBoost model
        model_sales = xgb.XGBRegressor(
            n_estimators=400,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            gamma=0.05,
            reg_alpha=0.05,
            reg_lambda=1.0,
            random_state=42,
            n_jobs=-1,
        )
        model_sales.fit(X_train, y_train)

        # Make predictions if needed
        result = historical_data.copy()
        if is_future_prediction:
            current_date = today.date() + timedelta(days=1)
            recent_data = df.tail(7)  # Last week for lag features

            while current_date <= end_date_obj.date():
                # Predict shift characteristics
                dow = current_date.weekday()
                is_weekend = 1 if dow >= 5 else 0

                # Use average duration from recent shifts
                avg_duration = int(recent_data["duration_hours"].mean())

                # Estimate shift times based on patterns
                avg_start_hour = int(recent_data["start_hour"].mean())
                avg_end_hour = int(recent_data["end_hour"].mean())

                # Create features for prediction
                pred_features = {
                    "day_of_week": dow,
                    "day_of_month": current_date.day,
                    "month": current_date.month,
                    "duration_hours": avg_duration,
                    "is_weekend": is_weekend,
                }

                # Add lag features from recent data
                for lag in [1, 3, 7]:
                    if f"lag_{lag}_total" in feature_cols and len(recent_data) >= lag:
                        pred_features[f"lag_{lag}_total"] = recent_data["total"].iloc[
                            -lag
                        ]
                        pred_features[f"lag_{lag}_duration"] = recent_data[
                            "duration_hours"
                        ].iloc[-lag]
                    elif f"lag_{lag}_total" in feature_cols:
                        pred_features[f"lag_{lag}_total"] = recent_data["total"].mean()
                        pred_features[f"lag_{lag}_duration"] = recent_data[
                            "duration_hours"
                        ].mean()

                # Ensure all required features are present
                pred_df = pd.DataFrame([pred_features])
                for col in feature_cols:
                    if col not in pred_df.columns:
                        pred_df[col] = 0

                pred_df = pred_df[feature_cols]

                # Predict sales
                pred_total = float(model_sales.predict(pred_df)[0])
                pred_total = max(0, pred_total)

                result.append(
                    {
                        "start_date_time": f"{current_date.strftime('%Y-%m-%d')} {avg_start_hour:02d}:00:00",
                        "end_date_time": f"{current_date.strftime('%Y-%m-%d')} {avg_end_hour:02d}:00:00",
                        "duration_hours": avg_duration,
                        "total": round(pred_total, 0),
                        "is_prediction": True,
                    }
                )

                current_date += timedelta(days=1)

        return JSONResponse(content=result)

    except Exception as e:
        logging.error(f"Error in shifts analytics: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

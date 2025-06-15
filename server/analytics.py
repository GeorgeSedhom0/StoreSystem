from fastapi import HTTPException, APIRouter, Depends
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
import logging
from dotenv import load_dotenv
from os import getenv
from typing import Optional, List, Dict
import pandas as pd
import numpy as np
from ml_utils import calculate_days_until_stockout
from utils import parse_date, to_float
from analytics_utils import (
    process_products_data_with_predictions,
    predict_total_sales,
    Database,
)
from auth_middleware import get_current_user

load_dotenv()

HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"

router = APIRouter()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def _ensure_date_range_coverage(data: List, start_date: str, end_date: str) -> List:
    all_dates = pd.date_range(start=start_date, end=end_date)
    data_map = {d[0]: d for d in data}
    return [
        data_map.get(dt.strftime("%Y-%m-%d"), [dt.strftime("%Y-%m-%d"), 0, False])
        for dt in all_dates
    ]


def _get_historical_and_prediction_bounds(start_date: str, end_date: str) -> tuple:
    start_date_obj = parse_date(start_date)
    end_date_obj = parse_date(end_date)
    today = datetime.now()
    is_future_prediction = end_date_obj.date() > today.date()
    historical_end_date = min(end_date_obj, today - timedelta(days=1))
    return (
        start_date_obj,
        end_date_obj,
        today,
        is_future_prediction,
        historical_end_date,
    )


@router.get("/analytics/alerts")
def alerts(store_id: int, current_user: dict = Depends(get_current_user)):
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
                    WHERE b.store_id = %s AND b.type = 'sell' AND pf.amount < 0
                    AND b.time >= NOW() - INTERVAL '90 days'
                ),
                product_sales_stats AS (
                    SELECT pf.product_id,
                           COUNT(DISTINCT DATE_TRUNC('day', b.time)) as active_days,
                           SUM(pf.amount) * -1 as total_sold,
                           AVG(pf.amount) * -1 as avg_per_transaction
                    FROM products_flow pf
                    JOIN bills b ON pf.bill_id = b.id
                    WHERE b.store_id = %s AND b.type = 'sell' AND pf.amount < 0
                    AND b.time >= NOW() - INTERVAL '60 days'
                    GROUP BY pf.product_id
                )
                SELECT p.id, p.name, p.category, pi.stock,
                       COALESCE(pss.active_days, 0) as active_days,
                       COALESCE(pss.total_sold, 0) as total_sold,
                       COALESCE(pss.avg_per_transaction, 0) as avg_per_transaction
                FROM products p
                JOIN product_inventory pi ON p.id = pi.product_id
                LEFT JOIN recent_sales rs ON p.id = rs.product_id
                LEFT JOIN product_sales_stats pss ON p.id = pss.product_id
                WHERE pi.store_id = %s AND pi.is_deleted = FALSE
                AND rs.product_id IS NOT NULL AND pss.total_sold > 0
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


@router.post("/analytics/sales")
def sales(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    types: Optional[List[str]] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get daily sales for a specific store with prediction support"""
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if types is None:
        types = ["sell", "return"]

    start_date_obj, end_date_obj, today, is_future_prediction, historical_end_date = (
        _get_historical_and_prediction_bounds(start_date, end_date)
    )

    try:
        with Database(HOST, DATABASE, USER, PASS, real_dict_cursor=False) as cursor:
            cursor.execute(
                """
                SELECT DATE_TRUNC('day', bills.time) AS day, SUM(total) as total
                FROM bills
                WHERE bills.time > %s AND bills.time <= %s
                AND bills.type IN %s AND bills.store_id = %s
                GROUP BY day
                ORDER BY day
                """,
                (start_date_obj, historical_end_date, tuple(types), store_id),
            )
            historical_data = cursor.fetchall()

        result_data = [
            [row[0].strftime("%Y-%m-%d"), float(row[1]), False]
            for row in historical_data
        ]

        if is_future_prediction:
            prediction_days = (end_date_obj.date() - today.date()).days + 1
            predictions = predict_total_sales(store_id, types, prediction_days)
            result_data.extend(
                [
                    [date_str, predicted_value, True]
                    for date_str, predicted_value in predictions
                ]
            )

        return _ensure_date_range_coverage(result_data, start_date, end_date)

    except psycopg2.Error as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/analytics/income")
def income_analytics(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
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
                WHERE store_id = %s AND time > %s AND time <= %s
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
                WHERE pf.store_id = %s AND b.time > %s AND b.time <= %s
                AND pf.amount < 0 AND b.type = 'sell'
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
                WHERE store_id = %s AND time > %s AND time <= %s
                GROUP BY day ORDER BY day
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
                WHERE pf.store_id = %s AND b.time > %s AND b.time <= %s
                AND pf.amount < 0 AND b.type = 'sell'
                GROUP BY day ORDER BY day
                """,
                (store_id, start_date, end_date),
            )
            daily_profit = cursor.fetchall()

            cashflow_data = [
                [
                    row["day"].strftime("%Y-%m-%d"),
                    float(row["cash_in"] or 0),
                    float(row["cash_out"] or 0),
                    float(row["cash_in"] or 0) - float(row["cash_out"] or 0),
                ]
                for row in daily_cashflow
            ]

            profit_data_list = [
                [row["day"].strftime("%Y-%m-%d"), float(row["profit"] or 0)]
                for row in daily_profit
            ]

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


def _get_products_data(
    store_id: int,
    start_date_obj: datetime,
    historical_end_date: datetime,
    product_ids: List[int] = None,
) -> Dict[str, List]:
    with Database(HOST, DATABASE, USER, PASS) as cursor:
        query = """
            SELECT p.name, DATE_TRUNC('day', b.time) AS day, SUM(pf.amount) * -1 AS total
            FROM products_flow pf
            JOIN products p ON pf.product_id = p.id
            JOIN bills b ON pf.bill_id = b.id
            WHERE {product_filter} b.store_id = %s AND pf.amount < 0 AND b.type = 'sell'
            AND b.time > %s AND b.time <= %s
            GROUP BY p.name, day ORDER BY day
        """

        if product_ids:
            cursor.execute(
                query.format(product_filter="p.id IN %s AND"),
                (
                    tuple(product_ids),
                    store_id,
                    start_date_obj.date(),
                    historical_end_date.date(),
                ),
            )
        else:
            cursor.execute(
                """
                SELECT p.id, p.name, SUM(pf.amount) * -1 as total_sold
                FROM products_flow pf
                JOIN products p ON pf.product_id = p.id
                JOIN bills b ON pf.bill_id = b.id
                WHERE b.time > %s AND b.time <= %s AND pf.store_id = %s AND b.type = 'sell'
                GROUP BY p.id, p.name ORDER BY total_sold DESC LIMIT 5
                """,
                (start_date_obj.date(), historical_end_date.date(), store_id),
            )
            top_products = cursor.fetchall()
            product_ids = [p["id"] for p in top_products]

            cursor.execute(
                query.format(product_filter="p.id IN %s AND"),
                (
                    tuple(product_ids),
                    store_id,
                    start_date_obj.date(),
                    historical_end_date.date(),
                ),
            )

        data = cursor.fetchall()

    products_data: Dict[str, List] = {}
    for row in data:
        product_name = row["name"]
        day_str = row["day"].strftime("%Y-%m-%d")
        if product_name not in products_data:
            products_data[product_name] = []
        products_data[product_name].append([day_str, float(row["total"]), False])

    return products_data, product_ids


@router.get("/analytics/top-products")
def top_products(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get daily selling series of top 5 products"""
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    start_date_obj, end_date_obj, today, is_future_prediction, historical_end_date = (
        _get_historical_and_prediction_bounds(start_date, end_date)
    )

    try:
        products_data, product_ids = _get_products_data(
            store_id, start_date_obj, historical_end_date
        )
        if not products_data:
            return {}

        if is_future_prediction:
            products_data = process_products_data_with_predictions(
                products_data, product_ids, store_id, end_date_obj, today
            )

        all_dates = pd.date_range(
            start=start_date_obj.strftime("%Y-%m-%d"),
            end=end_date_obj.strftime("%Y-%m-%d"),
        )
        for pname, arr in products_data.items():
            date_map = {d[0]: d for d in arr}
            products_data[pname] = [
                date_map.get(
                    dt.strftime("%Y-%m-%d"), [dt.strftime("%Y-%m-%d"), 0, False]
                )
                for dt in all_dates
            ]

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
    current_user: dict = Depends(get_current_user),
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

    start_date_obj, end_date_obj, today, is_future_prediction, historical_end_date = (
        _get_historical_and_prediction_bounds(start_date, end_date)
    )

    try:
        products_data, _ = _get_products_data(
            store_id, start_date_obj, historical_end_date, products_ids
        )

        if is_future_prediction:
            products_data = process_products_data_with_predictions(
                products_data, products_ids, store_id, end_date_obj, today
            )

        all_dates = pd.date_range(
            start=start_date_obj.strftime("%Y-%m-%d"),
            end=end_date_obj.strftime("%Y-%m-%d"),
        )
        for pname, arr in products_data.items():
            date_map = {d[0]: d for d in arr}
            products_data[pname] = [
                date_map.get(
                    dt.strftime("%Y-%m-%d"), [dt.strftime("%Y-%m-%d"), 0, False]
                )
                for dt in all_dates
            ]

        return products_data

    except Exception as e:
        logging.error(f"Error in products endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/shifts-analytics")
def shifts_analytics(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    bills_type: List[str] = ["sell", "return"],
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Get the total sales for each shift with ML-based prediction support.
    """
    if start_date is None:
        start_date = "2021-01-01T00:00:00Z"
    if bills_type is None:
        bills_type = ["sell", "return"]

    start_date_obj, end_date_obj, today, is_future_prediction, historical_end_date = (
        _get_historical_and_prediction_bounds(start_date, end_date)
    )

    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            cursor.execute(
                """
                SELECT start_date_time, end_date_time,
                    (SELECT COALESCE(SUM(total), 0) FROM bills
                     WHERE time >= start_date_time AND time <= COALESCE(end_date_time, CURRENT_TIMESTAMP)
                     AND type IN %s AND store_id = %s) AS total
                FROM shifts
                WHERE start_date_time >= %s AND start_date_time <= %s
                AND store_id = %s AND current = FALSE
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
            shifts_data = cursor.fetchall()

        result = []
        for row in shifts_data:
            start_dt = pd.to_datetime(row["start_date_time"])
            end_dt = pd.to_datetime(row["end_date_time"])
            duration_hours = max(1, int((end_dt - start_dt).total_seconds() / 3600))
            result.append(
                {
                    "start_date_time": str(row["start_date_time"]),
                    "end_date_time": str(row["end_date_time"]),
                    "duration_hours": duration_hours,
                    "total": float(row["total"]),
                    "is_prediction": False,
                }
            )

        if is_future_prediction:
            from analytics_utils import process_shifts_data_with_predictions

            prediction_days = (end_date_obj.date() - today.date()).days + 1
            predictions = process_shifts_data_with_predictions(
                store_id, bills_type, prediction_days
            )
            result.extend(predictions)

        return JSONResponse(content=result)

    except Exception as e:
        logging.error(f"Error in shifts analytics: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

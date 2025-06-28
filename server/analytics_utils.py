from datetime import datetime, timedelta
import logging
from os import getenv
from typing import Dict, List, Tuple, Optional
import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from ml_utils import (
    train_sales_prediction_model,
    create_features_for_sales,
    predict_product_sales,
    train_shifts_prediction_model,
    create_features_for_shifts,
    BEST_CONFIG,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST") or "localhost"
DATABASE = getenv("DATABASE") or "store"
USER = getenv("USER") or "postgres"
PASS = getenv("PASS") or "postgres"


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


def _get_date_series_query(
    start_date: datetime, end_date: datetime
) -> Tuple[str, List]:
    return (
        "WITH date_series AS (SELECT generate_series(%s::date, %s::date, '1 day'::interval)::date AS day)",
        [start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")],
    )


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
                LEFT JOIN assosiated_parties ap ON bills.party_id = ap.id
                WHERE pf.product_id = %s AND bills.store_id = %s AND bills.type = 'sell'
                AND pf.amount < 0 AND bills.time >= %s AND bills.time <= %s
                AND NOT (bills.party_id IS NOT NULL AND bills.type = 'sell' AND ap.type = 'store')
                GROUP BY DATE_TRUNC('day', bills.time)::date
            )
            SELECT ds.day, COALESCE(sd.total, 0) AS total
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
        return [(row["day"], float(row["total"])) for row in cursor.fetchall()]


def _get_fallback_prediction(
    historical_data: List, days_to_predict: int, use_exponential: bool = True
) -> List[Tuple[str, float]]:
    if not historical_data:
        return []

    if use_exponential:
        weights = np.exp(
            np.linspace(
                -1, 0, min(BEST_CONFIG["training_days"] // 5, len(historical_data))
            )
        )
        weights /= weights.sum()
        recent_sales = [sales for _, sales in historical_data[-len(weights) :]]
        avg_value = np.dot(weights, recent_sales)
    else:
        avg_value = float(np.mean([sales for _, sales in historical_data[-7:]]))

    predictions = []
    for i in range(days_to_predict):
        date = (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d")
        predictions.append((date, avg_value))
    return predictions


def predict_total_sales(
    store_id: int, bills_type: list[str], days_to_predict: int = 15
) -> List[Tuple[str, float]]:
    """Predict total sales for future days using optimal configuration"""
    try:
        # Get historical sales data for the store with optimal lookback
        end_date = datetime.now() - timedelta(days=1)
        start_date = end_date - timedelta(days=BEST_CONFIG["training_days"] + 30)

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
                    LEFT JOIN assosiated_parties ap ON bills.party_id = ap.id
                    WHERE bills.store_id = %s AND bills.type IN %s
                    AND bills.time >= %s AND bills.time <= %s
                    AND NOT (bills.party_id IS NOT NULL AND bills.type = 'sell' AND ap.type = 'store')
                    GROUP BY DATE_TRUNC('day', bills.time)::date
                )
                SELECT ds.day, COALESCE(sd.total, 0) AS total
                FROM date_series ds
                LEFT JOIN sales_data sd ON ds.day = sd.day
                ORDER BY ds.day
                """,
                (
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d"),
                    store_id,
                    tuple(bills_type),
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d"),
                ),
            )
            historical_data = [
                (row["day"], float(row["total"])) for row in cursor.fetchall()
            ]

        min_required = max(14, BEST_CONFIG["training_days"] // 3)
        if len(historical_data) < min_required:
            # Not enough data, use simple average
            return _get_fallback_prediction(
                historical_data, days_to_predict, use_exponential=False
            )

        # Use optimal model configuration
        model = train_sales_prediction_model(
            historical_data, days_to_predict, bills_type
        )
        if model is None:
            # Enhanced fallback with exponential smoothing
            return _get_fallback_prediction(historical_data, days_to_predict)

        # Generate predictions with optimal features
        future_dates = pd.date_range(
            start=datetime.now().date(), periods=days_to_predict, freq="D"
        )
        future_features = create_features_for_sales(
            future_dates, BEST_CONFIG["feature_type"]
        )

        # Add lag features using optimal configuration
        if BEST_CONFIG["lag_features"]:
            recent_sales = [
                sales
                for _, sales in historical_data[
                    -max(BEST_CONFIG["lag_features"] + [7]) :
                ]
            ]
        else:
            recent_sales = [sales for _, sales in historical_data[-7:]]
        avg_recent = np.mean(recent_sales) if recent_sales else 0

        for lag in BEST_CONFIG["lag_features"]:
            if lag <= len(recent_sales):
                future_features[f"lag_{lag}"] = recent_sales[-lag]
            else:
                future_features[f"lag_{lag}"] = avg_recent

        predictions_raw = model.predict(future_features)
        predictions_raw = np.round(predictions_raw, 0)

        return [
            (future_dates[i].strftime("%Y-%m-%d"), float(pred))
            for i, pred in enumerate(predictions_raw)
        ]

    except Exception as e:
        logging.error(f"Sales prediction failed: {e}")
        return []


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
            product_id,
            store_id,
            prediction_days,
            get_product_info=get_product_info,
            get_historical_sales_data=get_historical_sales_data,
        )

        if predictions:
            for date_str, predicted_value in predictions:
                products_data[product_name].append(
                    [date_str, float(predicted_value), True]
                )

    return products_data


def get_historical_shifts_data(
    store_id: int, bills_type: List[str], days_back: int = 365
) -> List[Dict]:
    """Fetch historical shifts data for training"""
    end_date = datetime.now() - timedelta(days=1)
    start_date = end_date - timedelta(days=days_back)

    with Database(HOST, DATABASE, USER, PASS) as cursor:
        cursor.execute(
            """
            SELECT start_date_time, end_date_time,
                (SELECT COALESCE(SUM(total), 0) FROM bills
                 LEFT JOIN assosiated_parties ap ON bills.party_id = ap.id
                 WHERE time >= start_date_time AND time <= COALESCE(end_date_time, CURRENT_TIMESTAMP)
                 AND type IN %s AND store_id = %s
                 AND NOT (bills.party_id IS NOT NULL AND bills.type = 'sell' AND ap.type = 'store')) AS total
            FROM shifts
            WHERE start_date_time >= %s AND start_date_time <= %s
            AND store_id = %s AND current = FALSE
            ORDER BY start_date_time
            """,
            (
                tuple(bills_type),
                store_id,
                start_date.strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d"),
                store_id,
            ),
        )
        shifts_data = cursor.fetchall()

    # Process the data
    processed_data = []
    for row in shifts_data:
        start_dt = pd.to_datetime(row["start_date_time"])
        end_dt = pd.to_datetime(row["end_date_time"])
        duration_hours = max(1, int((end_dt - start_dt).total_seconds() / 3600))
        processed_data.append(
            {
                "start_date_time": start_dt,
                "end_date_time": end_dt,
                "duration_hours": duration_hours,
                "total": float(row["total"]),
                "day_of_week": start_dt.dayofweek,
                "day_of_month": start_dt.day,
                "month": start_dt.month,
                "start_hour": start_dt.hour,
                "end_hour": end_dt.hour,
                "is_weekend": 1 if start_dt.dayofweek >= 5 else 0,
            }
        )
    return processed_data


def _get_shifts_fallback_prediction(
    historical_data: List[Dict], days_to_predict: int
) -> List[Dict]:
    if not historical_data:
        return []

    weights = np.exp(
        np.linspace(-1, 0, min(BEST_CONFIG["training_days"] // 5, len(historical_data)))
    )
    weights /= weights.sum()
    recent_shifts = historical_data[-len(weights) :]
    weighted_avg = np.dot(weights, [shift["total"] for shift in recent_shifts])

    avg_duration = int(np.mean([shift["duration_hours"] for shift in recent_shifts]))
    avg_start_hour = int(np.mean([shift["start_hour"] for shift in recent_shifts]))
    avg_end_hour = int(np.mean([shift["end_hour"] for shift in recent_shifts]))

    predictions = []
    current_date = datetime.now().date() + timedelta(days=1)
    for i in range(days_to_predict):
        date = current_date + timedelta(days=i)
        predictions.append(
            {
                "start_date_time": f"{date.strftime('%Y-%m-%d')} {avg_start_hour:02d}:00:00",
                "end_date_time": f"{date.strftime('%Y-%m-%d')} {avg_end_hour:02d}:00:00",
                "duration_hours": avg_duration,
                "total": round(weighted_avg, 0),
                "is_prediction": True,
            }
        )
    return predictions


def predict_shifts_sales(
    store_id: int, bills_type: List[str], days_to_predict: int = 15
) -> List[Dict]:
    """Predict shifts sales for future days using optimal configuration"""
    try:
        # Get historical data with optimal lookback period
        historical_data = get_historical_shifts_data(
            store_id, bills_type, days_back=BEST_CONFIG["training_days"] + 30
        )

        min_required = max(14, BEST_CONFIG["training_days"] // 3)
        if len(historical_data) < min_required:
            # Not enough data, use simple average
            if len(historical_data) > 0:
                avg_total = float(
                    np.mean([shift["total"] for shift in historical_data])
                )
                avg_duration = int(
                    np.mean([shift["duration_hours"] for shift in historical_data])
                )
                avg_start_hour = int(
                    np.mean([shift["start_hour"] for shift in historical_data])
                )
                avg_end_hour = int(
                    np.mean([shift["end_hour"] for shift in historical_data])
                )

                predictions = []
                current_date = datetime.now().date() + timedelta(days=1)
                for i in range(days_to_predict):
                    date = current_date + timedelta(days=i)
                    predictions.append(
                        {
                            "start_date_time": f"{date.strftime('%Y-%m-%d')} {avg_start_hour:02d}:00:00",
                            "end_date_time": f"{date.strftime('%Y-%m-%d')} {avg_end_hour:02d}:00:00",
                            "duration_hours": avg_duration,
                            "total": round(avg_total, 0),
                            "is_prediction": True,
                        }
                    )
                return predictions
            return []

        # Use optimal model configuration
        model = train_shifts_prediction_model(
            historical_data, days_to_predict, bills_type
        )

        if model is None:
            # Enhanced fallback with exponential smoothing
            return _get_shifts_fallback_prediction(historical_data, days_to_predict)

        # Generate predictions using optimal ML model
        predictions = []
        current_date = datetime.now().date() + timedelta(days=1)
        recent_data = pd.DataFrame(
            historical_data[-max(BEST_CONFIG["lag_features"] + [7]) :]
        )

        for i in range(days_to_predict):
            date = current_date + timedelta(days=i)

            # Get average characteristics from recent data
            avg_duration = int(recent_data["duration_hours"].mean())
            avg_start_hour = int(recent_data["start_hour"].mean())
            avg_end_hour = int(recent_data["end_hour"].mean())

            # Create features for prediction with optimal configuration
            future_features = create_features_for_shifts(
                date,
                avg_duration,
                avg_start_hour,
                avg_end_hour,
                recent_data,
                BEST_CONFIG["feature_type"],
            )

            # Predict
            pred_total = float(model.predict([future_features])[0])

            predictions.append(
                {
                    "start_date_time": f"{date.strftime('%Y-%m-%d')} {avg_start_hour:02d}:00:00",
                    "end_date_time": f"{date.strftime('%Y-%m-%d')} {avg_end_hour:02d}:00:00",
                    "duration_hours": avg_duration,
                    "total": round(pred_total, 0),
                    "is_prediction": True,
                }
            )

        return predictions

    except Exception as e:
        logging.error(f"Shifts prediction failed: {e}")
        return []


def process_shifts_data_with_predictions(
    store_id: int, bills_type: List[str], prediction_days: int
) -> List[Dict]:
    """Add predictions to shifts data"""
    return predict_shifts_sales(store_id, bills_type, prediction_days)

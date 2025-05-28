from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
import logging
from dotenv import load_dotenv
from os import getenv
from fastapi import APIRouter
from typing import Optional, List, Dict, Tuple
import pandas as pd
import numpy as np
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

    def __init__(self, host, database, user, password, real_dict_cursor=True):
        self.host = host
        self.database = database
        self.user = user
        self.password = password
        self.real_dict_cursor = real_dict_cursor

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
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.conn.close()


def parse_date(date_str: str) -> datetime:
    """Parse date string handling both ISO format and date-only format"""
    try:
        if "T" in date_str and "Z" in date_str:
            parsed_date = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S.%fZ")
        else:
            parsed_date = datetime.strptime(date_str, "%Y-%m-%d")
        logging.info(f"Parsed date: {parsed_date}")
        return parsed_date
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid date format: {date_str} error: {e}"
        )


def get_product_info(product_id: int, store_id: int) -> Optional[Dict]:
    """get product information to avoid repeated queries"""
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


def create_features_for_sales(
    dates,
) -> pd.DataFrame:
    """Create features for sales prediction"""
    features = pd.DataFrame()

    # Handle both DatetimeIndex and Series
    if isinstance(dates, pd.DatetimeIndex):
        features["day_of_week"] = dates.dayofweek
        features["day_of_month"] = dates.day
        features["month"] = dates.month
        features["is_weekend"] = (dates.dayofweek >= 5).astype(int)
    else:  # Series
        features["day_of_week"] = dates.dt.dayofweek
        features["day_of_month"] = dates.dt.day
        features["month"] = dates.dt.month
        features["is_weekend"] = (dates.dt.dayofweek >= 5).astype(int)

    return features


def train_sales_prediction_model(
    historical_data: List[Tuple[datetime, float]],
) -> Optional[xgb.XGBRegressor]:
    """Train XGBoost model for sales prediction"""
    if len(historical_data) < 14:  # Need at least 2 weeks of data
        return None

    try:
        # Convert to DataFrame
        df = pd.DataFrame(historical_data, columns=["date", "sales"])
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").reset_index(drop=True)

        # Create features
        features = create_features_for_sales(df["date"])

        # Add lag features
        for lag in [1, 3, 7]:
            if len(df) > lag:
                features[f"lag_{lag}"] = (
                    df["sales"].shift(lag).fillna(df["sales"].mean())
                )

        model = xgb.XGBRegressor(
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

        # Remove any NaN values
        mask = ~features.isna().any(axis=1)
        X_train = features[mask]
        y_train = df["sales"][mask]

        if len(X_train) < 5:
            return None

        model.fit(X_train, y_train)
        return model

    except Exception as e:
        logging.warning(f"Model training failed: {e}")
        return None


def predict_product_sales(
    product_id: int, store_id: int, days_to_predict: int = 15
) -> Optional[List[Tuple[str, float]]]:
    """Optimized prediction function that trains model once and predicts all days"""
    try:
        # Get product info
        product_info = get_product_info(product_id, store_id)
        if not product_info:
            return None

        # Get historical data
        historical_data = get_historical_sales_data(product_id, store_id)

        if len(historical_data) < 14:
            # Not enough data for ML, use simple average
            if len(historical_data) > 0:
                recent_avg = float(
                    np.mean([sales for _, sales in historical_data[-7:]])
                )
                predictions = []
                for i in range(days_to_predict):
                    date = (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d")
                    predictions.append((date, recent_avg))
                return predictions
            return None

        # Train model once
        model = train_sales_prediction_model(historical_data)

        if model is None:
            # Fallback to weighted average
            weights = np.exp(np.linspace(-2, 0, min(14, len(historical_data))))
            weights /= weights.sum()
            recent_sales = [sales for _, sales in historical_data[-14:]]
            weighted_avg = np.dot(weights, recent_sales[-len(weights) :])

            predictions = []
            for i in range(days_to_predict):
                date = (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d")
                predictions.append((date, weighted_avg))
            return predictions

        # Prepare features for all prediction days at once
        future_dates = pd.date_range(
            start=datetime.now().date(), periods=days_to_predict, freq="D"
        )
        future_features = create_features_for_sales(future_dates)

        # Add lag features using the most recent historical data
        recent_sales = [sales for _, sales in historical_data[-7:]]
        avg_recent = np.mean(recent_sales) if recent_sales else 0

        for lag in [1, 3, 7]:
            if f"lag_{lag}" in model.feature_names_in_:
                # Use actual recent data for initial lags
                if lag <= len(recent_sales):
                    future_features[f"lag_{lag}"] = recent_sales[-lag]
                else:
                    future_features[f"lag_{lag}"] = avg_recent

        # Predict all days at once
        predictions_raw = model.predict(future_features)
        predictions_raw = np.maximum(predictions_raw, 0)  # No negative predictions
        # round to 0 decimal places
        predictions_raw = np.round(predictions_raw, 0)

        # Return predictions without stock constraints
        predictions = []
        for i, pred in enumerate(predictions_raw):
            date = future_dates[i].strftime("%Y-%m-%d")
            if float(pred) > 0:
                predictions.append((date, float(pred)))

            # Update lag features for next predictions if needed
            if i < len(predictions_raw) - 1:
                for lag in [1, 3, 7]:
                    if f"lag_{lag}" in future_features.columns and i >= lag - 1:
                        # This is simplified - in production you might want more sophisticated lag updates
                        future_features.loc[
                            future_features.index[i + 1], f"lag_{lag}"
                        ] = pred

        return predictions

    except Exception as e:
        logging.error(f"Prediction failed for product {product_id}: {e}")
        return None


def predict_stock_depletion(
    product_id: int, store_id: int, current_stock: float, days_to_predict: int = 30
) -> Optional[int]:
    """Predict when stock will be depleted considering current stock levels"""
    try:
        # Get historical sales data
        historical_data = get_historical_sales_data(product_id, store_id)

        if len(historical_data) < 7:
            # Not enough data, use simple average from available data
            if len(historical_data) > 0:
                avg_daily_consumption = np.mean([sales for _, sales in historical_data])
                if avg_daily_consumption > 0:
                    days_left = int(current_stock / avg_daily_consumption)
                    return min(days_left, days_to_predict)
            return days_to_predict  # No consumption pattern found

        # Train model for sales prediction
        model = train_sales_prediction_model(historical_data)

        if model is None:
            # Fallback to weighted average
            weights = np.exp(np.linspace(-1, 0, min(7, len(historical_data))))
            weights /= weights.sum()
            recent_sales = [sales for _, sales in historical_data[-7:]]
            avg_consumption = np.dot(weights, recent_sales[-len(weights) :])

            if avg_consumption > 0:
                days_left = int(current_stock / avg_consumption)
                return min(days_left, days_to_predict)
            return days_to_predict

        # Generate predictions and calculate stock depletion
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

        # Predict daily consumption
        daily_predictions = model.predict(future_features)
        daily_predictions = np.maximum(daily_predictions, 0)

        # Calculate when stock runs out
        remaining_stock = current_stock
        for day, consumption in enumerate(daily_predictions, 1):
            remaining_stock -= consumption
            if remaining_stock <= 0:
                return day

        return days_to_predict  # Stock lasts longer than prediction period

    except Exception as e:
        logging.warning(
            f"Stock depletion prediction failed for product {product_id}: {e}"
        )
        return None


def calculate_product_consumption_rate(
    product_id: int, store_id: int, days_back: int = 120
) -> Optional[float]:
    """Calculate daily consumption rate using weighted average of recent sales"""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            cursor.execute(
                """
                SELECT 
                    DATE_TRUNC('day', b.time)::date AS day,
                    SUM(pf.amount) * -1 AS daily_consumption
                FROM products_flow pf
                JOIN bills b ON pf.bill_id = b.id
                WHERE pf.product_id = %s
                AND b.store_id = %s
                AND b.type = 'sell'
                AND pf.amount < 0
                AND b.time >= NOW() - INTERVAL '%s days'
                GROUP BY DATE_TRUNC('day', b.time)::date
                ORDER BY day DESC
                """,
                (product_id, store_id, days_back),
            )

            sales_data = cursor.fetchall()

            if not sales_data:
                return None

            # Convert to pandas for easier calculation
            df = pd.DataFrame(sales_data)
            df["day"] = pd.to_datetime(df["day"])
            df = df.sort_values("day").reset_index(drop=True)

            # Calculate weighted average with more recent days having higher weight
            days_count = len(df)
            if days_count == 0:
                return None

            # Exponential weights - more recent = higher weight
            weights = np.exp(np.linspace(-2, 0, days_count))
            weights = weights / weights.sum()

            # Calculate weighted average
            weighted_avg = np.average(df["daily_consumption"], weights=weights)

            # Apply smoothing based on variance
            variance = np.var(df["daily_consumption"])
            std_dev = np.sqrt(variance)

            # If consumption is very variable, be more conservative
            if std_dev > weighted_avg:
                # Add 20% buffer for high variance products
                weighted_avg *= 1.2

            return max(0, weighted_avg)

    except Exception as e:
        logging.warning(
            f"Error calculating consumption rate for product {product_id}: {e}"
        )
        return None


def calculate_days_until_stockout(
    current_stock: float, daily_consumption: float
) -> int:
    """Calculate days until stock runs out"""
    if daily_consumption <= 0:
        return 999  # No consumption pattern

    days_left = current_stock / daily_consumption
    return max(0, int(np.floor(days_left)))


@router.get("/analytics/alerts")
def alerts(store_id: int):
    """Get alerts for products running low in stock using statistical methods"""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
            # Get all products with recent sales activity (last 90 days)
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
                AND rs.product_id IS NOT NULL  -- Only products with recent sales
                AND pss.total_sold > 0  -- Must have some sales in last 60 days
                ORDER BY pi.stock ASC, p.name
                """,
                (store_id, store_id, store_id),
            )

            products = cursor.fetchall()

        if not products:
            return []

        # Convert to DataFrame for vectorized operations
        import decimal

        def to_float(val):
            if isinstance(val, decimal.Decimal):
                return float(val)
            return val

        # Convert all Decimal fields to float in products
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
            active_days = max(1, row["active_days"])  # Avoid division by zero
            total_sold = float(row["total_sold"])

            # Calculate daily consumption using multiple methods and take the most conservative
            methods = []

            # Method 1: Simple average over active days
            if active_days > 0:
                simple_avg = total_sold / active_days
                methods.append(simple_avg)

            # Method 2: Weighted consumption based on transaction patterns
            if row["avg_per_transaction"] > 0:
                # Estimate frequency and apply to current patterns
                transaction_based = (
                    float(row["avg_per_transaction"]) * 0.8
                )  # Conservative factor
                methods.append(transaction_based)

            # Method 3: Get more detailed calculation if we have enough data
            detailed_rate = calculate_product_consumption_rate(product_id, store_id)
            if detailed_rate is not None:
                methods.append(detailed_rate)

            # Use the median of available methods (more robust than mean)
            if methods:
                daily_consumption = float(np.median(methods))
                # Apply minimum threshold
                daily_consumption = max(
                    0.1, daily_consumption
                )  # At least some consumption
            else:
                daily_consumption = 0.5  # Default conservative estimate

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
):
    """Get daily sales for a specific store"""
    if start_date is None:
        start_date = "2021-01-01"
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if types is None:
        types = ["sell", "return"]

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
                (start_date, end_date, tuple(types), store_id),
            )

            data = cursor.fetchall()
            return data

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
        predictions = predict_product_sales(product_id, store_id, prediction_days)

        if predictions:
            # Add predictions to the data
            for date_str, predicted_value in predictions:
                products_data[product_name].append([date_str, float(predicted_value)])

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
    end_date_obj = parse_date(end_date)
    today = datetime.now()

    logging.info(f"Fetching top products from {start_date} to {end_date_obj}")

    # Check if prediction is needed
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
                (start_date, historical_end_date.strftime("%Y-%m-%d"), store_id),
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
                    start_date,
                    historical_end_date.strftime("%Y-%m-%d"),
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
                products_data[product_name].append([day_str, float(row["total"])])

            # Add predictions if needed
            if is_future_prediction:
                products_data = process_products_data_with_predictions(
                    products_data, product_ids, store_id, end_date_obj, today
                )

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
    end_date_obj = parse_date(end_date)
    today = datetime.now()

    # Check if prediction is needed
    is_future_prediction = end_date_obj.date() > today.date()
    historical_end_date = min(end_date_obj, today - timedelta(days=1))

    try:
        with Database(HOST, DATABASE, USER, PASS) as cursor:
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
                    tuple(products_ids),
                    store_id,
                    start_date,
                    historical_end_date.strftime("%Y-%m-%d"),
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
                products_data[product_name].append([day_str, float(row["total"])])

            # Add predictions if needed
            if is_future_prediction:
                products_data = process_products_data_with_predictions(
                    products_data, products_ids, store_id, end_date_obj, today
                )

            return products_data

    except Exception as e:
        logging.error(f"Error in products endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

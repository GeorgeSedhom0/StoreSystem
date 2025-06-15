import pandas as pd
import numpy as np
import xgboost as xgb
from typing import List, Tuple, Optional, Dict
from datetime import datetime
import logging


BEST_CONFIG = {
    "strategy": "balanced",
    "training_days": 60,
    "feature_type": "basic",
    "lag_features": [1, 7, 14, 28],
    "params": {
        "n_estimators": 300,
        "max_depth": 7,
        "learning_rate": 0.03,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 3,
        "gamma": 0.05,
        "reg_alpha": 0.05,
        "reg_lambda": 1.0,
        "random_state": 42,
        "n_jobs": -1,
    },
}


def create_features_for_sales(dates, feature_type: str = "basic") -> pd.DataFrame:
    features = pd.DataFrame()

    if isinstance(dates, pd.DatetimeIndex):
        features["day_of_week"] = dates.dayofweek
        features["day_of_month"] = dates.day
        features["month"] = dates.month
        features["is_weekend"] = (dates.dayofweek >= 5).astype(int)

        if feature_type == "full":
            features["quarter"] = dates.quarter
            features["week_of_year"] = dates.isocalendar().week
            features["is_month_start"] = dates.is_month_start.astype(int)
            features["is_month_end"] = dates.is_month_end.astype(int)
    else:
        features["day_of_week"] = dates.dt.dayofweek
        features["day_of_month"] = dates.dt.day
        features["month"] = dates.dt.month
        features["is_weekend"] = (dates.dt.dayofweek >= 5).astype(int)

        if feature_type == "full":
            features["quarter"] = dates.dt.quarter
            features["week_of_year"] = dates.dt.isocalendar().week
            features["is_month_start"] = dates.dt.is_month_start.astype(int)
            features["is_month_end"] = dates.dt.is_month_end.astype(int)

    return features


def train_sales_prediction_model(
    historical_data: List[Tuple[datetime, float]],
    days_to_predict: int = 15,
    bill_types: List[str] = ["sell"],
) -> Optional[xgb.XGBRegressor]:
    min_required = max(14, BEST_CONFIG["training_days"] // 3)

    if len(historical_data) < min_required:
        return None

    try:
        df = pd.DataFrame(historical_data, columns=["date", "sales"])
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").reset_index(drop=True)

        if len(df) > BEST_CONFIG["training_days"]:
            df = df.tail(BEST_CONFIG["training_days"]).reset_index(drop=True)

        features = create_features_for_sales(df["date"], BEST_CONFIG["feature_type"])

        for lag in BEST_CONFIG["lag_features"]:
            if len(df) > lag:
                features[f"lag_{lag}"] = (
                    df["sales"].shift(lag).fillna(df["sales"].mean())
                )

        mask = ~features.isna().any(axis=1)
        X_train = features[mask]
        y_train = df["sales"][mask]

        if len(X_train) < 5:
            return None

        model = xgb.XGBRegressor(**BEST_CONFIG["params"])
        model.fit(X_train, y_train)
        return model

    except Exception as e:
        logging.error(f"Error training sales model: {e}")
        return None


def calculate_days_until_stockout(
    current_stock: float, daily_consumption: float
) -> int:
    if daily_consumption <= 0:
        return 999
    days_left = current_stock / daily_consumption
    return max(0, int(np.floor(days_left)))


def predict_product_sales(
    product_id: int,
    store_id: int,
    days_to_predict: int = 15,
    get_product_info=None,
    get_historical_sales_data=None,
) -> Optional[List[Tuple[str, float]]]:
    """
    Predict sales for a product for the next N days using optimal configuration.
    """
    if get_product_info is None or get_historical_sales_data is None:
        raise ValueError(
            "get_product_info and get_historical_sales_data must be provided."
        )

    try:
        product_info = get_product_info(product_id, store_id)
        if not product_info:
            return None

        historical_data = get_historical_sales_data(
            product_id, store_id, BEST_CONFIG["training_days"] + 30
        )

        if len(historical_data) < 14:
            if len(historical_data) > 0:
                recent_avg = float(
                    np.mean([sales for _, sales in historical_data[-7:]])
                )
                predictions = []
                for i in range(days_to_predict):
                    date = (datetime.now() + pd.Timedelta(days=i)).strftime("%Y-%m-%d")
                    predictions.append((date, recent_avg))
                return predictions
            return None

        model = train_sales_prediction_model(historical_data, days_to_predict, ["sell"])

        if model is None:
            weights = np.exp(
                np.linspace(
                    -2, 0, min(BEST_CONFIG["training_days"] // 5, len(historical_data))
                )
            )
            weights /= weights.sum()
            recent_sales = [sales for _, sales in historical_data[-len(weights) :]]
            weighted_avg = np.dot(weights, recent_sales)

            predictions = []
            for i in range(days_to_predict):
                date = (datetime.now() + pd.Timedelta(days=i)).strftime("%Y-%m-%d")
                predictions.append((date, weighted_avg))
            return predictions

        future_dates = pd.date_range(
            start=datetime.now().date(), periods=days_to_predict, freq="D"
        )
        future_features = create_features_for_sales(
            future_dates, BEST_CONFIG["feature_type"]
        )

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
        predictions_raw = np.maximum(predictions_raw, 0)
        predictions_raw = np.round(predictions_raw, 0)

        predictions = []
        for i, pred in enumerate(predictions_raw):
            date = future_dates[i].strftime("%Y-%m-%d")
            predictions.append((date, float(pred)))

            if i < len(predictions_raw) - 1:
                for lag in BEST_CONFIG["lag_features"]:
                    if lag <= i + 1:
                        future_features.loc[
                            future_features.index[i + 1], f"lag_{lag}"
                        ] = pred

        return predictions

    except Exception as e:
        logging.error(f"Error in predict_product_sales: {e}")
        return None


def train_shifts_prediction_model(
    historical_data: List[Dict],
    days_to_predict: int = 15,
    bill_types: List[str] = ["sell"],
):
    """Train XGBoost model for shifts sales prediction with optimal parameters"""
    try:
        if len(historical_data) < 5:
            return None

        df = pd.DataFrame(historical_data)

        if len(df) > BEST_CONFIG["training_days"]:
            df = df.tail(BEST_CONFIG["training_days"]).reset_index(drop=True)

        df = df.sort_values("start_date_time").reset_index(drop=True)
        for lag in BEST_CONFIG["lag_features"]:
            if len(df) > lag:
                df[f"lag_{lag}_total"] = (
                    df["total"].shift(lag).fillna(df["total"].mean())
                )
                df[f"lag_{lag}_duration"] = (
                    df["duration_hours"].shift(lag).fillna(df["duration_hours"].mean())
                )

        feature_cols = [
            "day_of_week",
            "day_of_month",
            "month",
            "duration_hours",
            "is_weekend",
            "start_hour",
            "end_hour",
        ]

        if BEST_CONFIG["feature_type"] == "full":
            df["quarter"] = pd.to_datetime(df["start_date_time"]).dt.quarter
            df["week_of_year"] = (
                pd.to_datetime(df["start_date_time"]).dt.isocalendar().week
            )
            feature_cols.extend(["quarter", "week_of_year"])

        for lag in BEST_CONFIG["lag_features"]:
            if f"lag_{lag}_total" in df.columns:
                feature_cols.extend([f"lag_{lag}_total", f"lag_{lag}_duration"])

        mask = ~df[feature_cols + ["total"]].isna().any(axis=1)
        X_train = df[mask][feature_cols]
        y_train = df[mask]["total"]

        if len(X_train) < 5:
            return None

        model = xgb.XGBRegressor(**BEST_CONFIG["params"])
        model.fit(X_train, y_train)
        return model

    except Exception as e:
        logging.error(f"Error training shifts model: {e}")
        return None


def create_features_for_shifts(
    date,
    duration_hours: int,
    start_hour: int,
    end_hour: int,
    recent_data: pd.DataFrame,
    feature_type: str = "basic",
) -> List[float]:
    """Create features for shifts prediction with optimal feature set"""
    dow = date.weekday()
    is_weekend = 1 if dow >= 5 else 0

    features = [
        dow,
        date.day,
        date.month,
        duration_hours,
        is_weekend,
        start_hour,
        end_hour,
    ]

    if feature_type == "full":
        quarter = (date.month - 1) // 3 + 1
        week_of_year = date.isocalendar().week
        features.extend([quarter, week_of_year])

    for lag in BEST_CONFIG["lag_features"]:
        if len(recent_data) >= lag:
            features.append(recent_data["total"].iloc[-lag])
            features.append(recent_data["duration_hours"].iloc[-lag])
        else:
            features.append(recent_data["total"].mean())
            features.append(recent_data["duration_hours"].mean())

    return features

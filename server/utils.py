from datetime import datetime
from decimal import Decimal
from typing import Union
from fastapi import HTTPException
from dateutil import parser as dateutil_parser


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

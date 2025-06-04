"""
Store System Server Package

A comprehensive retail management system built with FastAPI.
Provides APIs for inventory management, sales tracking, analytics, and more.
"""

__version__ = "1.0.0"
__author__ = "Store System Team"
__description__ = "Store System Server - A comprehensive retail management system"

# Import main components for easier access
from . import main
from . import analytics
from . import auth
from . import employee
from . import installment
from . import parties
from . import settings
from . import utils

__all__ = [
    "main",
    "analytics",
    "auth",
    "employee",
    "installment",
    "parties",
    "settings",
    "utils",
]

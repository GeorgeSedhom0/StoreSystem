import jwt
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import HTTPException, Request, Depends, Cookie
from dotenv import load_dotenv
from os import getenv
import logging
from typing import Optional

load_dotenv()

# PostgreSQL connection details
HOST = getenv("HOST")
DATABASE = getenv("DATABASE")
USER = getenv("USER")
PASS = getenv("PASS")
SECRET = getenv("SECRET") or ""
ALGORITHM = getenv("ALGORITHM") or ""

logger = logging.getLogger(__name__)


class Database:
    "Database context manager to handle the connection and cursor"

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


async def get_current_user(access_token: Optional[str] = Cookie(None)):
    """
    FastAPI dependency to get current user from JWT token

    Args:
        access_token: JWT access token from cookie

    Returns:
        dict: User information

    Raises:
        HTTPException: If token is invalid or user not found
    """
    if not access_token:
        raise HTTPException(status_code=401, detail="No access token provided")

    try:
        # Decode the JWT token
        payload = jwt.decode(access_token, SECRET, algorithms=[ALGORITHM])
        username = payload.get("sub")

        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Get user information from database
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT 
                    users.id,
                    users.username,
                    users.email,
                    users.phone,
                    users.scope_id
                FROM users
                WHERE username = %s
                """,
                (username,),
            )
            user = cur.fetchone()

            if not user:
                raise HTTPException(status_code=401, detail="User not found")

            return dict(user)

    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error("Error getting user from token: %s", e)
        raise HTTPException(status_code=500, detail="Authentication error")


async def get_optional_current_user(access_token: Optional[str] = Cookie(None)):
    """
    FastAPI dependency to optionally get current user (doesn't raise exception if no token)

    Args:
        access_token: JWT access token from cookie

    Returns:
        dict or None: User information or None if not authenticated
    """
    if not access_token:
        return None

    try:
        return await get_current_user(access_token)
    except HTTPException:
        return None


def get_store_info(store_id: int):
    """
    Get store information by store ID

    Args:
        store_id: Store ID

    Returns:
        dict: Store information including name, etc.

    Raises:
        HTTPException: If store not found
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                "SELECT id, name, extra_info FROM store_data WHERE id = %s", (store_id,)
            )
            store = cur.fetchone()

            if not store:
                raise HTTPException(status_code=404, detail="Store not found")

            return dict(store)

    except Exception as e:
        logger.error("Error getting store info: %s", e)
        raise HTTPException(status_code=500, detail="Store lookup error")


# Legacy function for backward compatibility (if needed elsewhere)
def get_user_from_token(access_token: str):
    """
    Legacy function - use get_current_user dependency instead
    """
    import asyncio

    return asyncio.run(get_current_user(access_token))

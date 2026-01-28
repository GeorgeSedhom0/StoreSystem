from fastapi import HTTPException, Depends
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from dotenv import load_dotenv
from os import getenv
from fastapi import APIRouter
from typing import Any, Optional
import json
from auth_middleware import get_current_user

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


@router.get("/scopes")
def get_scopes(current_user: dict = Depends(get_current_user)) -> JSONResponse:
    query = """
    SELECT * FROM scopes
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(query)
            scopes = cur.fetchall()
            return JSONResponse(content=scopes)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/scope")
def add_scope(
    name: str,
    pages: list[int],
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO scopes (name, pages)
                VALUES (%s, %s)
                RETURNING *
                """,
                (name, pages),
            )
            scope = cur.fetchone()
            return JSONResponse(content=scope)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/scope")
def update_scope(
    id: int,
    name: str,
    pages: list[int],
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE scopes
                SET name = %s, pages = %s
                WHERE id = %s
                RETURNING *
                """,
                (name, pages, id),
            )
            scope = cur.fetchone()
            return JSONResponse(content=scope)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/scope")
def delete_scope(
    id: int, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                DELETE FROM scopes
                WHERE id = %s
                RETURNING *
                """,
                (id,),
            )
            scope = cur.fetchone()
            return JSONResponse(content=scope)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/pages")
def get_pages(current_user: dict = Depends(get_current_user)) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM pages")
            pages = cur.fetchall()
            return JSONResponse(content=pages)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/store-data")
def get_store_data(
    store_id: int, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM store_data WHERE id = %s", (store_id,))
            store = cur.fetchone()
            return JSONResponse(content=store)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/admin/stores-data")
def get_stores_data(current_user: dict = Depends(get_current_user)) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM store_data")
            store = cur.fetchall()
            return JSONResponse(content=store)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/store-data")
def update_store_data(
    name: str,
    address: str,
    phone: str,
    store_id: int,
    body: Optional[dict] = None,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        extra_info = body.get("extra_info", {}) if body else {}
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # First get existing extra_info to merge with new values
            cur.execute("SELECT extra_info FROM store_data WHERE id = %s", (store_id,))
            existing = cur.fetchone()
            existing_extra_info = (
                existing["extra_info"]
                if existing and existing.get("extra_info")
                else {}
            )

            # Merge existing with new extra_info (new values override existing)
            merged_extra_info = {**existing_extra_info, **extra_info}

            cur.execute(
                """
                INSERT INTO store_data
                (id, name, address, phone, extra_info)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                address = EXCLUDED.address,
                phone = EXCLUDED.phone,
                extra_info = EXCLUDED.extra_info
                RETURNING *
                """,
                (store_id, name, address, phone, json.dumps(merged_extra_info)),
            )
            store = cur.fetchone()
            return JSONResponse(content=store)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

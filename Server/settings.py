from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from dotenv import load_dotenv
from os import getenv
from fastapi import APIRouter
from typing import Any
import json

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


@router.get("/scopes")
def get_scopes() -> JSONResponse:
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
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO scopes (name, pages)
                VALUES (%s, %s)
                RETURNING *
                """, (name, pages))
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
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE scopes
                SET name = %s, pages = %s
                WHERE id = %s
                RETURNING *
                """, (name, pages, id))
            scope = cur.fetchone()
            return JSONResponse(content=scope)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/scope")
def delete_scope(id: int) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                DELETE FROM scopes
                WHERE id = %s
                RETURNING *
                """, (id, ))
            scope = cur.fetchone()
            return JSONResponse(content=scope)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/pages")
def get_pages() -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM pages")
            pages = cur.fetchall()
            return JSONResponse(content=pages)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/store-data")
def get_store_data() -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM store_data WHERE id = %s", (1, ))
            store = cur.fetchone()
            return JSONResponse(content=store)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/store-data")
def update_store_data(
    name: str,
    address: str,
    phone: str,
    extra_info: dict[str, Any],
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE store_data
                SET name = %s, address = %s, phone = %s, extra_info = %s
                WHERE id = %s
                RETURNING *
                """, (name, address, phone, json.dumps(extra_info), 1))
            store = cur.fetchone()
            return JSONResponse(content=store)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

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



@router.get("/installments")
def get_installments() -> JSONResponse:
    query = """
    SELECT
        installments.id,
        installments.paid,
        COALESCE(assosiated_parties.name, '') AS party_name,
        Json_agg(
            Json_build_object(
                'id', installments_flow.id,
                'amount', installments_flow.amount,
                'time', installments_flow.time
            )
        ) AS flow,
        SUM(products_flow.price * products_flow.amount) AS total
    FROM installments
        JOIN bills ON installments.bill_id = bills.id
        JOIN assosiated_parties ON bills.party_id = assosiated_parties.id
        JOIN installments_flow ON installments.id = installments_flow.installment_id
        JOIN products_flow ON bills.ref_id = products_flow.bill_id
    GROUP BY installments.id, assosiated_parties.name
    """

    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(query)
            return JSONResponse(content=cur.fetchall())
    except psycopg2.Error as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail="Database error") from e
    
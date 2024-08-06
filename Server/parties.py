import bcrypt
from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import Cookie, Form, Depends
from pydantic import BaseModel
from datetime import datetime
import logging
from dotenv import load_dotenv
from os import getenv
from fastapi import APIRouter
from typing import Optional
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

origins = [
    "http://localhost:5173",
]

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s [%(levelname)s] - %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')


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


class Party(BaseModel):
    name: str
    phone: str
    address: str
    type: str
    extra_info: dict


@router.get("/parties")
async def get_parties() -> JSONResponse:
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute("""
        SELECT * FROM assosiated_parties
        """)
        return JSONResponse(content=cur.fetchall())


@router.post("/party")
async def add_party(party: Party) -> JSONResponse:
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
        INSERT INTO assosiated_parties (name, phone, address, type, extra_info)
        VALUES (%s, %s, %s, %s, %s)
        returning id
        """, (party.name, party.phone, party.address, party.type,
              json.dumps(party.extra_info)))
        party_id = cur.fetchone()["id"]
        return JSONResponse(content={
            "message": "Party added successfully!",
            "id": party_id,
        })


@router.delete("/party")
async def delete_party(party_id: int) -> JSONResponse:
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
        DELETE FROM assosiated_parties
        WHERE id = %s
        """, (party_id, ))

        return JSONResponse(content={"message": "Party deleted successfully!"})


@router.put("/party")
async def edit_party(
    party_id: int,
    party: Party,
) -> JSONResponse:
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
        UPDATE assosiated_parties
        SET name = %s, phone = %s, address = %s, type = %s, extra_info = %s
        WHERE id = %s
        """, (party.name, party.phone, party.address, party.type,
              json.dumps(party.extra_info), party_id))
        return JSONResponse(content={"message": "Party updated successfully!"})


@router.get("/party/{party_id}/bills")
async def get_party_bills(
    party_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> JSONResponse:
    """
    Get all bills from the database for a specific party

    Returns:
        List[Dict]: A list of dictionaries containing the bills

    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    bills.ref_id AS id,
                    bills.time,
                    bills.discount,
                    bills.total,
                    bills.type,
                    json_agg(
                        json_build_object(
                            'id', products_flow.product_id,
                            'name', products.name,
                            'bar_code', products.bar_code,
                            'amount', products_flow.amount,
                            'wholesale_price', products_flow.wholesale_price,
                            'price', products_flow.price
                        )
                    ) AS products
                FROM bills
                JOIN products_flow ON bills.ref_id = products_flow.bill_id
                JOIN products ON products_flow.product_id = products.id
                WHERE bills.time >= %s
                AND bills.time <= %s
                AND bills.party_id = %s
                GROUP BY bills.ref_id, bills.time, bills.discount,
                    bills.total, bills.type
                ORDER BY bills.time DESC
                """, (start_date if start_date else "1970-01-01",
                      end_date if end_date else datetime.now().isoformat(),
                      party_id))
            bills = cur.fetchall()
            return bills
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/party/details")
async def get_party_details(party_id: int) -> JSONResponse:
    """
    Get the details of a specific party, total bills, total amount, etc.
    """

    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    assosiated_parties.id,
                    assosiated_parties.name
                FROM assosiated_parties
                WHERE assosiated_parties.id = %s
                """, (party_id, ))
            party = cur.fetchone()

            cur.execute(
                """
                SELECT
                    COUNT(bills.ref_id) AS total_bills,
                    SUM(bills.total) AS total_amount
                FROM bills
                WHERE bills.party_id = %s
                """, (party_id, ))
            details = cur.fetchone()

            cur.execute(
                """
                SELECT
                    SUM(amount) AS total_cash
                FROM cash_flow
                WHERE cash_flow.party_id = %s
                """, (party_id, ))
            cash = cur.fetchone()

            party["total_bills"] = details["total_bills"] if details[
                "total_bills"] else 0
            party["total_amount"] = details["total_amount"] if details[
                "total_amount"] else 0
            party[
                "total_cash"] = cash["total_cash"] if cash["total_cash"] else 0

            return JSONResponse(content=party, status_code=200)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

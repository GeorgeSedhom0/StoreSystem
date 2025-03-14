from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


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
        """,
            (
                party.name,
                party.phone,
                party.address,
                party.type,
                json.dumps(party.extra_info),
            ),
        )
        party_id = cur.fetchone()["id"]
        return JSONResponse(
            content={
                "message": "Party added successfully!",
                "id": party_id,
            }
        )


@router.delete("/party")
async def delete_party(party_id: int) -> JSONResponse:
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute(
            """
        DELETE FROM assosiated_parties
        WHERE id = %s
        """,
            (party_id,),
        )

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
        """,
            (
                party.name,
                party.phone,
                party.address,
                party.type,
                json.dumps(party.extra_info),
                party_id,
            ),
        )
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
                    bills.id,
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
                JOIN products_flow ON bills.id = products_flow.bill_id
                JOIN products ON products_flow.product_id = products.id
                WHERE bills.time >= %s
                AND bills.time <= %s
                AND bills.party_id = %s
                GROUP BY bills.id, bills.time, bills.discount,
                    bills.total, bills.type
                ORDER BY bills.time DESC
                """,
                (
                    start_date if start_date else "1970-01-01",
                    end_date if end_date else datetime.now().isoformat(),
                    party_id,
                ),
            )
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
                """,
                (party_id,),
            )
            party = cur.fetchone()

            cur.execute(
                """
                SELECT
                    COUNT(bills.id) AS total_bills,
                    SUM(bills.total) AS total_amount
                FROM bills
                WHERE bills.party_id = %s
                """,
                (party_id,),
            )
            details = cur.fetchone()

            cur.execute(
                """
                SELECT
                    SUM(amount) AS total_cash
                FROM cash_flow
                WHERE cash_flow.party_id = %s
                """,
                (party_id,),
            )
            cash = cur.fetchone()

            party["total_bills"] = (
                details["total_bills"] if details["total_bills"] else 0
            )
            party["total_amount"] = (
                details["total_amount"] if details["total_amount"] else 0
            )
            party["total_cash"] = cash["total_cash"] if cash["total_cash"] else 0

            return JSONResponse(content=party, status_code=200)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/parties/long-missed")
async def get_long_missed_parties() -> JSONResponse:
    """
    Get all parties that have not made any purchases in the last 1 month
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # First query to get recent party_ids
            recent_bills_query = """
                SELECT DISTINCT ON (party_id) party_id
                FROM bills
                WHERE time >= NOW() - INTERVAL '10 month'
            """
            cur.execute(recent_bills_query)
            recent_party_ids = [row["party_id"] for row in cur.fetchall()]

            # Second query to get all parties
            all_parties_query = """
                SELECT
                    id,
                    name,
                    phone,
                    address,
                    type,
                    extra_info
                FROM assosiated_parties
            """

            cur.execute(all_parties_query)
            all_parties = cur.fetchall()

            # Filter out parties that are in the recent_party_ids list
            long_missed_parties = [
                party for party in all_parties if party["id"] not in recent_party_ids
            ]

            return JSONResponse(content=long_missed_parties, status_code=200)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/parties/bills")
def get_parties_open_bills(
    store_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    party_id: Optional[int] = None,
) -> JSONResponse:
    """
    Get all bills details of parties that have open bills, grouped by collection_id
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Build the query conditions
            extra_condition = ""
            params = [
                start_date if start_date else "1970-01-01",
                end_date if end_date else datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                store_id,
            ]

            if party_id:
                extra_condition = "AND ap.id = %s"
                params.append(party_id)

            # First, get all distinct collections with their party info
            collections_query = f"""
                SELECT DISTINCT 
                    bc.collection_id,
                    ap.id AS party_id,
                    ap.name AS party_name,
                    ap.type AS party_type,
                    bc.is_closed,
                    MIN(b.time) AS first_bill_time,
                    SUM(b.total) AS total_amount
                FROM bills_collections bc
                JOIN bills b ON bc.bill_id = b.id AND bc.store_id = b.store_id
                JOIN assosiated_parties ap ON bc.party_id = ap.id
                WHERE b.time >= %s
                AND b.time <= %s
                AND bc.store_id = %s
                {extra_condition}
                GROUP BY bc.collection_id, ap.id, ap.name, ap.type, bc.is_closed
                ORDER BY ap.name, first_bill_time
            """

            cur.execute(
                collections_query,
                [params[0], params[1], store_id] + ([party_id] if party_id else []),
            )
            collections = cur.fetchall()

            result = []
            for collection in collections:
                collection_id = collection["collection_id"]

                # Get all bills in this collection
                bills_query = """
                    SELECT 
                        b.id,
                        TO_CHAR(b.time, 'YYYY-MM-DD HH24:MI:SS') AS time,
                        b.discount,
                        b.total,
                        b.type
                    FROM bills_collections bc
                    JOIN bills b ON bc.bill_id = b.id AND bc.store_id = b.store_id
                    WHERE bc.collection_id = %s
                    ORDER BY b.time
                """
                cur.execute(bills_query, [collection_id])
                bills = cur.fetchall()

                # Get products for all bills in this collection
                all_bill_products = []
                for bill in bills:
                    bill_id = bill["id"]

                    product_query = """
                        SELECT 
                            pf.product_id AS id,
                            p.name,
                            p.bar_code,
                            pf.amount,
                            pf.wholesale_price,
                            pf.price
                        FROM products_flow pf
                        JOIN products p ON pf.product_id = p.id
                        WHERE pf.bill_id = %s
                        AND pf.store_id = %s
                    """
                    cur.execute(product_query, [bill_id, store_id])
                    products = cur.fetchall()

                    # Ensure total includes discount properly
                    bill_total = bill["total"]
                    bill_discount = bill["discount"] or 0

                    bill_with_products = dict(bill)
                    bill_with_products["products"] = products
                    # Make sure total reflects discount
                    bill_with_products["total"] = bill_total
                    # Ensure discount is not null
                    bill_with_products["discount"] = bill_discount

                    all_bill_products.append(bill_with_products)

                # Create collection record with bills and their products
                collection_record = {
                    "collection_id": str(collection["collection_id"]),
                    "party_id": collection["party_id"],
                    "party_name": collection["party_name"],
                    "party_type": collection["party_type"],
                    "time": str(collection["first_bill_time"]),
                    "total": collection["total_amount"],
                    "is_closed": collection["is_closed"],
                    "bills": all_bill_products,
                }
                result.append(collection_record)
            logging.info(result)
            return JSONResponse(content=result, status_code=200)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


# Update the close-bills endpoint to work with collection_id
@router.post("/parties/close-bills")
def close_party_bills(
    party_id: int,
    store_id: int,
) -> JSONResponse:
    """
    Mark all bills for a party as closed
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            query = """
                UPDATE bills_collections
                SET is_closed = TRUE,
                    closed_at = NOW()
                WHERE party_id = %s
                AND store_id = %s
                AND is_closed = FALSE
                RETURNING collection_id
            """

            cur.execute(query, [party_id, store_id])
            closed_collections = cur.fetchall()

            return JSONResponse(
                content={
                    "message": "Bills closed successfully",
                    "closed_collections_count": len(closed_collections),
                },
                status_code=200,
            )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

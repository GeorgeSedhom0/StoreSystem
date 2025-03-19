from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from dotenv import load_dotenv
from os import getenv
from fastapi import APIRouter
from datetime import datetime

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


@router.get("/installments")
def get_installments(
    store_id: int,
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Fetch installments data
            cur.execute(
                "SELECT id, paid, installments_count, installment_interval FROM installments"
            )
            installments = cur.fetchall()

            # Fetch associated parties' names
            cur.execute("""
                SELECT installments.id, COALESCE(assosiated_parties.name, '') AS party_name
                FROM installments
                LEFT JOIN bills ON installments.bill_id = bills.id
                LEFT JOIN assosiated_parties ON bills.party_id = assosiated_parties.id
                GROUP BY installments.id, assosiated_parties.name
            """)
            parties = cur.fetchall()

            # Fetch installments flow
            cur.execute("""
                SELECT installments.id, Json_agg(
                    Json_build_object(
                        'id', installments_flow.id,
                        'amount', installments_flow.amount,
                        'time', installments_flow.time
                    )
                ) AS flow
                FROM installments
                LEFT JOIN installments_flow ON installments.id = installments_flow.installment_id
                GROUP BY installments.id
            """)
            flows = cur.fetchall()

            # Fetch products flow
            cur.execute(
                """
                SELECT
                    installments.id,
                    SUM(products_flow.price * products_flow.amount) AS total,
                    Json_agg(
                        Json_build_object(
                            'name', products.name,
                            'price', products_flow.price,
                            'amount', products_flow.amount
                        )
                    ) AS products,
                    bills.time AS time
                FROM installments
                LEFT JOIN bills ON installments.bill_id = bills.id
                LEFT JOIN products_flow ON bills.id = products_flow.bill_id
                LEFT JOIN products ON products_flow.product_id = products.id
                WHERE bills.store_id = %s
                GROUP BY installments.id, bills.time
            """,
                (store_id,),
            )
            products = cur.fetchall()

            # Combine all the fetched data
            result = []
            for installment in installments:
                installment_id = installment["id"]
                party = next((p for p in parties if p["id"] == installment_id), None)
                flow = next((f for f in flows if f["id"] == installment_id), None)
                product = next((p for p in products if p["id"] == installment_id), None)

                total_paid = (
                    sum([f["amount"] if f["amount"] else 0 for f in flow["flow"]])
                    if flow
                    else 0
                )
                total_paid += installment["paid"]

                result.append(
                    {
                        "id": installment_id,
                        "paid": installment["paid"],
                        "installment_interval": installment["installment_interval"]
                        if product
                        else "",
                        "installments_count": installment["installments_count"],
                        "time": str(product["time"]) if product else "",
                        "party_name": party["party_name"] if party else "",
                        "flow": flow["flow"] if flow else [],
                        "total": product["total"] if product else 0,
                        "products": product["products"] if product else [],
                        "ended": total_paid >= -product["total"] if product else False,
                    }
                )

            return JSONResponse(content=result)
    except psycopg2.Error as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail="Database error") from e


@router.post("/installments/pay/{installment_id}")
def add_flow(installment_id: int, amount: float) -> JSONResponse:
    query = """
    INSERT INTO installments_flow (installment_id, amount, time)
    VALUES (%s, %s, NOW())
    """

    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(query, (installment_id, amount))
            return JSONResponse(content={"status": "success"})
    except psycopg2.Error as e:
        logging.error(e)
        raise HTTPException(status_code=500, detail="Database error") from e

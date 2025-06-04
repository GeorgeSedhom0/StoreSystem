from fastapi import HTTPException, Depends
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from dotenv import load_dotenv
from os import getenv
from fastapi import APIRouter
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


@router.get("/installments")
def get_installments(
    store_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    query = """
    SELECT
        i.id,
        i.paid,
        i.installments_count,
        i.installment_interval,
        -- Party Name (potentially from any bill linked to the installment)
        (SELECT COALESCE(ap.name, '')
         FROM bills b_party
         JOIN assosiated_parties ap ON b_party.party_id = ap.id
         WHERE b_party.id = i.bill_id
         LIMIT 1) AS party_name,
        -- Installment Flow
        COALESCE(flow_agg.flow, '[]'::json) AS flow,
        -- Product/Bill details *only if* the bill belongs to the target store
        bill_prod_agg.total,
        bill_prod_agg.products,
        bill_prod_agg.time
    FROM installments i
    -- Aggregate installments flow (always needed)
    LEFT JOIN (
        SELECT
            installment_id,
            Json_agg(
                Json_build_object(
                    'id', id,
                    'amount', amount,
                    'time', time::text -- Cast time to text for JSON compatibility
                ) ORDER BY time
            ) AS flow
        FROM installments_flow
        GROUP BY installment_id
    ) AS flow_agg ON i.id = flow_agg.installment_id
    -- Aggregate product/bill details, filtered by store_id
    LEFT JOIN (
        SELECT
            b.id as bill_id,
            SUM(COALESCE(pf.price, 0) * COALESCE(pf.amount, 0)) AS total, -- Handle potential NULLs
            Json_agg(
                Json_build_object(
                    'name', p.name,
                    'price', pf.price,
                    'amount', pf.amount
                )
            ) FILTER (WHERE pf.id IS NOT NULL) AS products, -- Avoid null product entries if no products_flow
            b.time
        FROM bills b
        LEFT JOIN products_flow pf ON b.id = pf.bill_id
        LEFT JOIN products p ON pf.product_id = p.id
        WHERE b.store_id = %s -- Filter here
        GROUP BY b.id, b.time
    ) AS bill_prod_agg ON i.bill_id = bill_prod_agg.bill_id;
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(query, (store_id,))
            all_installments_data = cur.fetchall()

            result = []
            for row in all_installments_data:
                # Ensure flow and products are lists even if NULL/empty in DB
                flow_data = row["flow"] if row["flow"] else []
                # Handle potential string representation of JSON from DB
                if isinstance(flow_data, str):
                    flow_data = json.loads(flow_data)

                product_data = row["products"] if row["products"] else []
                if isinstance(product_data, str):
                    product_data = json.loads(product_data)

                total_paid = row["paid"] or 0
                total_paid += sum(f.get("amount", 0) or 0 for f in flow_data)

                total = row["total"] or 0  # Default to 0 if no matching bill/products
                time_str = (
                    str(row["time"]) if row["time"] else ""
                )  # Default to empty string

                ended = total_paid >= -total if total is not None else False

                result.append(
                    {
                        "id": row["id"],
                        "paid": row["paid"] or 0,
                        "installment_interval": row["installment_interval"],
                        "installments_count": row["installments_count"],
                        "time": time_str,
                        "party_name": row["party_name"] or "",
                        "flow": flow_data,
                        "total": total,
                        "products": product_data,
                        "ended": ended,
                    }
                )

            return JSONResponse(content=result)
    except (psycopg2.Error, json.JSONDecodeError) as e:
        logging.error(f"Error processing installments for store {store_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Database or data processing error"
        ) from e


@router.post("/installments/pay/{installment_id}")
def add_flow(
    installment_id: int, amount: float, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    # Input validation
    if amount <= 0:
        raise HTTPException(
            status_code=400, detail="Payment amount must be greater than zero"
        )

    # Check if installment exists and get its details for validation
    check_query = """
    SELECT 
        i.id,
        i.paid,
        i.bill_id,
        COALESCE(bill_data.total, 0) as total,
        COALESCE(flow_data.total_flow, 0) as total_flow_paid
    FROM installments i
    LEFT JOIN (
        SELECT 
            b.id as bill_id,
            SUM(COALESCE(pf.price, 0) * COALESCE(pf.amount, 0)) AS total
        FROM bills b
        LEFT JOIN products_flow pf ON b.id = pf.bill_id
        WHERE b.id = (SELECT bill_id FROM installments WHERE id = %s)
        GROUP BY b.id
    ) AS bill_data ON i.bill_id = bill_data.bill_id
    LEFT JOIN (
        SELECT 
            installment_id,
            SUM(amount) as total_flow
        FROM installments_flow 
        WHERE installment_id = %s
        GROUP BY installment_id
    ) AS flow_data ON i.id = flow_data.installment_id
    WHERE i.id = %s
    """

    insert_query = """
    INSERT INTO installments_flow (installment_id, amount, time)
    VALUES (%s, %s, NOW())
    """

    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Check installment details
            cur.execute(check_query, (installment_id, installment_id, installment_id))
            installment_data = cur.fetchone()

            if not installment_data:
                raise HTTPException(status_code=404, detail="Installment not found")

            # Calculate remaining amount
            total_bill = abs(installment_data["total"] or 0)
            paid_deposit = installment_data["paid"] or 0
            total_flow_paid = installment_data["total_flow_paid"] or 0
            total_paid = paid_deposit + total_flow_paid
            remaining_amount = total_bill - total_paid

            # Validate payment amount doesn't exceed remaining
            if amount > remaining_amount + 0.01:  # Small tolerance for floating point
                raise HTTPException(
                    status_code=400,
                    detail=f"Payment amount ({amount:.2f}) exceeds remaining amount ({remaining_amount:.2f})",
                )

            # Insert the payment
            cur.execute(insert_query, (installment_id, amount))
            return JSONResponse(
                content={
                    "status": "success",
                    "message": "Payment recorded successfully",
                    "payment_amount": amount,
                    "remaining_amount": max(0, remaining_amount - amount),
                }
            )

    except psycopg2.Error as e:
        logging.error(f"Database error in payment processing: {e}")
        raise HTTPException(
            status_code=500, detail="Database error during payment processing"
        ) from e

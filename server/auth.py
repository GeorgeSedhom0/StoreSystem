import bcrypt
from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import Cookie, Form, Depends
from datetime import datetime
import logging
from dotenv import load_dotenv
from os import getenv
import jwt
from fastapi import APIRouter
from auth_middleware import get_current_user, get_store_info
from whatsapp_utils import (
    send_due_installments_notification_background,
    send_shift_closure_notification_background,
)
from fastapi import BackgroundTasks

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


@router.get("/profile")
def get_user_profile(user: dict = Depends(get_current_user)) -> JSONResponse:
    """
    Get the user profile
    """
    try:
        store = get_store_info(1)  # Default store ID

        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    ARRAY_AGG(pages.name) AS pages,
                    ARRAY_AGG(pages.path) AS paths
                FROM users
                JOIN scopes ON users.scope_id = scopes.id
                JOIN pages ON pages.id = ANY(scopes.pages)
                WHERE username = %s
                GROUP BY username
                """,
                (user["username"],),
            )
            user_pages = cur.fetchone()
            if user_pages:
                user.update(user_pages)

            cur.execute("SELECT * FROM shifts WHERE current = True")
            shift = cur.fetchone()
            if not shift:
                raise HTTPException(status_code=401, detail="Shift not started")

            return JSONResponse(content={"user": user, "store": store})
    except Exception as e:
        logging.error("Error: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/login")
def auth_user(
    store_id: int,
    username: str = Form(...),
    password: str = Form(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> JSONResponse:
    """
    Authenticate the user and start a new shift if not already started
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM users WHERE username = %s", (username,))
            user = cur.fetchone()

            if user is None:
                return JSONResponse(
                    content={"error": "Incorrect username"}, status_code=401
                )

            if bcrypt.checkpw(
                password.encode("utf-8"),
                user["password"].encode("utf-8"),
            ):
                access_token = jwt.encode(
                    {"sub": username}, SECRET, algorithm=ALGORITHM
                )
                del user["password"]
                response = JSONResponse(
                    {"message": "Logged in successfully", "user": user}
                )

                response.set_cookie(
                    key="access_token",
                    value=access_token,
                    httponly=True,
                    samesite="none",
                    secure=True,
                )

                # Start a new shift
                cur.execute(
                    """
                    SELECT start_date_time, user_id FROM shifts
                    WHERE current = True AND store_id = %s
                    """,
                    (store_id,),
                )
                cur_shift = cur.fetchone()

                if cur_shift:
                    return response

                # Get store name for notification
                cur.execute("SELECT name FROM store_data WHERE id = %s", (store_id,))
                store_result = cur.fetchone()
                store_name = store_result["name"] if store_result else None

                cur.execute(
                    """
                    INSERT INTO shifts (start_date_time, current, user_id, store_id)
                    VALUES (%s, %s, %s, %s)
                    RETURNING start_date_time
                    """,
                    (datetime.now(), True, user["id"], store_id),
                )

                # Send due installments notification as background task
                background_tasks.add_task(
                    send_due_installments_notification_background,
                    store_id,
                    store_name,
                    username,
                )

                return response

            else:
                return JSONResponse(
                    content={"error": "Incorrect password"}, status_code=401
                )
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/logout")
def logout_user(
    store_id: int,
    access_token=Cookie(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> JSONResponse:
    """
    Logout the user and end the current shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get the user from the access token
            payload = jwt.decode(access_token, SECRET, algorithms=[ALGORITHM])
            username = payload.get("sub")

            cur.execute("SELECT * FROM users WHERE username = %s", (username,))
            user = cur.fetchone()

            if user is None:
                return JSONResponse(
                    content={"error": "User not found"}, status_code=401
                )

            # Get shift details and financial summary before closing
            cur.execute(
                """
                SELECT start_date_time FROM shifts
                WHERE current = True AND store_id = %s
                """,
                (store_id,),
            )
            current_shift = cur.fetchone()

            shift_start_time = None
            if current_shift:
                shift_start_time = current_shift["start_date_time"].isoformat()

                # Get shift financial summary
                cur.execute(
                    """
                    SELECT type, COALESCE(SUM(total), 0) AS total, COUNT(*) as count
                    FROM bills
                    WHERE time >= %s
                    AND bills.store_id = %s
                    GROUP BY type
                    """,
                    (current_shift["start_date_time"], store_id),
                )
                bill_data = cur.fetchall()

                # Get cash flow data
                cur.execute(
                    """
                    SELECT 
                        type,
                        COALESCE(SUM(amount), 0) AS total
                    FROM cash_flow
                    WHERE time >= %s
                    AND store_id = %s
                    GROUP BY type
                    """,
                    (current_shift["start_date_time"], store_id),
                )
                cash_flow_data = cur.fetchall()

                # Get store name for notification
                cur.execute("SELECT name FROM store_data WHERE id = %s", (store_id,))
                store_result = cur.fetchone()
                store_name = store_result["name"] if store_result else None

                # Process bill totals
                totals = {
                    "sell_total": 0,
                    "buy_total": 0,
                    "return_total": 0,
                    "installment_total": 0,
                    "transaction_count": 0,
                }

                for row in bill_data:
                    if row["type"] == "sell":
                        totals["sell_total"] += row["total"]
                    elif row["type"] == "buy":
                        totals["buy_total"] += row["total"]
                    elif row["type"] == "return":
                        totals["return_total"] += row["total"]
                    elif row["type"] == "installment":
                        totals["installment_total"] += row["total"]
                    totals["transaction_count"] += row["count"]

                # Process cash flow
                cash_in = 0
                cash_out = 0
                for row in cash_flow_data:
                    if row["type"] == "in":
                        cash_in += row["total"]
                    elif row["type"] == "out":
                        cash_out += abs(row["total"])

                net_cash_flow = cash_in - cash_out

                shift_data = {
                    **totals,
                    "cash_in": cash_in,
                    "cash_out": cash_out,
                    "net_cash_flow": net_cash_flow,
                }

                # Send shift closure notification as background task
                background_tasks.add_task(
                    send_shift_closure_notification_background,
                    store_id,
                    shift_data,
                    store_name,
                    username,
                    shift_start_time,
                )

            # End the current shift
            cur.execute(
                """
                UPDATE shifts
                SET end_date_time = %s, current = False
                WHERE current = True AND store_id = %s
                """,
                (datetime.now(), store_id),
            )

            response = JSONResponse(content={"message": "Logged out successfully"})
            response.delete_cookie(key="access_token")
            return response

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/switch")
def switch_store(access_token=Cookie()) -> JSONResponse:
    """
    Same as logout but without ending the shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get the user from the access token
            payload = jwt.decode(access_token, SECRET, algorithms=[ALGORITHM])
            username = payload.get("sub")

            cur.execute("SELECT * FROM users WHERE username = %s", (username,))
            user = cur.fetchone()

            if user is None:
                return JSONResponse(
                    content={"error": "User not found"}, status_code=401
                )

            response = JSONResponse(content={"message": "Switched successfully"})
            response.delete_cookie(key="access_token")
            return response

    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/signup")
def add_user(
    username: str = Form(...),
    password: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    scope_id: int = Form(...),
) -> JSONResponse:
    """
    Add a user
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            hashed_password = bcrypt.hashpw(
                password.encode("utf-8"),
                bcrypt.gensalt(),
            ).decode("utf-8")
            cur.execute(
                """
                INSERT INTO users (
                    username, password, email, phone, scope_id
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (username, hashed_password, email, phone, scope_id),
            )
            user = cur.fetchone()
            return JSONResponse(content=user)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/users")
def get_users(current_user: dict = Depends(get_current_user)) -> JSONResponse:
    """
    Get all users
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM users")
            users = cur.fetchall()
            for user in users:
                del user["password"]
            return JSONResponse(content=users)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/user")
def update_user(
    username: str = Form(...),
    password: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    scope_id: int = Form(...),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Update a user
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            hashed_password = bcrypt.hashpw(
                password.encode("utf-8"),
                bcrypt.gensalt(),
            ).decode("utf-8")
            cur.execute(
                """
                UPDATE users
                SET password = %s, email = %s, phone = %s, scope_id = %s
                WHERE username = %s
                RETURNING *
                """,
                (hashed_password, email, phone, scope_id, username),
            )
            user = cur.fetchone()

            cur.execute(
                """
                UPDATE users
                SET username = %s
                WHERE id = %s
                """,
                (username, user["id"]),
            )

            return JSONResponse(content=user)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

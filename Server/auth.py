import bcrypt
from fastapi import HTTPException
from fastapi.responses import JSONResponse
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import Cookie, Form
from datetime import datetime
import logging
from dotenv import load_dotenv
from os import getenv
import jwt
from fastapi import APIRouter

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


@router.get("/profile")
def get_user_profile(access_token=Cookie()) -> JSONResponse:
    """
    Get the user profile
    """
    try:
        user = jwt.decode(access_token, SECRET, algorithms=[ALGORITHM])
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT
                    username,
                    ARRAY_AGG(pages.name) AS pages,
                    ARRAY_AGG(pages.path) AS paths
                FROM users
                JOIN scopes ON users.scope_id = scopes.id
                JOIN pages ON pages.id = ANY(scopes.pages)
                WHERE username = %s
                GROUP BY username
                """, (user["sub"], ))
            user = cur.fetchone()
            cur.execute("SELECT * FROM store_data WHERE id = %s", (1, ))
            store = cur.fetchone()
            cur.execute("SELECT * FROM shifts WHERE current = True")
            shift = cur.fetchone()
            if not shift:
                raise HTTPException(status_code=401,
                                    detail="Shift not started")
            return JSONResponse(content={"user": user, "store": store})
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/login")
def auth_user(
        username: str = Form(...),
        password: str = Form(...),
) -> JSONResponse:
    """
    Authenticate the user and start a new shift if not already started
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM users WHERE username = %s",
                        (username, ))
            user = cur.fetchone()

            if user is None:
                return JSONResponse(content={"error": "Incorrect username"},
                                    status_code=401)

            if bcrypt.checkpw(
                    password.encode('utf-8'),
                    user["password"].encode('utf-8'),
            ):
                access_token = jwt.encode({"sub": username},
                                          SECRET,
                                          algorithm=ALGORITHM)
                del user["password"]
                response = JSONResponse({
                    "message": "Logged in successfully",
                    "user": user
                })

                response.set_cookie(
                    key="access_token",
                    value=access_token,
                    httponly=True,
                    samesite="strict",
                    secure=False,
                )

                # Start a new shift
                cur.execute(
                    """
                    SELECT start_date_time, "user" FROM shifts
                    WHERE current = True
                    """, (user['id'], ))
                cur_shift = cur.fetchone()

                if cur_shift:
                    return response

                cur.execute(
                    """
                    INSERT INTO shifts (start_date_time, current, "user")
                    VALUES (%s, %s, %s)
                    RETURNING start_date_time
                    """, (datetime.now(), True, user['id']))
                return response

            else:
                return JSONResponse(content={"error": "Incorrect password"},
                                    status_code=401)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/logout")
def logout_user(access_token=Cookie()) -> JSONResponse:
    """
    Logout the user and end the current shift
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Get the user from the access token
            payload = jwt.decode(access_token, SECRET, algorithms=[ALGORITHM])
            username = payload.get('sub')

            cur.execute("SELECT * FROM users WHERE username = %s",
                        (username, ))
            user = cur.fetchone()

            if user is None:
                return JSONResponse(content={"error": "User not found"},
                                    status_code=401)

            # End the current shift
            cur.execute(
                """
                UPDATE shifts
                SET end_date_time = %s, current = False
                WHERE current = True AND "user" = %s
                """, (datetime.now(), user['id']))
            response = JSONResponse(
                content={"message": "Logged out successfully"})
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
            username = payload.get('sub')

            cur.execute("SELECT * FROM users WHERE username = %s",
                        (username, ))
            user = cur.fetchone()

            if user is None:
                return JSONResponse(content={"error": "User not found"},
                                    status_code=401)

            response = JSONResponse(
                content={"message": "Switched successfully"})
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
                password.encode('utf-8'),
                bcrypt.gensalt(),
            ).decode('utf-8')
            cur.execute(
                """
                INSERT INTO users (
                    username, password, email, phone, scope_id
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """, (username, hashed_password, email, phone, scope_id))
            user = cur.fetchone()
            return JSONResponse(content=user)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

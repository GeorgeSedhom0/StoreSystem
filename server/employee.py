import psycopg2
import logging
from os import getenv
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from psycopg2.extras import RealDictCursor
from fastapi import HTTPException, APIRouter, Form, Depends
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


class EmployeeBase(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    salary: float
    started_on: datetime
    stopped_on: Optional[datetime] = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(EmployeeBase):
    pass


class Employee(EmployeeBase):
    id: int

    class Config:
        from_attributes = True


router = APIRouter()


@router.post("/employees")
def add_employee(
    employee: EmployeeBase,
    store_id: int,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """
    Add a new employee
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO employee
                    (name, phone, address, salary, started_on, stopped_on, store_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    employee.name,
                    employee.phone,
                    employee.address,
                    employee.salary,
                    employee.started_on,
                    employee.stopped_on,
                    store_id,
                ),
            )
            new_employee = cur.fetchone()
            if new_employee:
                # Convert datetime to ISO string for JSON serialization
                employee_dict = dict(new_employee)
                if employee_dict.get("started_on"):
                    employee_dict["started_on"] = employee_dict[
                        "started_on"
                    ].isoformat()
                if employee_dict.get("stopped_on"):
                    employee_dict["stopped_on"] = employee_dict[
                        "stopped_on"
                    ].isoformat()
                return JSONResponse(content=employee_dict)
            else:
                raise HTTPException(status_code=400, detail="Employee not added")
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/employees")
def get_employees(
    store_id: int, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """
    Get all employees with started_on as ISO formatted string
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
            SELECT
                id, name, phone, address, salary,
                to_char(started_on, 'YYYY-MM-DD"T"HH24:MI:SS') as started_on,
                to_char(stopped_on, 'YYYY-MM-DD"T"HH24:MI:SS') as stopped_on
            FROM employee
            WHERE store_id = %s
            """,
                (store_id,),
            )
            employees = cur.fetchall()

            return JSONResponse(content=employees)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    employee: EmployeeUpdate,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE employee SET
                    name = %s,
                    phone = %s,
                    address = %s,
                    salary = %s,
                    started_on = %s,
                    stopped_on = %s
                WHERE id = %s
                RETURNING id
            """,
                (
                    employee.name,
                    employee.phone,
                    employee.address,
                    employee.salary,
                    employee.started_on,
                    employee.stopped_on,
                    employee_id,
                ),
            )

            updated_employee = cur.fetchone()
            if updated_employee:
                return JSONResponse(content={"status": "success"})
            else:
                raise HTTPException(status_code=404, detail="Employee not found")
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: int, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE employee SET stopped_on = NOW()
                WHERE id = %s RETURNING id
                """,
                (employee_id,),
            )
            deleted_employee = cur.fetchone()
            if deleted_employee:
                return JSONResponse(content={"status": "success"})
            else:
                raise HTTPException(status_code=404, detail="Employee not found")
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/employees/{employee_id}/pay-salary")
def pay_salary(
    employee_id: int,
    bonus: float = Form(...),
    deductions: float = Form(...),
    month: int = Form(...),
    time: datetime = Form(...),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT salary FROM employee WHERE id = %s
                """,
                (employee_id,),
            )
            salary = cur.fetchone()
            if not salary:
                raise HTTPException(status_code=404, detail="Employee not found")
            salary = salary["salary"]

            cur.execute(
                """
                INSERT INTO salaries
                    (employee_id, amount, bonus, deductions, time)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (employee_id, salary, bonus, deductions, time),
            )
            salary_id = cur.fetchone()
            if salary_id:
                return JSONResponse(content={"status": "success"})
            else:
                raise HTTPException(status_code=404, detail="Salary not paid")
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

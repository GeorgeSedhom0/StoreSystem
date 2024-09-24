import psycopg2
import logging
from os import getenv
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from psycopg2.extras import RealDictCursor
from fastapi import HTTPException, APIRouter, Form

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
        orm_mode = True


router = APIRouter()


@router.post("/employees")
def add_employee(employee: EmployeeBase) -> JSONResponse:
    """
    Add a new employee
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                INSERT INTO employee (name, phone, address, salary, started_on, stopped_on)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, name, phone, address, salary, started_on, stopped_on
                """, (employee.name, employee.phone, employee.address, employee.salary, employee.started_on, employee.stopped_on))
            # employee = cur.fetchone()
            return JSONResponse(content={"status": "success"})
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/employees")
def get_employees() -> JSONResponse:
    """
    Get all employees with started_on as ISO formatted string
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""
            SELECT
                id, name, phone, address, salary, 
                to_char(started_on, 'YYYY-MM-DD"T"HH24:MI:SS') as started_on,
                to_char(stopped_on, 'YYYY-MM-DD"T"HH24:MI:SS') as stopped_on
            FROM employee
            """)
            employees = cur.fetchall()

            return JSONResponse(content=employees)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/employees/{employee_id}")
def update_employee(employee_id: int, employee: EmployeeUpdate)-> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE employee
                SET name = %s, phone = %s, address = %s, salary = %s, started_on = %s, stopped_on = %s
                WHERE id = %s RETURNING id
            """, (employee.name, employee.phone, employee.address,
                  employee.salary, employee.started_on, employee.stopped_on,
                  employee_id))
            updated_employee = cur.fetchone()
            if updated_employee:
                return JSONResponse(content={"status": "success"})
            else:
                raise HTTPException(status_code=404, detail="Employee not found")
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/employees/{employee_id}")
def delete_employee(employee_id: int)-> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("DELETE FROM employee WHERE id = %s RETURNING id",
                        (employee_id, ))
            deleted_employee = cur.fetchone()
            if deleted_employee:
                return JSONResponse(content={"status": "success"})
            else:
                raise HTTPException(status_code=404, detail="Employee not found")
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

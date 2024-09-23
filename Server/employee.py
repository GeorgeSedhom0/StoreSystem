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

# Initialize router
router = APIRouter()

# Add employee
@router.post("/employees")
def add_employee(
        name: str = Form(...),
        phone: Optional[str] = Form(...),
        address: Optional[str] = Form(...),
        salary: float = Form(...),
        started_on: datetime = Form(...),
        stopped_on: Optional[datetime] = Form(None)
) -> JSONResponse:
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
                """,
                (name, phone, address, salary, started_on, stopped_on)
            )
            employee = cur.fetchone()
            return JSONResponse(content={"status": "success"})
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e

# Get all employee
@router.get("/employees")
def get_employees() -> JSONResponse:
    """
    Get all employees with started_on as ISO formatted string
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("SELECT * FROM employee")
            employees = cur.fetchall()
            
            # Convert datetime fields to strings
            for employee in employees:
                if isinstance(employee['started_on'], datetime):
                    employee['started_on'] = employee['started_on'].isoformat()
                if employee['stopped_on'] and isinstance(employee['stopped_on'], datetime):
                    employee['stopped_on'] = employee['stopped_on'].isoformat()

            return JSONResponse(content=employees)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e


# Get employee by id
@router.get("/employees/{employee_id}", response_model=Employee)
def read_employee(employee_id: int):
    with Database(HOST, DATABASE, USER, PASS) as cur:
        cur.execute("SELECT id, name, phone, address, salary, started_on, stopped_on FROM employee WHERE id = %s", (employee_id,))
        employee = cur.fetchone()
        if employee:
            return Employee(**employee)
    raise HTTPException(status_code=404, detail="Employee not found")


# Update employee
@router.put("/employees/{employee_id}", response_model=Employee)
def update_employee(employee_id: int, employee: EmployeeUpdate):
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("""
                UPDATE employee
                SET name = %s, phone = %s, address = %s, salary = %s, started_on = %s, stopped_on = %s
                WHERE id = %s RETURNING id, name, phone, address, salary, started_on, stopped_on
            """, (employee.name, employee.phone, employee.address, employee.salary, employee.started_on, employee.stopped_on, employee_id))
            updated_employee = cur.fetchone()
            if updated_employee:
                return Employee(**updated_employee)
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=404, detail="Employee not found") from e

# Delete employee
@router.delete("/employees/{employee_id}")
def delete_employee(employee_id: int):
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute("DELETE FROM employee WHERE id = %s RETURNING id", (employee_id,))
            deleted_employee = cur.fetchone()
            if deleted_employee:
                return JSONResponse(content={"status": "success"})
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=404, detail="Employee not found") from e
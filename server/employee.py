import json
import psycopg2
import logging
from os import getenv
from datetime import date, datetime
from typing import List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from psycopg2.extras import Json, RealDictCursor
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


PAY_TYPES = ("monthly", "daily", "hourly")


class EmployeeBase(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    salary: float
    started_on: datetime
    stopped_on: Optional[datetime] = None
    # v26 attendance fields. Optional: omitted ⇒ DB default on create,
    # unchanged on update.
    pay_type: Optional[str] = None
    off_days: Optional[List[int]] = None
    daily_hours: Optional[float] = None
    shift_start: Optional[str] = None  # 'HH:MM' or null
    track_attendance: Optional[bool] = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(EmployeeBase):
    pass


router = APIRouter()


def _validate(employee: EmployeeBase) -> dict:
    """Validate the v26 fields that were sent; returns {column: value}."""
    sent = employee.model_fields_set
    out: dict = {}
    if not (employee.name or "").strip():
        raise HTTPException(status_code=400, detail="اسم الموظف مطلوب")
    if employee.salary is None or employee.salary < 0:
        raise HTTPException(status_code=400, detail="الراتب غير صحيح")
    if "pay_type" in sent and employee.pay_type is not None:
        if employee.pay_type not in PAY_TYPES:
            raise HTTPException(status_code=400, detail="نوع الراتب غير صحيح")
        out["pay_type"] = employee.pay_type
    if "off_days" in sent and employee.off_days is not None:
        if any(d not in range(7) for d in employee.off_days):
            raise HTTPException(status_code=400, detail="أيام الإجازة غير صحيحة")
        if len(set(employee.off_days)) >= 7:
            raise HTTPException(
                status_code=400, detail="لا يمكن أن تكون كل أيام الأسبوع إجازة"
            )
        out["off_days"] = sorted(set(employee.off_days))
    if "daily_hours" in sent and employee.daily_hours is not None:
        if not 0 < employee.daily_hours <= 24:
            raise HTTPException(
                status_code=400, detail="ساعات العمل اليومية يجب أن تكون بين 0 و 24"
            )
        out["daily_hours"] = employee.daily_hours
    if "shift_start" in sent:
        v = (employee.shift_start or "").strip()
        if v:
            try:
                parts = v.split(":")
                h = int(parts[0])
                m = int(parts[1]) if len(parts) > 1 else 0
                if not (0 <= h < 24 and 0 <= m < 60):
                    raise ValueError
            except (ValueError, IndexError) as e:
                raise HTTPException(
                    status_code=400, detail="موعد بداية الوردية غير صحيح"
                ) from e
            out["shift_start"] = f"{h:02d}:{m:02d}"
        else:
            out["shift_start"] = None
    if "track_attendance" in sent and employee.track_attendance is not None:
        out["track_attendance"] = bool(employee.track_attendance)
    return out


EMPLOYEE_COLUMNS = """
    e.id, e.name, e.phone, e.address, e.salary,
    to_char(e.started_on, 'YYYY-MM-DD"T"HH24:MI:SS') AS started_on,
    to_char(e.stopped_on, 'YYYY-MM-DD"T"HH24:MI:SS') AS stopped_on,
    e.pay_type, e.off_days, e.daily_hours,
    to_char(e.shift_start, 'HH24:MI') AS shift_start,
    e.track_attendance
"""


def _http_error(e: Exception):
    if isinstance(e, HTTPException):
        raise e
    logging.error(f"Error: {e}")
    raise HTTPException(status_code=400, detail=str(e)) from e


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
        extra = _validate(employee)
        cols = [
            "name",
            "phone",
            "address",
            "salary",
            "started_on",
            "stopped_on",
            "store_id",
        ]
        vals = [
            employee.name.strip(),
            employee.phone,
            employee.address,
            employee.salary,
            employee.started_on,
            employee.stopped_on,
            store_id,
        ]
        for k, v in extra.items():
            cols.append(k)
            vals.append(v)
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                f"""
                INSERT INTO employee ({", ".join(cols)})
                VALUES ({", ".join(["%s"] * len(cols))})
                RETURNING id
                """,
                vals,
            )
            new_id = cur.fetchone()["id"]
            cur.execute(
                f"SELECT {EMPLOYEE_COLUMNS} FROM employee e WHERE e.id = %s",
                (new_id,),
            )
            return JSONResponse(content=cur.fetchone())
    except Exception as e:
        _http_error(e)


@router.get("/employees")
def get_employees(
    store_id: int, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    """
    All employees of the store (active first), timestamps as ISO strings, plus
    the end of the last paid salary period (``last_paid_end``).
    """
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                f"""
            SELECT {EMPLOYEE_COLUMNS},
                (SELECT to_char(MAX(s.period_end), 'YYYY-MM-DD')
                   FROM salaries s WHERE s.employee_id = e.id) AS last_paid_end,
                (SELECT to_char(MAX(s.time), 'YYYY-MM-DD"T"HH24:MI:SS')
                   FROM salaries s WHERE s.employee_id = e.id) AS last_paid_at
            FROM employee e
            WHERE e.store_id = %s
            ORDER BY (e.stopped_on IS NOT NULL), e.name, e.id
            """,
                (store_id,),
            )
            employees = cur.fetchall()

            return JSONResponse(content=employees)
    except Exception as e:
        _http_error(e)


@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    employee: EmployeeUpdate,
    store_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Update an employee. Fields that are not sent (the v26 fields and
    ``stopped_on``) are left unchanged; send ``stopped_on: null`` explicitly to
    re-hire an employee whose employment was ended."""
    try:
        extra = _validate(employee)
        sets = [
            "name = %s",
            "phone = %s",
            "address = %s",
            "salary = %s",
            "started_on = %s",
        ]
        vals: list = [
            employee.name.strip(),
            employee.phone,
            employee.address,
            employee.salary,
            employee.started_on,
        ]
        if "stopped_on" in employee.model_fields_set:
            sets.append("stopped_on = %s")
            vals.append(employee.stopped_on)
        for k, v in extra.items():
            sets.append(f"{k} = %s")
            vals.append(v)
        vals.append(employee_id)
        where = "id = %s"
        if store_id is not None:
            where += " AND store_id = %s"
            vals.append(store_id)
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                f"UPDATE employee SET {', '.join(sets)} WHERE {where} RETURNING id",
                vals,
            )

            updated_employee = cur.fetchone()
            if updated_employee:
                return JSONResponse(content={"status": "success"})
            else:
                raise HTTPException(status_code=404, detail="الموظف غير موجود")
    except Exception as e:
        _http_error(e)


@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    store_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """End employment (soft): stopped_on = now. History is kept."""
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                UPDATE employee SET stopped_on = NOW()
                WHERE id = %s AND (%s::BIGINT IS NULL OR store_id = %s::BIGINT)
                RETURNING id
                """,
                (employee_id, store_id, store_id),
            )
            deleted_employee = cur.fetchone()
            if deleted_employee:
                return JSONResponse(content={"status": "success"})
            else:
                raise HTTPException(status_code=404, detail="الموظف غير موجود")
    except Exception as e:
        _http_error(e)


@router.post("/employees/{employee_id}/pay-salary")
def pay_salary(
    employee_id: int,
    bonus: float = Form(0),
    deductions: float = Form(0),
    month: Optional[int] = Form(None),  # legacy field, unused
    time: datetime = Form(...),
    payment_method_id: Optional[int] = Form(None),
    amount: Optional[float] = Form(None),
    period_start: Optional[date] = Form(None),
    period_end: Optional[date] = Form(None),
    details: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    store_id: Optional[int] = Form(None),
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Pay a salary. ``amount`` defaults to the employee's salary (legacy
    behaviour); ``time`` is the actual payment datetime. The cash_flow row is
    written by the ``insert_cash_flow_after_insert_salary`` trigger."""
    try:
        if bonus < 0 or deductions < 0 or (amount is not None and amount < 0):
            raise HTTPException(
                status_code=400, detail="المبالغ لا يمكن أن تكون سالبة"
            )
        if period_start and period_end and period_end < period_start:
            raise HTTPException(status_code=400, detail="نهاية الفترة قبل بدايتها")
        if period_end and not period_start:
            period_start = period_end
        if period_start and not period_end:
            period_end = period_start
        details_json = None
        if details:
            try:
                details_json = json.loads(details)
            except ValueError as e:
                raise HTTPException(
                    status_code=400, detail="تفاصيل الراتب غير صحيحة"
                ) from e
        note = (note or "").strip() or None
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT salary, store_id FROM employee WHERE id = %s
                """,
                (employee_id,),
            )
            row = cur.fetchone()
            if not row or (store_id is not None and row["store_id"] != store_id):
                raise HTTPException(status_code=404, detail="الموظف غير موجود")
            if amount is None:
                amount = row["salary"] or 0
            if amount + bonus - deductions < 0:
                raise HTTPException(
                    status_code=400, detail="صافي الراتب لا يمكن أن يكون سالبًا"
                )

            cur.execute(
                """
                INSERT INTO salaries
                    (employee_id, amount, bonus, deductions, time,
                     payment_method_id, period_start, period_end, details, note)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    employee_id,
                    round(amount, 2),
                    round(bonus, 2),
                    round(deductions, 2),
                    time.replace(tzinfo=None),
                    payment_method_id,
                    period_start,
                    period_end,
                    Json(details_json) if details_json is not None else None,
                    note,
                ),
            )
            salary_id = cur.fetchone()
            if salary_id:
                return JSONResponse(
                    content={"status": "success", "id": salary_id["id"]}
                )
            else:
                raise HTTPException(status_code=400, detail="لم يتم دفع الراتب")
    except Exception as e:
        _http_error(e)

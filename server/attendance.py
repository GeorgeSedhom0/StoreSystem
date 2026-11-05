"""Attendance & salary calculation (v26). See docs/specs/v26-packages-attendance-payments-mobile.md §2.

- Store settings live in ``store_data.extra_info.attendance``.
- ``employee_attendance`` holds one row per employee per day (no row = "unmarked").
- ``compute_salary`` is a pure function (no DB) used by ``/employees/{id}/salary-preview``.
"""

import calendar
import json
import logging
from datetime import date, datetime, time, timedelta
from clock import local_now
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth_middleware import get_current_user
from employee import DATABASE, HOST, PASS, USER, Database

router = APIRouter()

STATUSES = ("present", "absent", "half", "leave")
PAY_TYPES = ("monthly", "daily", "hourly")

DEFAULT_SETTINGS: Dict[str, Any] = {
    "unmarked_as": "present",
    "day_rate_basis": "calendar30",
    "late_deduction": False,
    "late_grace_minutes": 15,
    "overtime_pay": False,
    "overtime_multiplier": 1.5,
}

MAX_RANGE_DAYS = 400

AR_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]


# ---------------------------------------------------------------------------
# Small parsing helpers
# ---------------------------------------------------------------------------


def _to_date(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def _to_datetime(v: Any) -> Optional[datetime]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.replace(tzinfo=None)
    s = str(v).replace("Z", "")
    return datetime.fromisoformat(s).replace(tzinfo=None)


def _to_time(v: Any) -> Optional[time]:
    if v is None or v == "":
        return None
    if isinstance(v, time):
        return v
    parts = str(v).split(":")
    return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)


def _js_weekday(d: date) -> int:
    """0 = Sunday … 6 = Saturday (JS getDay convention)."""
    return (d.weekday() + 1) % 7


def _r2(x: float) -> float:
    return round(float(x) + 0.0, 2)


def _num(x: float) -> str:
    """Compact number for Arabic labels: 3 / 2.5 / 333.33."""
    x = round(float(x), 2)
    if x == int(x):
        return str(int(x))
    return f"{x:.2f}".rstrip("0").rstrip(".")


def normalize_settings(raw: Optional[dict]) -> Dict[str, Any]:
    """Defaults merged with whatever is stored, coerced to the right types."""
    s = dict(DEFAULT_SETTINGS)
    if isinstance(raw, dict):
        for k in DEFAULT_SETTINGS:
            if k in raw and raw[k] is not None:
                s[k] = raw[k]
    if s["unmarked_as"] not in ("present", "absent"):
        s["unmarked_as"] = "present"
    if s["day_rate_basis"] not in ("calendar30", "working_days"):
        s["day_rate_basis"] = "calendar30"
    s["late_deduction"] = bool(s["late_deduction"])
    s["overtime_pay"] = bool(s["overtime_pay"])
    try:
        s["late_grace_minutes"] = max(0, int(s["late_grace_minutes"]))
    except (TypeError, ValueError):
        s["late_grace_minutes"] = DEFAULT_SETTINGS["late_grace_minutes"]
    try:
        s["overtime_multiplier"] = max(1.0, float(s["overtime_multiplier"]))
    except (TypeError, ValueError):
        s["overtime_multiplier"] = DEFAULT_SETTINGS["overtime_multiplier"]
    return s


# ---------------------------------------------------------------------------
# Pure salary calculation
# ---------------------------------------------------------------------------


def _worked_hours(check_in: Optional[datetime], check_out: Optional[datetime]):
    if check_in and check_out and check_out > check_in:
        return (check_out - check_in).total_seconds() / 3600.0
    return None


def compute_salary(
    employee: dict,
    settings: Optional[dict],
    records: Dict[Any, dict],
    start: date,
    end: date,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Salary for ``employee`` over [start, end] (inclusive).

    ``employee``: salary, pay_type, off_days, daily_hours, shift_start,
    track_attendance, started_on, stopped_on.
    ``records``: {day: {status, check_in, check_out}} (day as date or 'YYYY-MM-DD').
    Pure: no DB, no clock except ``today`` (defaults to the store clock's today).
    """
    s = normalize_settings(settings)
    today = today or local_now().date()
    pay_type = employee.get("pay_type") or "monthly"
    if pay_type not in PAY_TYPES:
        pay_type = "monthly"
    salary = float(employee.get("salary") or 0)
    off_days = {int(x) for x in (employee.get("off_days") or [])}
    daily_hours = float(employee.get("daily_hours") or 8)
    if daily_hours <= 0:
        daily_hours = 8.0
    shift_start = _to_time(employee.get("shift_start"))
    track = employee.get("track_attendance", True) is not False
    started = _to_date(employee.get("started_on"))
    stopped = _to_date(employee.get("stopped_on"))

    mult = float(s["overtime_multiplier"])
    ot_on = s["overtime_pay"] and track
    # Hourly workers are only paid for the hours they were there, so lateness
    # is already "deducted" — no separate late deduction for them.
    late_on = (
        s["late_deduction"]
        and track
        and shift_start is not None
        and pay_type != "hourly"
    )
    grace = int(s["late_grace_minutes"])
    unmarked_as = s["unmarked_as"]

    recs: Dict[date, dict] = {}
    for k, v in (records or {}).items():
        recs[_to_date(k)] = v

    emp_start = max(start, started) if started else start
    emp_end = min(end, stopped) if stopped else end

    counts: Dict[str, Any] = {
        "period_days": (end - start).days + 1,
        "employed_days": 0,
        "working_days": 0,
        "off_days": 0,
        "present": 0,
        "absent": 0,
        "half": 0,
        "leave": 0,
        "unmarked": 0,
        "off_days_worked": 0.0,
        "future_days": 0,
        "late_days": 0,
        "late_minutes": 0,
        "overtime_hours": 0.0,
        "missing_checkouts": 0,
        "paid_hours": 0.0,
        "paid_days": 0.0,
    }
    months: List[dict] = []
    base = 0.0  # monthly base / daily & hourly earnings
    absence_ded = 0.0
    half_ded = 0.0
    late_ded = 0.0
    overtime_bonus = 0.0
    offday_bonus = 0.0

    cur = date(emp_start.year, emp_start.month, 1) if emp_start <= emp_end else None
    while cur is not None and cur <= emp_end:
        dim = calendar.monthrange(cur.year, cur.month)[1]
        m_last = date(cur.year, cur.month, dim)
        seg_start = max(emp_start, cur)
        seg_end = min(emp_end, m_last)
        employed = (seg_end - seg_start).days + 1
        working_in_month = sum(
            1
            for i in range(dim)
            if _js_weekday(cur + timedelta(days=i)) not in off_days
        )
        if pay_type == "monthly":
            if s["day_rate_basis"] == "working_days" and working_in_month > 0:
                day_rate = salary / working_in_month
            else:
                day_rate = salary / 30.0
            hourly_rate = day_rate / daily_hours
            month_base = salary * employed / dim
            base += month_base
        elif pay_type == "daily":
            day_rate = salary
            hourly_rate = salary / daily_hours
            month_base = 0.0
        else:
            hourly_rate = salary
            day_rate = salary * daily_hours
            month_base = 0.0

        m_info = {
            "month": f"{cur.year:04d}-{cur.month:02d}",
            "days_in_month": dim,
            "employed_days": employed,
            "working_days_in_month": working_in_month,
            "day_rate": _r2(day_rate),
            "hourly_rate": _r2(hourly_rate),
            "base": _r2(month_base),
            "full": employed == dim,
        }
        months.append(m_info)

        d = seg_start
        while d <= seg_end:
            rec = recs.get(d) if track else None
            status = rec.get("status") if rec else None
            if status not in STATUSES:
                status = None
            cin = _to_datetime(rec.get("check_in")) if rec else None
            cout = _to_datetime(rec.get("check_out")) if rec else None
            is_off = _js_weekday(d) in off_days
            future = d > today
            counts["employed_days"] += 1

            if cin and not cout and d < today and status in ("present", "half"):
                counts["missing_checkouts"] += 1

            if is_off:
                counts["off_days"] += 1
                if status in ("present", "half"):
                    frac = 1.0 if status == "present" else 0.5
                    counts["off_days_worked"] += frac
                    if pay_type == "monthly":
                        if ot_on:
                            offday_bonus += day_rate * frac * mult
                    elif pay_type == "daily":
                        base += day_rate * frac
                        counts["paid_days"] += frac
                        if ot_on:
                            offday_bonus += day_rate * frac * (mult - 1)
                    else:
                        hours = _worked_hours(cin, cout)
                        if hours is None:
                            hours = daily_hours * frac
                        base += hours * hourly_rate
                        counts["paid_hours"] += hours
                        if ot_on:
                            offday_bonus += hours * hourly_rate * (mult - 1)
                d += timedelta(days=1)
                continue

            counts["working_days"] += 1
            if status:
                eff = status
                counts[status] += 1
            elif future:
                counts["future_days"] += 1
                d += timedelta(days=1)
                continue
            elif not track:
                eff = "present"
                counts["present"] += 1
            else:
                counts["unmarked"] += 1
                eff = unmarked_as

            hours_from_times = _worked_hours(cin, cout) if status else None

            if pay_type == "monthly":
                if eff == "absent":
                    absence_ded += day_rate
                elif eff == "half":
                    half_ded += day_rate / 2
            elif pay_type == "daily":
                frac = {"present": 1.0, "leave": 1.0, "half": 0.5}.get(eff, 0.0)
                base += day_rate * frac
                counts["paid_days"] += frac
            else:
                if eff == "present":
                    hours = hours_from_times if hours_from_times is not None else daily_hours
                elif eff == "half":
                    hours = (
                        hours_from_times
                        if hours_from_times is not None
                        else daily_hours / 2
                    )
                elif eff == "leave":
                    hours = daily_hours
                else:
                    hours = 0.0
                base += hours * hourly_rate
                counts["paid_hours"] += hours

            if late_on and status == "present" and cin:
                late = (cin - datetime.combine(d, shift_start)).total_seconds() / 60
                if late > grace:
                    mins = int(round(late - grace))
                    if mins > 0:
                        counts["late_minutes"] += mins
                        counts["late_days"] += 1
                        late_ded += mins * hourly_rate / 60

            if ot_on and status == "present" and hours_from_times is not None:
                extra = hours_from_times - daily_hours
                if extra > 1 / 60:
                    counts["overtime_hours"] += extra
                    factor = (mult - 1) if pay_type == "hourly" else mult
                    overtime_bonus += extra * hourly_rate * factor

            d += timedelta(days=1)

        # next month
        cur = date(cur.year + (cur.month // 12), cur.month % 12 + 1, 1)

    # A monthly worker can't lose more than the base for absences.
    if pay_type == "monthly" and absence_ded + half_ded > base:
        over = absence_ded + half_ded - base
        if half_ded >= over:
            half_ded -= over
        else:
            absence_ded -= over - half_ded
            half_ded = 0.0

    amount = _r2(base)
    deductions = _r2(absence_ded + half_ded + late_ded)
    bonus = _r2(overtime_bonus + offday_bonus)
    net = _r2(amount + bonus - deductions)

    counts["overtime_hours"] = _r2(counts["overtime_hours"])
    counts["paid_hours"] = _r2(counts["paid_hours"])
    counts["paid_days"] = _r2(counts["paid_days"])
    counts["off_days_worked"] = _r2(counts["off_days_worked"])

    first = months[0] if months else None
    single_rate = len({m["day_rate"] for m in months}) <= 1
    if pay_type == "monthly":
        day_rate_out = first["day_rate"] if first else _r2(salary / 30.0)
        hourly_rate_out = first["hourly_rate"] if first else _r2(salary / 30.0 / daily_hours)
    elif pay_type == "daily":
        day_rate_out, hourly_rate_out = _r2(salary), _r2(salary / daily_hours)
    else:
        day_rate_out, hourly_rate_out = _r2(salary * daily_hours), _r2(salary)

    # ---------------- human-readable lines ----------------
    lines: List[dict] = []

    def line(label, amount_=None, kind="info", detail=None):
        lines.append(
            {
                "label": label,
                "amount": None if amount_ is None else _r2(amount_),
                "kind": kind,
                "detail": detail,
            }
        )

    unmarked_word = "حاضر" if unmarked_as == "present" else "غائب"
    if not months:
        line("الموظف لم يكن معيّنًا خلال هذه الفترة")
    elif pay_type == "monthly":
        for m in months:
            y, mo = m["month"].split("-")
            label = f"الراتب الأساسي — {AR_MONTHS[int(mo) - 1]} {y}"
            detail = None
            if not m["full"]:
                detail = f"{m['employed_days']} من {m['days_in_month']} يوم"
            line(label, m["base"], "base", detail)
        rate_txt = f" × {_num(day_rate_out)}" if single_rate else ""
        if absence_ded > 0:
            n = counts["absent"] + (counts["unmarked"] if unmarked_as == "absent" else 0)
            line(f"غياب {_num(n)} يوم", -absence_ded, "deduction", f"{_num(n)}{rate_txt}")
        if half_ded > 0:
            line(
                f"نصف يوم × {counts['half']}",
                -half_ded,
                "deduction",
                f"{counts['half']} × ½{rate_txt}",
            )
    elif pay_type == "daily":
        line(
            f"أيام مدفوعة {_num(counts['paid_days'])} يوم",
            base,
            "base",
            f"{_num(counts['paid_days'])} × {_num(salary)}",
        )
    else:
        line(
            f"ساعات مدفوعة {_num(counts['paid_hours'])} ساعة",
            base,
            "base",
            f"{_num(counts['paid_hours'])} × {_num(salary)}",
        )

    if late_ded > 0:
        line(
            f"تأخير {counts['late_minutes']} دقيقة",
            -late_ded,
            "deduction",
            f"في {counts['late_days']} يوم — بعد سماح {grace} دقيقة",
        )
    if overtime_bonus > 0:
        line(
            f"ساعات إضافية {_num(counts['overtime_hours'])} ساعة",
            overtime_bonus,
            "bonus",
            f"× {_num(mult)}" if pay_type != "hourly" else f"فرق الإضافي × {_num(mult - 1)}",
        )
    if offday_bonus > 0:
        line(
            f"عمل في الإجازة الأسبوعية {_num(counts['off_days_worked'])} يوم",
            offday_bonus,
            "bonus",
            f"× {_num(mult)}" if pay_type == "monthly" else f"فرق الإضافي × {_num(mult - 1)}",
        )
    elif counts["off_days_worked"] and pay_type == "monthly":
        line(
            f"عمل في الإجازة الأسبوعية {_num(counts['off_days_worked'])} يوم",
            None,
            "info",
            "بدون أجر إضافي (فعّل الأجر الإضافي من إعدادات الحضور)",
        )

    if not track:
        line("الحضور غير مُتابع لهذا الموظف — يُحتسب حاضرًا كل أيام العمل")
    else:
        if counts["leave"]:
            line(f"إجازة مدفوعة {counts['leave']} يوم", None, "info", "بدون خصم")
        if counts["unmarked"]:
            line(
                f"{counts['unmarked']} يوم بدون تسجيل",
                None,
                "info",
                f"احتُسب {unmarked_word} حسب الإعدادات",
            )
        if counts["missing_checkouts"]:
            line(f"{counts['missing_checkouts']} يوم بدون تسجيل انصراف", None, "warning")
    if counts["future_days"]:
        line(
            f"{counts['future_days']} يوم لم يأتِ بعد",
            None,
            "info",
            "لم يُحتسب غيابًا" if pay_type == "monthly" else "لم يُحتسب بعد",
        )

    return {
        "pay_type": pay_type,
        "salary": _r2(salary),
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "employed": (
            {"start": emp_start.isoformat(), "end": emp_end.isoformat()}
            if months
            else None
        ),
        "counts": counts,
        "rates": {
            "day_rate": day_rate_out,
            "hourly_rate": hourly_rate_out,
            "daily_hours": daily_hours,
            "overtime_multiplier": mult,
        },
        "months": months,
        "amount": amount,
        "deductions": deductions,
        "bonus": bonus,
        "net": net,
        "parts": {
            "absence": _r2(absence_ded),
            "half_days": _r2(half_ded),
            "late": _r2(late_ded),
            "overtime": _r2(overtime_bonus),
            "off_days": _r2(offday_bonus),
        },
        "lines": lines,
        "settings": s,
        "track_attendance": track,
    }


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _fail(e: Exception):
    if isinstance(e, HTTPException):
        raise e
    logging.error("attendance error: %s", e)
    raise HTTPException(status_code=400, detail=str(e)) from e


def _parse_day(v: Any, field: str = "التاريخ") -> date:
    try:
        d = _to_date(v)
    except (TypeError, ValueError):
        d = None
    if d is None:
        raise HTTPException(status_code=400, detail=f"{field} غير صحيح")
    return d


def _parse_range(start: Any, end: Any):
    s = _parse_day(start, "تاريخ البداية")
    e = _parse_day(end, "تاريخ النهاية")
    if e < s:
        raise HTTPException(status_code=400, detail="تاريخ النهاية قبل تاريخ البداية")
    if (e - s).days > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail="الفترة طويلة جدًا (الحد سنة واحدة)")
    return s, e


def get_settings(cur, store_id: int) -> Dict[str, Any]:
    cur.execute(
        "SELECT extra_info->'attendance' AS a FROM store_data WHERE id = %s",
        (store_id,),
    )
    row = cur.fetchone()
    return normalize_settings(row["a"] if row else None)


def _get_employee(cur, employee_id: int, store_id: Optional[int] = None) -> dict:
    cur.execute(
        """
        SELECT id, store_id, name, salary, pay_type, off_days, daily_hours,
               shift_start, track_attendance, started_on, stopped_on
        FROM employee WHERE id = %s
        """,
        (employee_id,),
    )
    emp = cur.fetchone()
    if not emp or (store_id is not None and emp["store_id"] != store_id):
        raise HTTPException(status_code=404, detail="الموظف غير موجود في هذا الفرع")
    return dict(emp)


def _ts(v: Optional[datetime]) -> Optional[str]:
    return v.strftime("%Y-%m-%dT%H:%M:%S") if v else None


def _record_out(r: dict) -> dict:
    return {
        "id": r["id"],
        "employee_id": r["employee_id"],
        "day": r["day"].isoformat(),
        "status": r["status"],
        "check_in": _ts(r.get("check_in")),
        "check_out": _ts(r.get("check_out")),
        "note": r.get("note"),
    }


def _parse_moment(v: Any, day: date, field: str) -> Optional[datetime]:
    """'HH:MM' (on ``day``) or a full local timestamp."""
    if v is None or v == "":
        return None
    try:
        sv = str(v)
        if len(sv) <= 8 and ":" in sv and "-" not in sv:
            return datetime.combine(day, _to_time(sv))
        return _to_datetime(sv)
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"{field} غير صحيح") from e


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


class AttendanceSettings(BaseModel):
    unmarked_as: Optional[str] = None
    day_rate_basis: Optional[str] = None
    late_deduction: Optional[bool] = None
    late_grace_minutes: Optional[int] = None
    overtime_pay: Optional[bool] = None
    overtime_multiplier: Optional[float] = None


@router.get("/attendance/settings")
def get_attendance_settings(
    store_id: int, current_user: dict = Depends(get_current_user)
) -> JSONResponse:
    try:
        with Database(HOST, DATABASE, USER, PASS) as cur:
            return JSONResponse(content=get_settings(cur, store_id))
    except Exception as e:
        _fail(e)


@router.put("/attendance/settings")
def put_attendance_settings(
    store_id: int,
    body: AttendanceSettings,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        incoming = body.model_dump(exclude_none=True)
        if "unmarked_as" in incoming and incoming["unmarked_as"] not in ("present", "absent"):
            raise HTTPException(status_code=400, detail="قيمة الأيام غير المسجلة غير صحيحة")
        if "day_rate_basis" in incoming and incoming["day_rate_basis"] not in (
            "calendar30",
            "working_days",
        ):
            raise HTTPException(status_code=400, detail="طريقة حساب أجر اليوم غير صحيحة")
        if "late_grace_minutes" in incoming and not 0 <= incoming["late_grace_minutes"] <= 240:
            raise HTTPException(status_code=400, detail="فترة السماح يجب أن تكون بين 0 و 240 دقيقة")
        if "overtime_multiplier" in incoming and not 1 <= incoming["overtime_multiplier"] <= 5:
            raise HTTPException(status_code=400, detail="معامل الإضافي يجب أن يكون بين 1 و 5")
        with Database(HOST, DATABASE, USER, PASS) as cur:
            current = get_settings(cur, store_id)
            merged = normalize_settings({**current, **incoming})
            cur.execute(
                """
                UPDATE store_data
                SET extra_info = COALESCE(extra_info, '{}'::jsonb)
                                 || jsonb_build_object('attendance', %s::jsonb)
                WHERE id = %s
                RETURNING id
                """,
                (json.dumps(merged), store_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="الفرع غير موجود")
            return JSONResponse(content=merged)
    except Exception as e:
        _fail(e)


# ---------------------------------------------------------------------------
# Records
# ---------------------------------------------------------------------------


@router.get("/attendance")
def list_attendance(
    store_id: int,
    start: str,
    end: str,
    employee_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        s, e = _parse_range(start, end)
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT a.id, a.employee_id, a.day, a.status, a.check_in,
                       a.check_out, a.note
                FROM employee_attendance a
                JOIN employee e ON e.id = a.employee_id
                WHERE e.store_id = %s AND a.day BETWEEN %s AND %s
                  AND (%s::BIGINT IS NULL OR a.employee_id = %s::BIGINT)
                ORDER BY a.day, a.employee_id
                """,
                (store_id, s, e, employee_id, employee_id),
            )
            return JSONResponse(content=[_record_out(r) for r in cur.fetchall()])
    except Exception as ex:
        _fail(ex)


class AttendanceDay(BaseModel):
    employee_id: int
    day: str
    status: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    note: Optional[str] = None


def _check_employed(emp: dict, day: date):
    started = _to_date(emp.get("started_on"))
    stopped = _to_date(emp.get("stopped_on"))
    if (started and day < started) or (stopped and day > stopped):
        raise HTTPException(
            status_code=400, detail=f"{emp['name']} لم يكن معيّنًا في هذا اليوم"
        )


@router.put("/attendance")
def upsert_attendance(
    store_id: int,
    body: AttendanceDay,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Set one employee's day. Full replace: send the whole day state.

    status null + no times/note ⇒ the row is deleted ("unmarked").
    A check-in (or check-out) without a status implies present.
    """
    try:
        day = _parse_day(body.day)
        status = body.status or None
        if status is not None and status not in STATUSES:
            raise HTTPException(status_code=400, detail="حالة الحضور غير صحيحة")
        note = (body.note or "").strip() or None
        check_in = _parse_moment(body.check_in, day, "وقت الحضور")
        check_out = _parse_moment(body.check_out, day, "وقت الانصراف")

        with Database(HOST, DATABASE, USER, PASS) as cur:
            emp = _get_employee(cur, body.employee_id, store_id)

            if status is None and not check_in and not check_out:
                if note:
                    raise HTTPException(status_code=400, detail="اختر حالة اليوم أولاً")
                cur.execute(
                    "DELETE FROM employee_attendance WHERE employee_id = %s AND day = %s",
                    (body.employee_id, day),
                )
                return JSONResponse(content={"deleted": True, "record": None})

            _check_employed(emp, day)
            if status is None:
                status = "present"
            if status in ("absent", "leave"):
                check_in = check_out = None
            if check_in and check_out and check_out <= check_in:
                # 'HH:MM' check-out earlier than check-in = past midnight.
                if isinstance(body.check_out, str) and len(body.check_out) <= 8:
                    check_out += timedelta(days=1)
                if check_out <= check_in:
                    raise HTTPException(
                        status_code=400, detail="وقت الانصراف يجب أن يكون بعد وقت الحضور"
                    )

            cur.execute(
                """
                INSERT INTO employee_attendance
                    (employee_id, day, status, check_in, check_out, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (employee_id, day) DO UPDATE SET
                    status = EXCLUDED.status,
                    check_in = EXCLUDED.check_in,
                    check_out = EXCLUDED.check_out,
                    note = EXCLUDED.note,
                    updated_at = NOW()
                RETURNING id, employee_id, day, status, check_in, check_out, note
                """,
                (body.employee_id, day, status, check_in, check_out, note),
            )
            return JSONResponse(
                content={"deleted": False, "record": _record_out(cur.fetchone())}
            )
    except Exception as e:
        _fail(e)


class BulkAttendance(BaseModel):
    store_id: Optional[int] = None
    day: str
    employee_ids: List[int]
    status: Optional[str] = None
    overwrite: bool = False


@router.post("/attendance/bulk")
def bulk_attendance(
    body: BulkAttendance,
    store_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Mark many employees for one day. Only fills unmarked days unless
    ``overwrite``. status null + overwrite ⇒ clears those days."""
    try:
        sid = body.store_id if body.store_id is not None else store_id
        if sid is None:
            raise HTTPException(status_code=400, detail="الفرع مطلوب")
        day = _parse_day(body.day)
        if body.status is not None and body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="حالة الحضور غير صحيحة")
        if not body.employee_ids:
            return JSONResponse(content={"count": 0, "records": []})
        with Database(HOST, DATABASE, USER, PASS) as cur:
            # Only this store's employees who were employed on that day.
            cur.execute(
                """
                SELECT id FROM employee
                WHERE store_id = %s AND id = ANY(%s)
                  AND (started_on IS NULL OR started_on::date <= %s)
                  AND (stopped_on IS NULL OR stopped_on::date >= %s)
                """,
                (sid, list(body.employee_ids), day, day),
            )
            ids = [r["id"] for r in cur.fetchall()]
            if not ids:
                return JSONResponse(content={"count": 0, "records": []})

            if body.status is None:
                if not body.overwrite:
                    return JSONResponse(content={"count": 0, "records": []})
                cur.execute(
                    "DELETE FROM employee_attendance WHERE day = %s AND employee_id = ANY(%s)",
                    (day, ids),
                )
                return JSONResponse(content={"count": cur.rowcount, "records": []})

            conflict = (
                """DO UPDATE SET status = EXCLUDED.status,
                       check_in = CASE WHEN EXCLUDED.status IN ('absent','leave')
                                       THEN NULL ELSE employee_attendance.check_in END,
                       check_out = CASE WHEN EXCLUDED.status IN ('absent','leave')
                                        THEN NULL ELSE employee_attendance.check_out END,
                       updated_at = NOW()"""
                if body.overwrite
                else "DO NOTHING"
            )
            cur.execute(
                f"""
                INSERT INTO employee_attendance (employee_id, day, status)
                SELECT unnest(%s::BIGINT[]), %s, %s
                ON CONFLICT (employee_id, day) {conflict}
                RETURNING id, employee_id, day, status, check_in, check_out, note
                """,
                (ids, day, body.status),
            )
            rows = [_record_out(r) for r in cur.fetchall()]
            return JSONResponse(content={"count": len(rows), "records": rows})
    except Exception as e:
        _fail(e)


# ---------------------------------------------------------------------------
# Salary preview & history
# ---------------------------------------------------------------------------


def _overlapping(cur, employee_id: int, s: date, e: date) -> List[dict]:
    cur.execute(
        """
        SELECT s.id, s.period_start, s.period_end, s.time,
               s.amount, s.bonus, s.deductions
        FROM salaries s
        WHERE s.employee_id = %s AND s.period_start IS NOT NULL
          AND s.period_start <= %s AND COALESCE(s.period_end, s.period_start) >= %s
        ORDER BY s.period_start
        """,
        (employee_id, e, s),
    )
    out = []
    for r in cur.fetchall():
        amount = float(r["amount"] or 0)
        bonus = float(r["bonus"] or 0)
        ded = float(r["deductions"] or 0)
        out.append(
            {
                "id": r["id"],
                "period_start": r["period_start"].isoformat(),
                "period_end": (r["period_end"] or r["period_start"]).isoformat(),
                "time": _ts(r["time"]),
                "net": _r2(amount + bonus - ded),
            }
        )
    return out


@router.get("/employees/{employee_id}/salary-preview")
def salary_preview(
    employee_id: int,
    start: str,
    end: str,
    store_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    try:
        s, e = _parse_range(start, end)
        with Database(HOST, DATABASE, USER, PASS) as cur:
            emp = _get_employee(cur, employee_id, store_id)
            settings = get_settings(cur, emp["store_id"])
            cur.execute(
                """
                SELECT day, status, check_in, check_out
                FROM employee_attendance
                WHERE employee_id = %s AND day BETWEEN %s AND %s
                """,
                (employee_id, s, e),
            )
            records = {r["day"]: dict(r) for r in cur.fetchall()}
            result = compute_salary(emp, settings, records, s, e, local_now().date())
            result["employee"] = {"id": emp["id"], "name": emp["name"]}
            result["overlapping"] = _overlapping(cur, employee_id, s, e)
            return JSONResponse(content=result)
    except Exception as ex:
        _fail(ex)


@router.get("/salaries")
def list_salaries(
    store_id: int,
    employee_id: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 500,
    current_user: dict = Depends(get_current_user),
) -> JSONResponse:
    """Salary payments, newest first. start/end filter the payment date."""
    try:
        s = _parse_day(start, "تاريخ البداية") if start else None
        e = _parse_day(end, "تاريخ النهاية") if end else None
        limit = max(1, min(int(limit), 2000))
        with Database(HOST, DATABASE, USER, PASS) as cur:
            cur.execute(
                """
                SELECT s.id, s.employee_id, e.name AS employee_name, s.amount,
                       s.bonus, s.deductions, s.time, s.payment_method_id,
                       pm.name AS payment_method_name, s.period_start,
                       s.period_end, s.details, s.note
                FROM salaries s
                JOIN employee e ON e.id = s.employee_id
                LEFT JOIN payment_methods pm ON pm.id = s.payment_method_id
                WHERE e.store_id = %s
                  AND (%s::BIGINT IS NULL OR s.employee_id = %s::BIGINT)
                  AND (%s::DATE IS NULL OR s.time::date >= %s::DATE)
                  AND (%s::DATE IS NULL OR s.time::date <= %s::DATE)
                ORDER BY s.time DESC NULLS LAST, s.id DESC
                LIMIT %s
                """,
                (store_id, employee_id, employee_id, s, s, e, e, limit),
            )
            out = []
            for r in cur.fetchall():
                amount = float(r["amount"] or 0)
                bonus = float(r["bonus"] or 0)
                ded = float(r["deductions"] or 0)
                out.append(
                    {
                        "id": r["id"],
                        "employee_id": r["employee_id"],
                        "employee_name": r["employee_name"],
                        "amount": _r2(amount),
                        "bonus": _r2(bonus),
                        "deductions": _r2(ded),
                        "net": _r2(amount + bonus - ded),
                        "time": _ts(r["time"]),
                        "payment_method_id": r["payment_method_id"],
                        "payment_method_name": r["payment_method_name"],
                        "period_start": r["period_start"].isoformat() if r["period_start"] else None,
                        "period_end": r["period_end"].isoformat() if r["period_end"] else None,
                        "details": r["details"],
                        "note": r["note"],
                    }
                )
            return JSONResponse(content=out)
    except Exception as ex:
        _fail(ex)

// Types for the Employee / attendance / salary page (v26).

export type PayType = "monthly" | "daily" | "hourly";
export type AttendanceStatus = "present" | "absent" | "half" | "leave";

export interface Employee {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  salary: number;
  /** 'YYYY-MM-DDTHH:mm:ss' (local) */
  started_on: string;
  stopped_on?: string | null;
  pay_type: PayType;
  /** Weekly days off, 0 = Sunday … 6 = Saturday (JS getDay). */
  off_days: number[];
  daily_hours: number;
  /** 'HH:MM' or null */
  shift_start: string | null;
  track_attendance: boolean;
  /** End of the last paid salary period ('YYYY-MM-DD'). */
  last_paid_end?: string | null;
  last_paid_at?: string | null;
}

export interface EmployeePayload {
  name: string;
  phone: string;
  address: string;
  salary: number;
  started_on: string;
  stopped_on?: string | null;
  pay_type: PayType;
  off_days: number[];
  daily_hours: number;
  shift_start: string | null;
  track_attendance: boolean;
}

export interface AttendanceRecord {
  id?: number;
  employee_id: number;
  /** 'YYYY-MM-DD' */
  day: string;
  status: AttendanceStatus;
  /** 'YYYY-MM-DDTHH:mm:ss' (local) */
  check_in: string | null;
  check_out: string | null;
  note: string | null;
}

/** Body of PUT /attendance. status null + nothing else ⇒ day is cleared. */
export interface AttendanceDayInput {
  employee_id: number;
  day: string;
  status: AttendanceStatus | null;
  /** 'HH:MM' or a full local timestamp */
  check_in: string | null;
  check_out: string | null;
  note: string | null;
}

export interface AttendanceSettings {
  unmarked_as: "present" | "absent";
  day_rate_basis: "calendar30" | "working_days";
  late_deduction: boolean;
  late_grace_minutes: number;
  overtime_pay: boolean;
  overtime_multiplier: number;
}

export interface SalaryLine {
  label: string;
  amount: number | null;
  kind: "base" | "deduction" | "bonus" | "info" | "warning";
  detail: string | null;
}

export interface SalaryCounts {
  period_days: number;
  employed_days: number;
  working_days: number;
  off_days: number;
  present: number;
  absent: number;
  half: number;
  leave: number;
  unmarked: number;
  off_days_worked: number;
  future_days: number;
  late_days: number;
  late_minutes: number;
  overtime_hours: number;
  missing_checkouts: number;
  paid_hours: number;
  paid_days: number;
}

export interface OverlappingSalary {
  id: number;
  period_start: string;
  period_end: string;
  time: string | null;
  net: number;
}

export interface SalaryPreview {
  employee: { id: number; name: string };
  pay_type: PayType;
  salary: number;
  period: { start: string; end: string };
  employed: { start: string; end: string } | null;
  counts: SalaryCounts;
  rates: {
    day_rate: number;
    hourly_rate: number;
    daily_hours: number;
    overtime_multiplier: number;
  };
  months: {
    month: string;
    days_in_month: number;
    employed_days: number;
    working_days_in_month: number;
    day_rate: number;
    hourly_rate: number;
    base: number;
    full: boolean;
  }[];
  amount: number;
  deductions: number;
  bonus: number;
  net: number;
  parts: {
    absence: number;
    half_days: number;
    late: number;
    overtime: number;
    off_days: number;
  };
  lines: SalaryLine[];
  settings: AttendanceSettings;
  track_attendance: boolean;
  overlapping: OverlappingSalary[];
}

export interface SalaryPaymentDetails {
  lines?: SalaryLine[];
  counts?: Partial<SalaryCounts>;
  suggested?: { amount: number; bonus: number; deductions: number };
  pay_type?: PayType;
  salary?: number;
}

export interface SalaryPayment {
  id: number;
  employee_id: number;
  employee_name: string;
  amount: number;
  bonus: number;
  deductions: number;
  net: number;
  time: string | null;
  payment_method_id: number | null;
  payment_method_name: string | null;
  period_start: string | null;
  period_end: string | null;
  details: SalaryPaymentDetails | null;
  note: string | null;
}

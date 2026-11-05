import dayjs, { Dayjs } from "dayjs";
import { useMediaQuery, useTheme } from "@mui/material";
import { localDate } from "../utils/functions";
import { AttendanceRecord, AttendanceStatus, Employee, PayType } from "./types";

// ---------------------------------------------------------------------------
// Labels & colors
// ---------------------------------------------------------------------------

export type StatusColor = "success" | "error" | "warning" | "info";

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; color: StatusColor }
> = {
  present: { label: "حاضر", color: "success" },
  absent: { label: "غائب", color: "error" },
  half: { label: "نصف يوم", color: "warning" },
  leave: { label: "إجازة", color: "info" },
};

export const STATUS_ORDER: AttendanceStatus[] = [
  "present",
  "absent",
  "half",
  "leave",
];

export const PAY_TYPE_META: Record<
  PayType,
  { label: string; per: string; rateLabel: string }
> = {
  monthly: { label: "شهري", per: "شهر", rateLabel: "الراتب الشهري" },
  daily: { label: "يومي", per: "يوم", rateLabel: "أجر اليوم" },
  hourly: { label: "بالساعة", per: "ساعة", rateLabel: "أجر الساعة" },
};

/** Index = JS getDay (0 = Sunday). */
export const DAY_NAMES = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export const DAY_SHORT = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
/** Week as shown in Egypt: Saturday → Friday. */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const moneyFmt = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const numFmt = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 });

export const fmtMoney = (n: number | null | undefined) =>
  moneyFmt.format(Number.isFinite(n as number) ? (n as number) : 0);
export const fmtNum = (n: number) => numFmt.format(n);
/** Western digits → Arabic-Indic, to match Intl "ar-EG" output in labels. */
export const arDigits = (s: string) =>
  s
    .replace(/(\d)\.(?=\d)/g, "$1٫")
    .replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/** 'YYYY-MM-DD' (ASCII) for a dayjs value. */
export const ymd = (d: Dayjs) => localDate(d.toDate());
export const todayStr = () => ymd(dayjs());

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ss' as local time. */
export const parseLocal = (s: string) => dayjs(s.replace(" ", "T"));

export const fmtDayLong = (day: string | Dayjs) =>
  new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format((typeof day === "string" ? parseLocal(day) : day).toDate());

export const fmtDate = (day: string | Dayjs, withYear = true) =>
  new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  }).format((typeof day === "string" ? parseLocal(day) : day).toDate());

export const fmtMonth = (d: Dayjs) =>
  new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(
    d.toDate(),
  );

export const fmtDateTime = (ts: string) =>
  new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parseLocal(ts).toDate());

/** '09:30' or a timestamp → '٩:٣٠ ص' */
export const fmtTime = (v: string | null | undefined) => {
  if (!v) return "";
  const d = v.length <= 5 ? dayjs(`2000-01-01T${v}`) : parseLocal(v);
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d.toDate());
};

/** Timestamp → 'HH:MM' for <input type="time">. */
export const toHHMM = (v: string | null | undefined) => {
  if (!v) return "";
  if (v.length <= 5) return v;
  return v.replace(" ", "T").slice(11, 16);
};

export const fmtPeriod = (start: string | null, end: string | null) => {
  if (!start) return "بدون فترة محددة";
  const s = parseLocal(start);
  const e = parseLocal(end || start);
  if (
    s.date() === 1 &&
    e.isSame(s, "month") &&
    e.date() === e.daysInMonth()
  )
    return fmtMonth(s);
  if (s.isSame(e, "day")) return fmtDate(s);
  return `${fmtDate(s, !s.isSame(e, "year"))} – ${fmtDate(e)}`;
};

export const rateText = (e: Pick<Employee, "salary" | "pay_type">) =>
  `${fmtMoney(e.salary)} / ${PAY_TYPE_META[e.pay_type]?.per ?? "شهر"}`;

export const offDaysText = (off: number[]) =>
  off.length
    ? WEEK_ORDER.filter((d) => off.includes(d))
        .map((d) => DAY_NAMES[d])
        .join("، ")
    : "لا يوجد";

// ---------------------------------------------------------------------------
// Employee helpers
// ---------------------------------------------------------------------------

export const isActive = (e: Employee) => !e.stopped_on;

export const isEmployedOn = (e: Employee, day: string) => {
  const started = e.started_on ? e.started_on.slice(0, 10) : null;
  const stopped = e.stopped_on ? e.stopped_on.slice(0, 10) : null;
  return (!started || started <= day) && (!stopped || stopped >= day);
};

export const isOffDay = (e: Employee, day: string | Dayjs) => {
  const d = typeof day === "string" ? parseLocal(day) : day;
  return (e.off_days || []).includes(d.day());
};

/** Minutes late after the shift start (before grace), or 0. */
export const lateMinutes = (
  e: Employee,
  rec: AttendanceRecord | undefined,
): number => {
  if (!e.shift_start || !rec?.check_in) return 0;
  const cin = parseLocal(rec.check_in);
  const [h, m] = e.shift_start.split(":").map(Number);
  const shift = parseLocal(rec.day).hour(h).minute(m).second(0);
  return Math.max(0, Math.round(cin.diff(shift, "minute", true)));
};

export const workedHours = (rec: AttendanceRecord | undefined) => {
  if (!rec?.check_in || !rec.check_out) return null;
  const h = parseLocal(rec.check_out).diff(
    parseLocal(rec.check_in),
    "hour",
    true,
  );
  return h > 0 ? h : null;
};

export const errorText = (err: unknown, fallback = "حدث خطأ ما") => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
};

/** Phones (< 600px): full-screen dialogs, stacked layouts. */
export const useIsPhone = () => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("sm"));
};

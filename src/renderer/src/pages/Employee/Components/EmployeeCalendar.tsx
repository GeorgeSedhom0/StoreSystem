import { useEffect, useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";

import { AttendanceRecord, Employee } from "../types";
import { useAttendance, useSalaryPreview } from "../api";
import {
  DAY_SHORT,
  STATUS_META,
  STATUS_ORDER,
  WEEK_ORDER,
  fmtMonth,
  fmtNum,
  isEmployedOn,
  isOffDay,
  todayStr,
  useIsPhone,
  ymd,
} from "../utils";
import { AlertMsg } from "../../Shared/AlertMessage";
import DayEditor from "./DayEditor";
import SalaryBreakdown from "./SalaryBreakdown";

const EmployeeCalendar = ({
  open,
  employee,
  onClose,
  onPay,
  setMsg,
}: {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onPay: (e: Employee, month: Dayjs) => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const isPhone = useIsPhone();
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));
  const [editingDay, setEditingDay] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !employee) return;
    // Ended employees open on their last month.
    const base = employee.stopped_on ? dayjs(employee.stopped_on) : dayjs();
    setMonth(base.startOf("month"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee?.id]);

  const start = ymd(month);
  const end = ymd(month.endOf("month"));
  const attendance = useAttendance(start, end, open && !!employee);
  const preview = useSalaryPreview(open ? employee?.id : null, start, end);

  const records = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    (attendance.data ?? [])
      .filter((r) => r.employee_id === employee?.id)
      .forEach((r) => m.set(r.day, r));
    return m;
  }, [attendance.data, employee?.id]);

  if (!employee) return null;

  const today = todayStr();
  const lead = WEEK_ORDER.indexOf(month.day());
  const days = Array.from({ length: month.daysInMonth() }, (_, i) =>
    month.add(i, "day"),
  );
  const p = preview.data;
  const showPreview = p && p.period.start === start;
  const isCurrentMonth = month.isSame(dayjs(), "month");

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isPhone} fullWidth maxWidth="sm">
      <DialogTitle sx={{ px: 7, pb: 1 }}>
        <Typography variant="h6" component="div" sx={{ lineHeight: 1.3 }}>
          حضور {employee.name}
        </Typography>
        {!employee.track_attendance && (
          <Typography variant="caption" color="warning.main" component="div">
            الحضور غير مُتابع لهذا الموظف — يُحتسب حاضرًا
          </Typography>
        )}
        <IconButton
          aria-label="إغلاق"
          onClick={onClose}
          sx={{ position: "absolute", top: 10, right: 10 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 } }}>
        {/* Month stepper */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <IconButton
            onClick={() => setMonth((m) => m.subtract(1, "month"))}
            sx={{ width: 44, height: 44 }}
            aria-label="الشهر السابق"
          >
            <ChevronRightIcon />
          </IconButton>
          <Typography sx={{ flex: 1, textAlign: "center", fontWeight: 700 }}>
            {fmtMonth(month)}
          </Typography>
          <IconButton
            onClick={() => setMonth((m) => m.add(1, "month"))}
            sx={{ width: 44, height: 44 }}
            aria-label="الشهر التالي"
          >
            <ChevronLeftIcon />
          </IconButton>
        </Box>

        <Box sx={{ position: "relative" }}>
          {attendance.isFetching && (
            <LinearProgress sx={{ position: "absolute", top: -6, left: 0, right: 0, height: 2 }} />
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: { xs: 0.5, sm: 0.75 },
            }}
          >
            {WEEK_ORDER.map((d) => (
              <Typography
                key={d}
                variant="caption"
                color="text.secondary"
                sx={{ textAlign: "center", fontWeight: 700 }}
              >
                {DAY_SHORT[d]}
              </Typography>
            ))}
            {Array.from({ length: lead }).map((_, i) => (
              <Box key={`b${i}`} />
            ))}
            {days.map((d) => {
              const ds = ymd(d);
              const r = records.get(ds);
              const employed = isEmployedOn(employee, ds);
              const off = isOffDay(employee, d);
              const future = ds > today;
              const color = r ? STATUS_META[r.status].color : null;
              return (
                <ButtonBase
                  key={ds}
                  disabled={!employed}
                  onClick={() => setEditingDay(ds)}
                  aria-label={`${d.date()}${r ? " " + STATUS_META[r.status].label : ""}`}
                  sx={(t) => ({
                    minHeight: 44,
                    aspectRatio: { sm: "1 / 0.85" },
                    borderRadius: 1.5,
                    flexDirection: "column",
                    fontWeight: 600,
                    fontSize: 15,
                    position: "relative",
                    color: color
                      ? t.palette[color].contrastText
                      : off || !employed
                        ? t.palette.text.disabled
                        : t.palette.text.primary,
                    bgcolor: color
                      ? t.palette[color].main
                      : off
                        ? alpha(t.palette.text.primary, 0.06)
                        : !employed
                          ? "transparent"
                          : alpha(t.palette.text.primary, future ? 0.015 : 0.035),
                    backgroundImage:
                      off && !r
                        ? `repeating-linear-gradient(135deg, transparent 0 5px, ${alpha(
                            t.palette.text.primary,
                            0.06,
                          )} 5px 7px)`
                        : undefined,
                    outline: ds === today ? `2px solid ${t.palette.primary.main}` : "none",
                    outlineOffset: 1,
                    opacity: employed ? 1 : 0.35,
                  })}
                >
                  {fmtNum(d.date())}
                  {(r?.check_in || r?.note) && (
                    <Box
                      component="span"
                      sx={{
                        position: "absolute",
                        bottom: 4,
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        bgcolor: "currentColor",
                        opacity: 0.8,
                      }}
                    />
                  )}
                </ButtonBase>
              );
            })}
          </Box>

          {/* Legend */}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, mt: 1.25, justifyContent: "center" }}>
            {STATUS_ORDER.map((s) => (
              <Box key={s} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: `${STATUS_META[s].color}.main` }} />
                <Typography variant="caption">{STATUS_META[s].label}</Typography>
              </Box>
            ))}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                sx={(t) => ({
                  width: 12,
                  height: 12,
                  borderRadius: 0.5,
                  bgcolor: alpha(t.palette.text.primary, 0.12),
                })}
              />
              <Typography variant="caption">إجازة أسبوعية</Typography>
            </Box>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 0.5 }}
          >
            اضغط على أي يوم لتسجيل الحالة والمواعيد
          </Typography>
        </Box>

        {attendance.isError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            تعذر تحميل الحضور
          </Alert>
        )}

        {/* Month summary + running estimate */}
        <Card variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 1, gap: 1 }}>
            <Typography sx={{ fontWeight: 700, flex: 1 }}>
              {isCurrentMonth ? "تقدير راتب الشهر حتى الآن" : "حساب راتب الشهر"}
            </Typography>
          </Box>
          {preview.isError && (
            <Alert severity="error">تعذر حساب الراتب</Alert>
          )}
          {!showPreview && !preview.isError && (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={28} />
              <Skeleton variant="rounded" height={80} />
            </Stack>
          )}
          {showPreview && p && (
            <>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1.5 }}>
                {STATUS_ORDER.filter((s) => p.counts[s] > 0).map((s) => (
                  <Chip
                    key={s}
                    size="small"
                    color={STATUS_META[s].color}
                    label={`${STATUS_META[s].label} ${fmtNum(p.counts[s])}`}
                  />
                ))}
                {p.counts.unmarked > 0 && (
                  <Chip size="small" variant="outlined" label={`غير مسجل ${fmtNum(p.counts.unmarked)}`} />
                )}
                {p.counts.off_days_worked > 0 && (
                  <Chip
                    size="small"
                    variant="outlined"
                    color="secondary"
                    label={`عمل في الإجازة ${fmtNum(p.counts.off_days_worked)}`}
                  />
                )}
                {p.counts.late_minutes > 0 && (
                  <Chip size="small" variant="outlined" color="warning" label={`تأخير ${fmtNum(p.counts.late_minutes)} د`} />
                )}
                {p.counts.overtime_hours > 0 && (
                  <Chip size="small" variant="outlined" color="success" label={`إضافي ${fmtNum(p.counts.overtime_hours)} س`} />
                )}
              </Box>
              <SalaryBreakdown lines={p.lines} totals={p} />
              <Button
                fullWidth
                variant="contained"
                startIcon={<PaymentsOutlinedIcon />}
                onClick={() => onPay(employee, month)}
                sx={{ mt: 1.5, minHeight: 44 }}
              >
                دفع راتب {fmtMonth(month)}
              </Button>
            </>
          )}
        </Card>
      </DialogContent>

      <DayEditor
        open={!!editingDay}
        employee={employee}
        day={editingDay}
        record={editingDay ? records.get(editingDay) : undefined}
        onClose={() => setEditingDay(null)}
        setMsg={setMsg}
      />
    </Dialog>
  );
};

export default EmployeeCalendar;

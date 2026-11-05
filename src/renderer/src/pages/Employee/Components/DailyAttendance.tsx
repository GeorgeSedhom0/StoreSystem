import { useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/ar-sa";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import { MobileDatePicker } from "@mui/x-date-pickers/MobileDatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import EventIcon from "@mui/icons-material/Event";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import EditNoteIcon from "@mui/icons-material/EditNote";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import SearchIcon from "@mui/icons-material/Search";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";

import { AttendanceRecord, AttendanceStatus, Employee } from "../types";
import {
  useAttendance,
  useAttendanceSettings,
  useBulkAttendance,
  useSaveAttendanceDay,
  DEFAULT_SETTINGS,
} from "../api";
import {
  STATUS_META,
  errorText,
  fmtDayLong,
  fmtNum,
  fmtTime,
  isEmployedOn,
  isOffDay,
  lateMinutes,
  todayStr,
  useIsPhone,
  ymd,
} from "../utils";
import { localTimestamp } from "../../utils/functions";
import { AlertMsg } from "../../Shared/AlertMessage";
import StatusButtons from "./StatusButtons";
import DayEditor from "./DayEditor";

const DailyAttendance = ({
  employees,
  employeesLoading,
  setMsg,
}: {
  employees: Employee[];
  employeesLoading: boolean;
  setMsg: (m: AlertMsg) => void;
}) => {
  const isPhone = useIsPhone();
  const [date, setDate] = useState<Dayjs>(dayjs().startOf("day"));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);

  const day = ymd(date);
  const today = todayStr();
  const isToday = day === today;
  const isFuture = day > today;

  const attendance = useAttendance(day, day);
  const { data: settings = DEFAULT_SETTINGS } = useAttendanceSettings();
  const save = useSaveAttendanceDay();
  const bulk = useBulkAttendance();

  const byEmployee = useMemo(() => {
    const m = new Map<number, AttendanceRecord>();
    (attendance.data ?? []).forEach((r) => m.set(r.employee_id, r));
    return m;
  }, [attendance.data]);

  const employed = employees.filter((e) => isEmployedOn(e, day));
  const tracked = employed.filter((e) => e.track_attendance);
  const untracked = employed.filter((e) => !e.track_attendance);
  const q = search.trim();
  const rows = q ? tracked.filter((e) => e.name.includes(q)) : tracked;

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, half: 0, leave: 0, unmarked: 0, off: 0 };
    tracked.forEach((e) => {
      const r = byEmployee.get(e.id);
      if (r) c[r.status] += 1;
      else if (isOffDay(e, day)) c.off += 1;
      else c.unmarked += 1;
    });
    return c;
  }, [tracked, byEmployee, day]);

  const unmarkedIds = tracked
    .filter((e) => !byEmployee.get(e.id) && !isOffDay(e, day))
    .map((e) => e.id);

  const onError = (e: unknown) =>
    setMsg({ type: "error", text: errorText(e, "تعذر حفظ الحضور — أعد المحاولة") });

  const setStatus = (e: Employee, status: AttendanceStatus | null) => {
    const r = byEmployee.get(e.id);
    if (status === null) {
      save.mutate(
        { employee_id: e.id, day, status: null, check_in: null, check_out: null, note: null },
        { onError },
      );
      return;
    }
    const keepTimes = status === "present" || status === "half";
    save.mutate(
      {
        employee_id: e.id,
        day,
        status,
        check_in: keepTimes ? (r?.check_in ?? null) : null,
        check_out: keepTimes ? (r?.check_out ?? null) : null,
        note: r?.note ?? null,
      },
      { onError },
    );
  };

  const stampNow = (e: Employee, field: "check_in" | "check_out") => {
    const r = byEmployee.get(e.id);
    const status =
      r && (r.status === "present" || r.status === "half") ? r.status : "present";
    save.mutate(
      {
        employee_id: e.id,
        day,
        status,
        check_in: r?.check_in ?? null,
        check_out: r?.check_out ?? null,
        note: r?.note ?? null,
        [field]: localTimestamp(),
      },
      { onError },
    );
  };

  const markRestPresent = () => {
    if (!unmarkedIds.length) return;
    const n = unmarkedIds.length;
    bulk.mutate(
      { day, employee_ids: unmarkedIds, status: "present" },
      {
        onSuccess: () =>
          setMsg({ type: "success", text: `تم تسجيل ${fmtNum(n)} موظف حاضر` }),
        onError,
      },
    );
  };

  const summary: { key: keyof typeof counts; label: string; color?: string }[] = [
    { key: "present", label: "حاضر", color: "success" },
    { key: "absent", label: "غائب", color: "error" },
    { key: "half", label: "نصف يوم", color: "warning" },
    { key: "leave", label: "إجازة", color: "info" },
    { key: "unmarked", label: "غير مسجل" },
    { key: "off", label: "إجازة أسبوعية" },
  ];

  return (
    <Stack spacing={1.5}>
      {/* Date stepper */}
      <Card sx={{ p: 1, borderRadius: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="اليوم السابق">
            <IconButton
              onClick={() => setDate((d) => d.subtract(1, "day"))}
              sx={{ width: 48, height: 48 }}
              aria-label="اليوم السابق"
            >
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
          <Button
            onClick={() => setPickerOpen(true)}
            sx={{
              flex: 1,
              minHeight: 48,
              flexDirection: "column",
              lineHeight: 1.2,
              color: "text.primary",
              borderRadius: 2,
            }}
          >
            <Typography
              component="span"
              variant="caption"
              color={isToday ? "primary" : "text.secondary"}
              sx={{ fontWeight: 700 }}
            >
              {isToday
                ? "اليوم"
                : day === ymd(dayjs().subtract(1, "day"))
                  ? "أمس"
                  : isFuture
                    ? "يوم قادم"
                    : " "}
            </Typography>
            <Box
              component="span"
              sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 700, fontSize: 16 }}
            >
              <EventIcon fontSize="small" color="action" />
              {fmtDayLong(date)}
            </Box>
          </Button>
          <Tooltip title="اليوم التالي">
            <IconButton
              onClick={() => setDate((d) => d.add(1, "day"))}
              sx={{ width: 48, height: 48 }}
              aria-label="اليوم التالي"
            >
              <ChevronLeftIcon />
            </IconButton>
          </Tooltip>
        </Box>
        {!isToday && (
          <Box sx={{ textAlign: "center" }}>
            <Button size="small" onClick={() => setDate(dayjs().startOf("day"))}>
              العودة لليوم
            </Button>
          </Box>
        )}
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ar-sa">
          <MobileDatePicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            value={date}
            onAccept={(v) => v && setDate(v.startOf("day"))}
            slotProps={{ textField: { sx: { display: "none" } } }}
          />
        </LocalizationProvider>
      </Card>

      {/* Summary */}
      <Card sx={{ p: 1.5, borderRadius: 3 }}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 0.75,
            alignItems: "center",
          }}
        >
          {summary
            .filter((s) => counts[s.key] > 0 || ["present", "absent", "unmarked"].includes(s.key))
            .map((s) => (
              <Chip
                key={s.key}
                size="small"
                label={`${s.label} ${fmtNum(counts[s.key])}`}
                color={(s.color as "success") ?? "default"}
                variant={s.color ? "filled" : "outlined"}
                sx={{ fontWeight: 600 }}
              />
            ))}
        </Box>
        <Button
          fullWidth
          variant="contained"
          color="success"
          startIcon={<DoneAllIcon />}
          disabled={!unmarkedIds.length || isFuture || bulk.isPending}
          onClick={markRestPresent}
          sx={{ mt: 1.25, minHeight: 44 }}
        >
          {unmarkedIds.length
            ? `تسجيل الباقي حاضر (${fmtNum(unmarkedIds.length)})`
            : "كل الموظفين مسجلون"}
        </Button>
        {isFuture && unmarkedIds.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            يوم قادم — يمكنك تسجيل إجازة مسبقًا لموظف معيّن.
          </Typography>
        )}
      </Card>

      {tracked.length > 6 && (
        <TextField
          size="small"
          placeholder="بحث باسم الموظف"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            htmlInput: { style: { fontSize: 16 } },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}

      {attendance.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => attendance.refetch()}>
              إعادة
            </Button>
          }
        >
          تعذر تحميل الحضور
        </Alert>
      )}

      {(employeesLoading || attendance.isLoading) &&
        [0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={150} sx={{ borderRadius: 3 }} />
        ))}

      {!employeesLoading && !attendance.isLoading && tracked.length === 0 && (
        <Card sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <GroupsOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography sx={{ mt: 1, fontWeight: 600 }}>
            لا يوجد موظفون لتسجيل حضورهم في هذا اليوم
          </Typography>
          <Typography variant="body2" color="text.secondary">
            أضف الموظفين من تبويب «الموظفون».
          </Typography>
        </Card>
      )}

      {!employeesLoading &&
        !attendance.isLoading &&
        rows.map((e) => {
          const r = byEmployee.get(e.id);
          const off = isOffDay(e, day);
          const late = lateMinutes(e, r);
          const isLate = r?.status === "present" && late > settings.late_grace_minutes;
          const timesOk = !r || r.status === "present" || r.status === "half";
          const color = r ? STATUS_META[r.status].color : null;
          return (
            <Card
              key={e.id}
              sx={(t) => ({
                p: 1.5,
                borderRadius: 3,
                borderInlineStart: `4px solid ${
                  color ? t.palette[color].main : off ? t.palette.action.disabled : "transparent"
                }`,
                bgcolor: off && !r ? alpha(t.palette.text.primary, 0.03) : undefined,
              })}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>
                    {e.name}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.25 }}>
                    {off && <Chip size="small" label="إجازة أسبوعية" variant="outlined" />}
                    {!r && !off && (
                      <Chip size="small" label="غير مسجل" variant="outlined" color="default" />
                    )}
                    {isLate && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={`متأخر ${fmtNum(late)} د`}
                      />
                    )}
                  </Box>
                </Box>
                <Tooltip title="المواعيد والملاحظة ومسح اليوم">
                  <IconButton
                    onClick={() => setEditing(e)}
                    sx={{ width: 44, height: 44 }}
                    aria-label="تعديل اليوم"
                  >
                    <EditNoteIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              <StatusButtons
                value={r?.status ?? null}
                onChange={(s) => setStatus(e, s)}
                dense={!isPhone}
                allowDeselect={false}
              />

              {timesOk && (isToday || r?.check_in || r?.check_out) && (
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1 }}>
                  {r?.check_in ? (
                    <Chip
                      icon={<LoginIcon />}
                      label={`حضور ${fmtTime(r.check_in)}`}
                      onClick={() => setEditing(e)}
                      sx={{ height: 40, fontWeight: 600 }}
                    />
                  ) : isToday ? (
                    <Button
                      variant="outlined"
                      startIcon={<LoginIcon />}
                      onClick={() => stampNow(e, "check_in")}
                      sx={{ minHeight: 40 }}
                    >
                      حضور الآن
                    </Button>
                  ) : (
                    <Box />
                  )}
                  {r?.check_out ? (
                    <Chip
                      icon={<LogoutIcon />}
                      label={`انصراف ${fmtTime(r.check_out)}`}
                      onClick={() => setEditing(e)}
                      sx={{ height: 40, fontWeight: 600 }}
                    />
                  ) : isToday && r?.check_in ? (
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<LogoutIcon />}
                      onClick={() => stampNow(e, "check_out")}
                      sx={{ minHeight: 40 }}
                    >
                      انصراف الآن
                    </Button>
                  ) : (
                    <Box />
                  )}
                </Box>
              )}

              {r?.note && (
                <Box
                  onClick={() => setEditing(e)}
                  sx={{
                    display: "flex",
                    gap: 0.75,
                    mt: 1,
                    color: "text.secondary",
                    cursor: "pointer",
                  }}
                >
                  <StickyNote2OutlinedIcon sx={{ fontSize: 18, mt: "1px" }} />
                  <Typography variant="body2">{r.note}</Typography>
                </Box>
              )}
            </Card>
          );
        })}

      {untracked.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
          لا يُتابع حضورهم (يُحتسبون حاضرين): {untracked.map((e) => e.name).join("، ")}
        </Typography>
      )}

      <DayEditor
        open={!!editing}
        employee={editing}
        day={day}
        record={editing ? byEmployee.get(editing.id) : undefined}
        onClose={() => setEditing(null)}
        setMsg={setMsg}
      />
    </Stack>
  );
};

export default DailyAttendance;

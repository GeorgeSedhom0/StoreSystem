import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import dayjs from "dayjs";
import { AttendanceRecord, AttendanceStatus, Employee } from "../types";
import StatusButtons from "./StatusButtons";
import { useSaveAttendanceDay } from "../api";
import {
  errorText,
  fmtDayLong,
  isOffDay,
  todayStr,
  toHHMM,
  useIsPhone,
} from "../utils";
import { AlertMsg } from "../../Shared/AlertMessage";

const nowHHMM = () => dayjs().format("HH:mm");

/** Full editor for one employee's day: status, check-in/out times, note. */
const DayEditor = ({
  open,
  employee,
  day,
  record,
  onClose,
  setMsg,
}: {
  open: boolean;
  employee: Employee | null;
  day: string | null;
  record: AttendanceRecord | undefined;
  onClose: () => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const isPhone = useIsPhone();
  const save = useSaveAttendanceDay();
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setStatus(record?.status ?? null);
    setCheckIn(toHHMM(record?.check_in));
    setCheckOut(toHHMM(record?.check_out));
    setNote(record?.note ?? "");
    // Initialise only when the dialog opens, so a background refetch doesn't
    // wipe what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!employee || !day) return null;

  const isToday = day === todayStr();
  const off = isOffDay(employee, day);
  const timesAllowed = status === null || status === "present" || status === "half";
  const effectiveStatus = status ?? (checkIn || checkOut ? "present" : null);
  const badTimes = !!checkIn && !!checkOut && checkOut <= checkIn;

  const submit = (clear = false) => {
    const input = clear
      ? {
          employee_id: employee.id,
          day,
          status: null,
          check_in: null,
          check_out: null,
          note: null,
        }
      : {
          employee_id: employee.id,
          day,
          status: effectiveStatus,
          check_in: timesAllowed && checkIn ? checkIn : null,
          check_out: timesAllowed && checkOut ? checkOut : null,
          note: effectiveStatus && note.trim() ? note.trim() : null,
        };
    save.mutate(input, {
      onError: (e) =>
        setMsg({ type: "error", text: errorText(e, "تعذر حفظ الحضور") }),
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isPhone} fullWidth maxWidth="xs">
      <DialogTitle sx={{ px: 7 }}>
        <Typography variant="h6" component="div" sx={{ lineHeight: 1.3 }}>
          {employee.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          {fmtDayLong(day)}
          {isToday ? " — اليوم" : ""}
        </Typography>
        <IconButton
          aria-label="إغلاق"
          onClick={onClose}
          sx={{ position: "absolute", top: 10, right: 10 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25}>
          {off && (
            <Alert severity="info" sx={{ py: 0 }}>
              هذا يوم إجازة أسبوعية للموظف. تسجيله حاضرًا يعني أنه عمل في يوم
              إجازته.
            </Alert>
          )}
          {!employee.track_attendance && (
            <Alert severity="warning" sx={{ py: 0 }}>
              الحضور غير مُتابع لهذا الموظف، لذلك لا يؤثر التسجيل على راتبه.
            </Alert>
          )}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              الحالة
            </Typography>
            <StatusButtons value={status} onChange={setStatus} />
          </Box>

          {timesAllowed && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                المواعيد (اختياري)
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1.5,
                }}
              >
                {(
                  [
                    ["الحضور", checkIn, setCheckIn],
                    ["الانصراف", checkOut, setCheckOut],
                  ] as const
                ).map(([label, value, set]) => (
                  <Box key={label}>
                    <TextField
                      type="time"
                      label={label}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      fullWidth
                      slotProps={{
                        inputLabel: { shrink: true },
                        htmlInput: { step: 60, style: { fontSize: 16 } },
                      }}
                    />
                    <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                      {isToday && (
                        <Button
                          size="small"
                          startIcon={<AccessTimeIcon />}
                          onClick={() => set(nowHHMM())}
                          sx={{ minHeight: 36 }}
                        >
                          الآن
                        </Button>
                      )}
                      {value && (
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => set("")}
                          sx={{ minHeight: 36 }}
                        >
                          مسح
                        </Button>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
              {badTimes && (
                <Typography variant="caption" color="text.secondary">
                  الانصراف قبل الحضور — سيُعتبر بعد منتصف الليل.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            label="ملاحظة"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            disabled={!effectiveStatus}
            helperText={!effectiveStatus ? "اختر الحالة أولاً" : undefined}
            slotProps={{ htmlInput: { style: { fontSize: 16 } } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        {record && (
          <Button color="error" onClick={() => submit(true)} sx={{ minHeight: 44 }}>
            مسح اليوم
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          إلغاء
        </Button>
        <Button
          variant="contained"
          onClick={() => submit(false)}
          disabled={!effectiveStatus && !record}
          sx={{ minHeight: 44, minWidth: 96 }}
        >
          حفظ
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DayEditor;

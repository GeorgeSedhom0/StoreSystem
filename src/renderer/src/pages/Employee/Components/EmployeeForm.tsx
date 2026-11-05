import { useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ar-sa";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import { Employee, EmployeePayload, PayType } from "../types";
import { AlertMsg } from "../../Shared/AlertMessage";
import { localTimestamp } from "../../utils/functions";
import { useSaveEmployee } from "../api";
import {
  DAY_NAMES,
  PAY_TYPE_META,
  WEEK_ORDER,
  errorText,
  useIsPhone,
} from "../utils";

const PAY_HELP: Record<PayType, string> = {
  monthly:
    "راتب ثابت كل شهر. الغياب يُخصم بأجر اليوم (الراتب ÷ ٣٠ أو ÷ أيام العمل حسب الإعدادات).",
  daily: "يُصرف أجر عن كل يوم حضور فقط. الغياب لا يُصرف عنه.",
  hourly:
    "يُصرف عن كل ساعة عمل (من الحضور للانصراف). إن لم تُسجَّل المواعيد تُحتسب ساعات اليوم المعتادة.",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box>
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ display: "block", mb: 1, lineHeight: 1.5, fontWeight: 700 }}
    >
      {title}
    </Typography>
    <Stack spacing={2}>{children}</Stack>
  </Box>
);

const inputSx = { htmlInput: { style: { fontSize: 16 } } };

const EmployeeFormDialog = ({
  open,
  employee,
  onClose,
  setMsg,
}: {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const isPhone = useIsPhone();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isPhone}
      fullWidth
      maxWidth="sm"
    >
      {open && (
        <EmployeeForm employee={employee} onClose={onClose} setMsg={setMsg} />
      )}
    </Dialog>
  );
};

const EmployeeForm = ({
  employee,
  onClose,
  setMsg,
}: {
  employee: Employee | null;
  onClose: () => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const [name, setName] = useState(employee?.name ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [address, setAddress] = useState(employee?.address ?? "");
  const [payType, setPayType] = useState<PayType>(employee?.pay_type ?? "monthly");
  const [salary, setSalary] = useState(
    employee ? String(employee.salary ?? "") : "",
  );
  const [startedOn, setStartedOn] = useState(
    employee?.started_on ? dayjs(employee.started_on) : dayjs().startOf("day"),
  );
  const [offDays, setOffDays] = useState<number[]>(employee?.off_days ?? []);
  const [dailyHours, setDailyHours] = useState(
    String(employee?.daily_hours ?? 8),
  );
  const [shiftStart, setShiftStart] = useState(employee?.shift_start ?? "");
  const [track, setTrack] = useState(employee?.track_attendance ?? true);
  const [touched, setTouched] = useState(false);

  const save = useSaveEmployee();

  const salaryNum = parseFloat(salary);
  const hoursNum = parseFloat(dailyHours);
  const errors = {
    name: !name.trim() ? "الاسم مطلوب" : "",
    salary:
      salary === "" || isNaN(salaryNum) || salaryNum < 0
        ? "أدخل مبلغًا صحيحًا"
        : "",
    hours:
      isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 24
        ? "بين ١ و ٢٤ ساعة"
        : "",
    offDays: offDays.length >= 7 ? "لا يمكن أن تكون كل الأيام إجازة" : "",
    started: !startedOn?.isValid() ? "تاريخ غير صحيح" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const toggleDay = (d: number) =>
    setOffDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort(),
    );

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    const payload: EmployeePayload = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      salary: salaryNum,
      started_on: localTimestamp(startedOn),
      pay_type: payType,
      off_days: offDays,
      daily_hours: hoursNum,
      shift_start: shiftStart || null,
      track_attendance: track,
    };
    save.mutate(
      { id: employee?.id ?? null, payload },
      {
        onSuccess: () => {
          setMsg({
            type: "success",
            text: employee ? "تم حفظ بيانات الموظف" : "تمت إضافة الموظف",
          });
          onClose();
        },
        onError: (e) =>
          setMsg({ type: "error", text: errorText(e, "تعذر حفظ بيانات الموظف") }),
      },
    );
  };

  const show = (k: keyof typeof errors) => (touched ? errors[k] : "");

  return (
    <>
      <DialogTitle sx={{ px: 7 }}>
        {employee ? "تعديل بيانات الموظف" : "موظف جديد"}
        <IconButton
          aria-label="إغلاق"
          onClick={onClose}
          sx={{ position: "absolute", top: 10, right: 10 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Section title="البيانات الأساسية">
            <TextField
              label="الاسم"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={!!show("name")}
              helperText={show("name")}
              autoFocus={!employee}
              required
              fullWidth
              slotProps={inputSx}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                label="رقم الهاتف"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
                slotProps={{
                  htmlInput: { inputMode: "tel", style: { fontSize: 16 } },
                }}
              />
              <TextField
                label="العنوان"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                fullWidth
                slotProps={inputSx}
              />
            </Box>
          </Section>

          <Section title="الراتب">
            <ToggleButtonGroup
              exclusive
              fullWidth
              color="primary"
              value={payType}
              onChange={(_, v) => v && setPayType(v)}
            >
              {(Object.keys(PAY_TYPE_META) as PayType[]).map((p) => (
                <ToggleButton key={p} value={p} sx={{ minHeight: 44, fontWeight: 600 }}>
                  {PAY_TYPE_META[p].label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField
              label={PAY_TYPE_META[payType].rateLabel}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              error={!!show("salary")}
              helperText={show("salary") || PAY_HELP[payType]}
              fullWidth
              type="number"
              slotProps={{
                htmlInput: { inputMode: "decimal", min: 0, style: { fontSize: 16 } },
                input: {
                  endAdornment: <InputAdornment position="end">ج.م</InputAdornment>,
                },
              }}
            />
            <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ar-sa">
              <DatePicker
                label="تاريخ التعيين"
                value={startedOn}
                onChange={(v) => v && setStartedOn(v)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!show("started"),
                    helperText:
                      show("started") ||
                      "الراتب يُحتسب من هذا اليوم (الشهر الأول بنسبة الأيام).",
                  },
                }}
              />
            </LocalizationProvider>
          </Section>

          <Section title="مواعيد العمل">
            <Box>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                الإجازة الأسبوعية
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {WEEK_ORDER.map((d) => {
                  const on = offDays.includes(d);
                  return (
                    <Chip
                      key={d}
                      label={DAY_NAMES[d]}
                      clickable
                      color={on ? "primary" : "default"}
                      variant={on ? "filled" : "outlined"}
                      onClick={() => toggleDay(d)}
                      aria-pressed={on}
                      sx={{ height: 40, px: 0.5, fontSize: 14 }}
                    />
                  );
                })}
              </Box>
              <Typography
                variant="caption"
                color={show("offDays") ? "error" : "text.secondary"}
                sx={{ display: "block", mt: 0.75 }}
              >
                {show("offDays") ||
                  "أيام لا يعمل فيها الموظف ولا يُحتسب فيها غياب."}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
              }}
            >
              <TextField
                label="ساعات العمل اليومية"
                value={dailyHours}
                onChange={(e) => setDailyHours(e.target.value)}
                type="number"
                error={!!show("hours")}
                helperText={show("hours") || "لحساب أجر الساعة والإضافي"}
                slotProps={{
                  htmlInput: {
                    inputMode: "decimal",
                    min: 1,
                    max: 24,
                    step: 0.5,
                    style: { fontSize: 16 },
                  },
                }}
              />
              <TextField
                label="بداية الوردية"
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                helperText={
                  shiftStart ? (
                    <Box
                      component="span"
                      sx={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setShiftStart("")}
                    >
                      إزالة الموعد
                    </Box>
                  ) : (
                    "اختياري — لحساب التأخير"
                  )
                }
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { step: 60, style: { fontSize: 16 } },
                }}
              />
            </Box>
          </Section>

          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              px: 1.5,
              py: 1,
            }}
          >
            <FormControlLabel
              sx={{ m: 0, width: "100%", justifyContent: "space-between" }}
              labelPlacement="start"
              control={
                <Switch checked={track} onChange={(e) => setTrack(e.target.checked)} />
              }
              label={
                <Typography sx={{ fontWeight: 500 }}>متابعة الحضور</Typography>
              }
            />
            <Typography variant="caption" color="text.secondary" component="p">
              {track
                ? "يُسجَّل حضوره يوميًا ويُحسب راتبه حسب الحضور والغياب."
                : "لا يحتاج تسجيل حضور يومي، ويُصرف راتبه كأنه حاضر كل أيام العمل."}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          إلغاء
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={save.isPending}
          sx={{ minHeight: 44, minWidth: 120 }}
        >
          {employee ? "حفظ التعديلات" : "إضافة الموظف"}
        </Button>
      </DialogActions>
    </>
  );
};

export default EmployeeFormDialog;

import { useEffect, useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/ar-sa";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import CloseIcon from "@mui/icons-material/Close";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import { Employee } from "../types";
import { usePaySalary, useSalaryPreview } from "../api";
import usePaymentMethods from "../../Shared/hooks/usePaymentMethods";
import { localTimestamp } from "../../utils/functions";
import { AlertMsg } from "../../Shared/AlertMessage";
import {
  PAY_TYPE_META,
  errorText,
  fmtMoney,
  fmtPeriod,
  rateText,
  useIsPhone,
  ymd,
} from "../utils";
import SalaryBreakdown from "./SalaryBreakdown";

const PaySalaryDialog = ({
  open,
  employee,
  initialMonth,
  onClose,
  setMsg,
}: {
  open: boolean;
  employee: Employee | null;
  initialMonth?: Dayjs | null;
  onClose: () => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const isPhone = useIsPhone();
  return (
    <Dialog open={open} onClose={onClose} fullScreen={isPhone} fullWidth maxWidth="sm">
      {open && employee && (
        <PaySalary
          employee={employee}
          initialMonth={initialMonth ?? null}
          onClose={onClose}
          setMsg={setMsg}
        />
      )}
    </Dialog>
  );
};

/** Default period: the month after the last paid period, else this month. */
const defaultPeriod = (employee: Employee, initialMonth: Dayjs | null) => {
  if (initialMonth)
    return { mode: "month" as const, start: initialMonth.startOf("month"), end: initialMonth.endOf("month") };
  if (employee.last_paid_end) {
    const next = dayjs(employee.last_paid_end).add(1, "day");
    if (next.date() === 1)
      return { mode: "month" as const, start: next, end: next.endOf("month") };
    return { mode: "custom" as const, start: next, end: next.endOf("month") };
  }
  const m = dayjs().startOf("month");
  return { mode: "month" as const, start: m, end: m.endOf("month") };
};

const money = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

const PaySalary = ({
  employee,
  initialMonth,
  onClose,
  setMsg,
}: {
  employee: Employee;
  initialMonth: Dayjs | null;
  onClose: () => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const init = useMemo(() => defaultPeriod(employee, initialMonth), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<"month" | "custom">(init.mode);
  const [month, setMonth] = useState<Dayjs>(init.start.startOf("month"));
  const [rangeStart, setRangeStart] = useState<Dayjs>(init.start);
  const [rangeEnd, setRangeEnd] = useState<Dayjs>(init.end);

  const [amount, setAmount] = useState("");
  const [bonus, setBonus] = useState("0");
  const [deductions, setDeductions] = useState("0");
  const [appliedKey, setAppliedKey] = useState("");
  const [payTime, setPayTime] = useState<Dayjs>(dayjs());
  const [methodId, setMethodId] = useState<number | "">("");
  const [note, setNote] = useState("");

  const { paymentMethods } = usePaymentMethods();
  const pay = usePaySalary();

  const start = mode === "month" ? ymd(month.startOf("month")) : rangeStart?.isValid() ? ymd(rangeStart) : null;
  const end = mode === "month" ? ymd(month.endOf("month")) : rangeEnd?.isValid() ? ymd(rangeEnd) : null;
  const rangeInvalid = !start || !end || end < start;
  const key = `${start}|${end}`;

  const preview = useSalaryPreview(employee.id, rangeInvalid ? null : start, end);
  const p = preview.data;
  const fresh = !!p && p.period.start === start && p.period.end === end;

  // Prefill the amounts from the calculation each time the period changes.
  useEffect(() => {
    if (fresh && p && appliedKey !== key) {
      setAmount(String(p.amount));
      setBonus(String(p.bonus));
      setDeductions(String(p.deductions));
      setAppliedKey(key);
    }
  }, [fresh, p, key, appliedKey]);

  useEffect(() => {
    if (methodId === "" && paymentMethods.length) {
      const def = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0];
      setMethodId(def.id);
    }
  }, [paymentMethods, methodId]);

  const a = money(amount);
  const b = money(bonus || "0");
  const d = money(deductions || "0");
  const net = (a || 0) + (b || 0) - (d || 0);
  const invalid =
    rangeInvalid || [a, b, d].some((x) => isNaN(x) || x < 0) || net < 0 || !payTime?.isValid();
  const edited =
    fresh && p && (a !== p.amount || b !== p.bonus || d !== p.deductions);

  const resetToSuggested = () => {
    if (!p) return;
    setAmount(String(p.amount));
    setBonus(String(p.bonus));
    setDeductions(String(p.deductions));
  };

  const submit = () => {
    if (invalid || !start || !end) return;
    pay.mutate(
      {
        employeeId: employee.id,
        amount: a,
        bonus: b,
        deductions: d,
        time: localTimestamp(payTime),
        paymentMethodId: methodId,
        periodStart: start,
        periodEnd: end,
        details: fresh && p
          ? {
              lines: p.lines,
              counts: p.counts,
              rates: p.rates,
              pay_type: p.pay_type,
              salary: p.salary,
              suggested: { amount: p.amount, bonus: p.bonus, deductions: p.deductions },
            }
          : { pay_type: employee.pay_type, salary: employee.salary },
        note,
      },
      {
        onSuccess: () => {
          setMsg({ type: "success", text: `تم دفع راتب ${employee.name}` });
          onClose();
        },
        onError: (e) =>
          setMsg({ type: "error", text: errorText(e, "تعذر دفع الراتب") }),
      },
    );
  };

  const numField = (
    label: string,
    value: string,
    set: (v: string) => void,
    helper?: string,
  ) => (
    <TextField
      label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      type="number"
      fullWidth
      error={isNaN(money(value || "0")) || money(value || "0") < 0}
      helperText={helper}
      onFocus={(e) => e.target.select()}
      slotProps={{
        htmlInput: { inputMode: "decimal", min: 0, style: { fontSize: 16 } },
        input: { endAdornment: <InputAdornment position="end">ج.م</InputAdornment> },
      }}
    />
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ar-sa">
      <DialogTitle sx={{ px: 7 }}>
        <Typography variant="h6" component="div" sx={{ lineHeight: 1.3 }}>
          دفع راتب {employee.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          {PAY_TYPE_META[employee.pay_type]?.label} · {rateText(employee)}
        </Typography>
        <IconButton
          aria-label="إغلاق"
          onClick={onClose}
          sx={{ position: "absolute", top: 10, right: 10 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 } }}>
        <Stack spacing={2.5}>
          {/* Period */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              الفترة
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              value={mode}
              onChange={(_, v) => {
                if (!v) return;
                if (v === "custom" && mode === "month") {
                  setRangeStart(month.startOf("month"));
                  setRangeEnd(month.endOf("month"));
                }
                setMode(v);
              }}
              sx={{ mb: 1.5 }}
            >
              <ToggleButton value="month" sx={{ minHeight: 40 }}>
                شهر
              </ToggleButton>
              <ToggleButton value="custom" sx={{ minHeight: 40 }}>
                فترة مخصصة
              </ToggleButton>
            </ToggleButtonGroup>
            {mode === "month" ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <IconButton
                  onClick={() => setMonth((m) => m.subtract(1, "month"))}
                  aria-label="الشهر السابق"
                  sx={{ width: 44, height: 44 }}
                >
                  <ChevronRightIcon />
                </IconButton>
                <DatePicker
                  value={month}
                  onChange={(v) => v?.isValid() && setMonth(v.startOf("month"))}
                  views={["year", "month"]}
                  openTo="month"
                  format="MMMM YYYY"
                  slotProps={{ textField: { fullWidth: true, size: "small" } }}
                />
                <IconButton
                  onClick={() => setMonth((m) => m.add(1, "month"))}
                  aria-label="الشهر التالي"
                  sx={{ width: 44, height: 44 }}
                >
                  <ChevronLeftIcon />
                </IconButton>
              </Box>
            ) : (
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                <DatePicker
                  label="من"
                  value={rangeStart}
                  onChange={(v) => v && setRangeStart(v)}
                  slotProps={{ textField: { fullWidth: true, size: "small" } }}
                />
                <DatePicker
                  label="إلى"
                  value={rangeEnd}
                  onChange={(v) => v && setRangeEnd(v)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      error: rangeInvalid,
                      helperText: rangeInvalid ? "النهاية قبل البداية" : undefined,
                    },
                  }}
                />
              </Box>
            )}
            {employee.last_paid_end && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                آخر راتب مدفوع حتى {fmtPeriod(employee.last_paid_end, null)}
              </Typography>
            )}
          </Box>

          {fresh && p && p.overlapping.length > 0 && (
            <Alert severity="warning">
              تم دفع راتب لفترة متداخلة مع هذه الفترة:
              {p.overlapping.map((o) => (
                <Box key={o.id} component="span" sx={{ display: "block", fontWeight: 600 }}>
                  {fmtPeriod(o.period_start, o.period_end)} — {fmtMoney(o.net)}
                </Box>
              ))}
              تأكد أنك لا تدفع نفس الفترة مرتين.
            </Alert>
          )}

          {/* Calculation */}
          <Box
            sx={(t) => ({
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: 1.5,
              bgcolor: alpha(t.palette.text.primary, 0.015),
            })}
          >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              الحساب حسب الحضور
            </Typography>
            {preview.isError ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" onClick={() => preview.refetch()}>
                    إعادة
                  </Button>
                }
              >
                {errorText(preview.error, "تعذر حساب الراتب")}
              </Alert>
            ) : rangeInvalid ? (
              <Typography variant="body2" color="text.secondary">
                اختر فترة صحيحة
              </Typography>
            ) : !fresh || !p ? (
              <Stack spacing={1}>
                <Skeleton variant="rounded" height={22} />
                <Skeleton variant="rounded" height={22} />
                <Skeleton variant="rounded" height={22} width="60%" />
              </Stack>
            ) : (
              <SalaryBreakdown lines={p.lines} />
            )}
          </Box>

          {/* Amounts */}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                المبالغ
              </Typography>
              {edited && (
                <Button size="small" startIcon={<RestartAltIcon />} onClick={resetToSuggested}>
                  القيم المحسوبة
                </Button>
              )}
            </Box>
            <Stack spacing={1.5}>
              {numField(
                employee.pay_type === "monthly" ? "الراتب الأساسي" : "المستحق عن العمل",
                amount,
                setAmount,
              )}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                {numField("مكافأة / إضافي", bonus, setBonus)}
                {numField("خصومات", deductions, setDeductions)}
              </Box>
            </Stack>
            <Box
              sx={(t) => ({
                mt: 1.5,
                p: 1.5,
                borderRadius: 2,
                bgcolor: alpha(net < 0 ? t.palette.error.main : t.palette.primary.main, 0.08),
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              })}
            >
              <Typography sx={{ fontWeight: 600 }}>الصافي المدفوع</Typography>
              <Typography
                variant="h5"
                sx={{ fontWeight: 800, color: net < 0 ? "error.main" : "primary.main" }}
              >
                {fmtMoney(net)}
              </Typography>
            </Box>
            {net < 0 && (
              <Typography variant="caption" color="error">
                الخصومات أكبر من المستحق
              </Typography>
            )}
          </Box>

          {/* Payment */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              الدفع
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 1.5,
              }}
            >
              <DateTimePicker
                label="تاريخ الدفع"
                value={payTime}
                onChange={(v) => v && setPayTime(v)}
                ampm
                slotProps={{ textField: { fullWidth: true } }}
              />
              <FormControl fullWidth>
                <InputLabel>الحساب</InputLabel>
                <Select
                  label="الحساب"
                  value={methodId}
                  onChange={(e) =>
                    setMethodId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                >
                  {paymentMethods.length === 0 && (
                    <MenuItem value="">
                      <em>الحساب الافتراضي</em>
                    </MenuItem>
                  )}
                  {paymentMethods.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <TextField
              label="ملاحظة (اختياري)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
              multiline
              sx={{ mt: 1.5 }}
              slotProps={{ htmlInput: { style: { fontSize: 16 } } }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          إلغاء
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={invalid || pay.isPending || (!fresh && !preview.isError)}
          sx={{ minHeight: 44, minWidth: 140, fontWeight: 700 }}
        >
          {pay.isPending ? "جارٍ الدفع…" : `دفع ${fmtMoney(net)}`}
        </Button>
      </DialogActions>
    </LocalizationProvider>
  );
};

export default PaySalaryDialog;

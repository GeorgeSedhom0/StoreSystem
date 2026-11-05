import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined";

import { Employee, SalaryPayment } from "../types";
import { useSalaries } from "../api";
import { fmtDateTime, fmtMoney, fmtNum, fmtPeriod } from "../utils";
import SalaryBreakdown from "./SalaryBreakdown";

const Amount = ({ label, value, color }: { label: string; value: number; color?: string }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, color }} noWrap>
      {fmtMoney(value)}
    </Typography>
  </Box>
);

const PaymentCard = ({ s }: { s: SalaryPayment }) => {
  const [open, setOpen] = useState(false);
  const lines = s.details?.lines ?? [];
  const canExpand = lines.length > 0 || !!s.note;
  return (
    <Card sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Box
        onClick={() => canExpand && setOpen((o) => !o)}
        sx={{ p: 1.5, cursor: canExpand ? "pointer" : "default" }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {s.employee_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {fmtPeriod(s.period_start, s.period_end)}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "end" }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: "primary.main", lineHeight: 1.2 }}>
              {fmtMoney(s.net)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              الصافي
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
            mt: 1,
          }}
        >
          <Amount label="الأساسي" value={s.amount} />
          <Amount label="مكافأة" value={s.bonus} color={s.bonus ? "success.main" : undefined} />
          <Amount label="خصومات" value={s.deductions} color={s.deductions ? "error.main" : undefined} />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1, flexWrap: "wrap" }}>
          {s.time && (
            <Typography variant="caption" color="text.secondary">
              دُفع {fmtDateTime(s.time)}
            </Typography>
          )}
          <Chip
            size="small"
            variant="outlined"
            icon={<AccountBalanceWalletOutlinedIcon />}
            label={s.payment_method_name ?? "الحساب الافتراضي"}
          />
          {s.note && <StickyNote2OutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />}
          <Box sx={{ flex: 1 }} />
          {canExpand && (
            <ExpandMoreIcon
              sx={{
                color: "text.secondary",
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform 150ms",
              }}
            />
          )}
        </Box>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5, borderTop: 1, borderColor: "divider" }}>
          {s.note && (
            <Typography variant="body2" sx={{ my: 1 }}>
              ملاحظة: {s.note}
            </Typography>
          )}
          {lines.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <SalaryBreakdown lines={lines} />
              {s.details?.suggested &&
                (s.details.suggested.amount !== s.amount ||
                  s.details.suggested.bonus !== s.bonus ||
                  s.details.suggested.deductions !== s.deductions) && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    عُدّلت المبالغ يدويًا عن المحسوب (
                    {fmtMoney(
                      s.details.suggested.amount + s.details.suggested.bonus - s.details.suggested.deductions,
                    )}
                    ).
                  </Typography>
                )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Card>
  );
};

const SalaryHistory = ({ employees }: { employees: Employee[] }) => {
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const salaries = useSalaries(employeeId);
  const list = salaries.data ?? [];
  const total = list.reduce((acc, s) => acc + s.net, 0);

  return (
    <Stack spacing={1.5}>
      <Card sx={{ p: 1.5, borderRadius: 3 }}>
        <FormControl fullWidth size="small">
          <InputLabel shrink>الموظف</InputLabel>
          <Select
            label="الموظف"
            notched
            displayEmpty
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <MenuItem value="">كل الموظفين</MenuItem>
            {employees.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.name}
                {e.stopped_on ? " (سابق)" : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {list.length > 0 && (
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1.25, gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {fmtNum(list.length)} دفعة
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              الإجمالي {fmtMoney(total)}
            </Typography>
          </Box>
        )}
      </Card>

      {salaries.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => salaries.refetch()}>
              إعادة
            </Button>
          }
        >
          تعذر تحميل سجل الرواتب
        </Alert>
      )}

      {salaries.isLoading &&
        [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={130} sx={{ borderRadius: 3 }} />)}

      {!salaries.isLoading && !salaries.isError && list.length === 0 && (
        <Card sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <ReceiptLongOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography sx={{ mt: 1, fontWeight: 600 }}>لا توجد رواتب مدفوعة بعد</Typography>
          <Typography variant="body2" color="text.secondary">
            ادفع الراتب من بطاقة الموظف في تبويب «الموظفون».
          </Typography>
        </Card>
      )}

      {list.map((s) => (
        <PaymentCard key={s.id} s={s} />
      ))}
    </Stack>
  );
};

export default SalaryHistory;

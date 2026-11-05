import { useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Divider,
  Grid2,
  IconButton,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import PersonAddAlt1OutlinedIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import RestoreIcon from "@mui/icons-material/Restore";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";

import { AttendanceRecord, Employee } from "../types";
import {
  PAY_TYPE_META,
  STATUS_META,
  fmtDate,
  fmtNum,
  fmtPeriod,
  fmtTime,
  isOffDay,
  offDaysText,
  rateText,
  todayStr,
} from "../utils";

export interface EmployeeActions {
  onEdit: (e: Employee) => void;
  onCalendar: (e: Employee) => void;
  onPay: (e: Employee) => void;
  onEnd: (e: Employee) => void;
  onRehire: (e: Employee) => void;
}

const avatarColor = (id: number) =>
  ["primary.main", "secondary.main", "success.main", "info.main", "warning.main"][id % 5];

const TodayChip = ({ e, rec }: { e: Employee; rec?: AttendanceRecord }) => {
  if (!e.track_attendance)
    return <Chip size="small" variant="outlined" label="بدون متابعة حضور" />;
  if (rec)
    return (
      <Chip
        size="small"
        color={STATUS_META[rec.status].color}
        label={
          STATUS_META[rec.status].label +
          (rec.check_in ? ` · ${fmtTime(rec.check_in)}` : "")
        }
        sx={{ fontWeight: 600 }}
      />
    );
  if (isOffDay(e, todayStr()))
    return <Chip size="small" variant="outlined" label="إجازة أسبوعية" />;
  return <Chip size="small" variant="outlined" label="لم يُسجَّل اليوم" />;
};

const EmployeeCard = ({
  e,
  rec,
  actions,
}: {
  e: Employee;
  rec?: AttendanceRecord;
  actions: EmployeeActions;
}) => {
  const ended = !!e.stopped_on;
  return (
    <Card
      sx={{
        borderRadius: 3,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        opacity: ended ? 0.85 : 1,
      }}
    >
      <Box sx={{ p: 1.5, display: "flex", gap: 1.25, alignItems: "flex-start" }}>
        <Avatar sx={{ bgcolor: ended ? "action.disabled" : avatarColor(e.id), width: 44, height: 44, fontWeight: 700 }}>
          {e.name.trim().charAt(0) || "؟"}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap title={e.name}>
            {e.name}
          </Typography>
          {e.phone ? (
            <Box
              component="a"
              href={`tel:${e.phone}`}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                color: "text.secondary",
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              <PhoneOutlinedIcon sx={{ fontSize: 15 }} />
              <span dir="ltr">{e.phone}</span>
            </Box>
          ) : (
            <Typography variant="caption" color="text.disabled">
              بدون رقم هاتف
            </Typography>
          )}
        </Box>
        {ended ? (
          <Chip size="small" label="انتهى التعيين" />
        ) : (
          <TodayChip e={e} rec={rec} />
        )}
      </Box>

      <Box sx={{ px: 1.5, pb: 1, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 1.5, rowGap: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          الراتب
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {rateText(e)}{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            ({PAY_TYPE_META[e.pay_type]?.label})
          </Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          الإجازة
        </Typography>
        <Typography variant="body2">{offDaysText(e.off_days)}</Typography>
        {(e.shift_start || e.daily_hours !== 8) && (
          <>
            <Typography variant="body2" color="text.secondary">
              الدوام
            </Typography>
            <Typography variant="body2">
              {fmtNum(e.daily_hours)} ساعات
              {e.shift_start ? ` · يبدأ ${fmtTime(e.shift_start)}` : ""}
            </Typography>
          </>
        )}
        <Typography variant="body2" color="text.secondary">
          {ended ? "الفترة" : "آخر راتب"}
        </Typography>
        <Typography variant="body2">
          {ended
            ? `${fmtDate(e.started_on)} – ${fmtDate(e.stopped_on!)}`
            : e.last_paid_end
              ? `حتى ${fmtPeriod(e.last_paid_end, null)}`
              : "لم يُدفع بعد"}
        </Typography>
      </Box>

      <Box sx={{ flex: 1 }} />
      <Divider />
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, p: 1 }}>
        <Button
          size="small"
          startIcon={<CalendarMonthOutlinedIcon />}
          onClick={() => actions.onCalendar(e)}
          sx={{ minHeight: 40 }}
        >
          الحضور
        </Button>
        <Button
          size="small"
          startIcon={<PaymentsOutlinedIcon />}
          onClick={() => actions.onPay(e)}
          sx={{ minHeight: 40 }}
        >
          {ended ? "تسوية" : "دفع راتب"}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="تعديل">
          <IconButton onClick={() => actions.onEdit(e)} sx={{ width: 40, height: 40 }} aria-label="تعديل">
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {ended ? (
          <Tooltip title="إعادة تعيين">
            <IconButton onClick={() => actions.onRehire(e)} sx={{ width: 40, height: 40 }} aria-label="إعادة تعيين">
              <RestoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="إنهاء التعيين">
            <IconButton
              onClick={() => actions.onEnd(e)}
              sx={{ width: 40, height: 40 }}
              color="error"
              aria-label="إنهاء التعيين"
            >
              <PersonOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Card>
  );
};

const EmployeesTab = ({
  employees,
  loading,
  error,
  retry,
  todayRecords,
  onAdd,
  actions,
}: {
  employees: Employee[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  todayRecords: Map<number, AttendanceRecord>;
  onAdd: () => void;
  actions: EmployeeActions;
}) => {
  const [showFormer, setShowFormer] = useState(false);
  const active = employees.filter((e) => !e.stopped_on);
  const former = employees.filter((e) => !!e.stopped_on);

  if (error)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={retry}>
            إعادة
          </Button>
        }
      >
        تعذر تحميل الموظفين
      </Alert>
    );

  if (loading)
    return (
      <Grid2 container spacing={1.5}>
        {[0, 1, 2].map((i) => (
          <Grid2 key={i} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Skeleton variant="rounded" height={210} sx={{ borderRadius: 3 }} />
          </Grid2>
        ))}
      </Grid2>
    );

  return (
    <Box>
      {active.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <GroupsOutlinedIcon sx={{ fontSize: 56, color: "text.disabled" }} />
          <Typography sx={{ mt: 1, fontWeight: 700 }}>لا يوجد موظفون حاليًا</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            أضف موظفيك لتسجيل حضورهم وحساب رواتبهم تلقائيًا.
          </Typography>
          <Button variant="contained" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={onAdd} sx={{ minHeight: 44 }}>
            إضافة موظف
          </Button>
        </Card>
      ) : (
        <Grid2 container spacing={1.5}>
          {active.map((e) => (
            <Grid2 key={e.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <EmployeeCard e={e} rec={todayRecords.get(e.id)} actions={actions} />
            </Grid2>
          ))}
        </Grid2>
      )}

      {former.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Button
            color="inherit"
            onClick={() => setShowFormer((s) => !s)}
            endIcon={
              <ExpandMoreIcon
                sx={{ transform: showFormer ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
              />
            }
            sx={{ minHeight: 40, color: "text.secondary" }}
          >
            موظفون سابقون ({fmtNum(former.length)})
          </Button>
          <Collapse in={showFormer} unmountOnExit>
            <Grid2 container spacing={1.5} sx={{ mt: 0.5 }}>
              {former.map((e) => (
                <Grid2 key={e.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <EmployeeCard e={e} actions={actions} />
                </Grid2>
              ))}
            </Grid2>
          </Collapse>
        </Box>
      )}
    </Box>
  );
};

export default EmployeesTab;

import { useMemo, useState } from "react";
import { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonAddAlt1OutlinedIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";

import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import { localTimestamp } from "../utils/functions";
import { AttendanceRecord, Employee as EmployeeT } from "./types";
import {
  useAttendance,
  useEmployees,
  useEndEmployment,
  useSaveEmployee,
} from "./api";
import { errorText, todayStr, useIsPhone } from "./utils";
import EmployeesTab, { EmployeeActions } from "./Components/EmployeesTab";
import EmployeeFormDialog from "./Components/EmployeeForm";
import DailyAttendance from "./Components/DailyAttendance";
import SalaryHistory from "./Components/SalaryHistory";
import EmployeeCalendar from "./Components/EmployeeCalendar";
import PaySalaryDialog from "./Components/PaySalary";
import AttendanceSettingsDialog from "./Components/AttendanceSettingsDialog";

const TAB_KEY = "employeePage.tab";
const readTab = () => {
  try {
    const v = Number(localStorage.getItem(TAB_KEY));
    return v >= 0 && v <= 2 ? v : 0;
  } catch {
    return 0;
  }
};

type Confirm = { kind: "end" | "rehire"; employee: EmployeeT } | null;

export default function Employee() {
  const isPhone = useIsPhone();
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [tab, setTab] = useState<number>(readTab);

  const employees = useEmployees();
  const list = employees.data ?? [];
  const today = todayStr();
  const todayAttendance = useAttendance(today, today);
  const todayRecords = useMemo(() => {
    const m = new Map<number, AttendanceRecord>();
    (todayAttendance.data ?? []).forEach((r) => m.set(r.employee_id, r));
    return m;
  }, [todayAttendance.data]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeT | null>(null);
  const [calendarFor, setCalendarFor] = useState<EmployeeT | null>(null);
  const [payFor, setPayFor] = useState<{ e: EmployeeT; month: Dayjs | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const endEmployment = useEndEmployment();
  const saveEmployee = useSaveEmployee();

  // Keep dialogs pointing at the freshest copy of the employee.
  const fresh = (e: EmployeeT | null) => (e ? (list.find((x) => x.id === e.id) ?? e) : null);

  const changeTab = (v: number) => {
    setTab(v);
    try {
      localStorage.setItem(TAB_KEY, String(v));
    } catch {
      /* ignore */
    }
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const actions: EmployeeActions = {
    onEdit: (e) => {
      setEditing(e);
      setFormOpen(true);
    },
    onCalendar: (e) => setCalendarFor(e),
    onPay: (e) => setPayFor({ e, month: null }),
    onEnd: (e) => setConfirm({ kind: "end", employee: e }),
    onRehire: (e) => setConfirm({ kind: "rehire", employee: e }),
  };

  const doConfirm = () => {
    if (!confirm) return;
    const e = confirm.employee;
    if (confirm.kind === "end") {
      endEmployment.mutate(e.id, {
        onSuccess: () => setMsg({ type: "success", text: `تم إنهاء تعيين ${e.name}` }),
        onError: (err) => setMsg({ type: "error", text: errorText(err) }),
      });
    } else {
      saveEmployee.mutate(
        {
          id: e.id,
          payload: {
            name: e.name,
            phone: e.phone ?? "",
            address: e.address ?? "",
            salary: e.salary,
            started_on: localTimestamp(dayjs().startOf("day")),
            stopped_on: null,
          },
        },
        {
          onSuccess: () => setMsg({ type: "success", text: `تمت إعادة تعيين ${e.name}` }),
          onError: (err) => setMsg({ type: "error", text: errorText(err) }),
        },
      );
    }
    setConfirm(null);
  };

  return (
    <Box sx={{ maxWidth: 1280, mx: "auto", width: "100%" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

      <Card sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              الموظفون
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap={isPhone}>
              الحضور والانصراف والرواتب
            </Typography>
          </Box>
          <Tooltip title="إعدادات الحضور والرواتب">
            <IconButton
              onClick={() => setSettingsOpen(true)}
              sx={{ width: 44, height: 44 }}
              aria-label="إعدادات الحضور"
            >
              <SettingsOutlinedIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<PersonAddAlt1OutlinedIcon />}
            onClick={openAdd}
            sx={{ minHeight: 44, whiteSpace: "nowrap" }}
          >
            {isPhone ? "إضافة" : "موظف جديد"}
          </Button>
        </Box>
        <Tabs
          value={tab}
          onChange={(_, v) => changeTab(v)}
          variant="fullWidth"
          sx={{
            mt: 1,
            mx: { xs: -1.5, sm: 0 },
            "& .MuiTab-root": { minHeight: 52, px: 0.5, fontWeight: 600, fontSize: { xs: 13, sm: 14 } },
          }}
        >
          <Tab icon={<GroupsOutlinedIcon />} iconPosition={isPhone ? "top" : "start"} label="الموظفون" />
          <Tab icon={<FactCheckOutlinedIcon />} iconPosition={isPhone ? "top" : "start"} label="الحضور اليومي" />
          <Tab icon={<ReceiptLongOutlinedIcon />} iconPosition={isPhone ? "top" : "start"} label="سجل الرواتب" />
        </Tabs>
      </Card>

      {tab === 0 && (
        <EmployeesTab
          employees={list}
          loading={employees.isLoading}
          error={employees.isError}
          retry={() => employees.refetch()}
          todayRecords={todayRecords}
          onAdd={openAdd}
          actions={actions}
        />
      )}
      {tab === 1 && (
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <DailyAttendance employees={list} employeesLoading={employees.isLoading} setMsg={setMsg} />
        </Box>
      )}
      {tab === 2 && (
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <SalaryHistory employees={list} />
        </Box>
      )}

      <EmployeeFormDialog
        open={formOpen}
        employee={editing}
        onClose={() => setFormOpen(false)}
        setMsg={setMsg}
      />

      <EmployeeCalendar
        open={!!calendarFor}
        employee={fresh(calendarFor)}
        onClose={() => setCalendarFor(null)}
        onPay={(e, month) => setPayFor({ e, month })}
        setMsg={setMsg}
      />

      <PaySalaryDialog
        open={!!payFor}
        employee={fresh(payFor?.e ?? null)}
        initialMonth={payFor?.month}
        onClose={() => setPayFor(null)}
        setMsg={setMsg}
      />

      <AttendanceSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        setMsg={setMsg}
      />

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {confirm?.kind === "end"
            ? `إنهاء تعيين ${confirm?.employee.name}؟`
            : `إعادة تعيين ${confirm?.employee.name}؟`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirm?.kind === "end"
              ? "سيتوقف احتساب راتبه من بعد اليوم، ويبقى سجل حضوره ورواتبه كما هو. يمكنك دفع التسوية من بطاقته في «موظفون سابقون»."
              : "سيعود للعمل ويبدأ احتساب راتبه من اليوم."}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirm(null)} sx={{ minHeight: 44 }}>
            إلغاء
          </Button>
          <Button
            variant="contained"
            color={confirm?.kind === "end" ? "error" : "primary"}
            onClick={doConfirm}
            sx={{ minHeight: 44 }}
          >
            {confirm?.kind === "end" ? "إنهاء التعيين" : "إعادة التعيين"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

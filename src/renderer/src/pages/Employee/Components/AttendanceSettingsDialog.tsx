import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { AttendanceSettings } from "../types";
import { DEFAULT_SETTINGS, useAttendanceSettings, useSaveAttendanceSettings } from "../api";
import { errorText, useIsPhone } from "../utils";
import { AlertMsg } from "../../Shared/AlertMessage";

const Block = ({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) => (
  <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5 }}>
    <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
      {help}
    </Typography>
    {children}
  </Box>
);

const radioSx = { minHeight: 40, mr: 0 };

const AttendanceSettingsDialog = ({
  open,
  onClose,
  setMsg,
}: {
  open: boolean;
  onClose: () => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const isPhone = useIsPhone();
  const settings = useAttendanceSettings();
  const save = useSaveAttendanceSettings();
  const [s, setS] = useState<AttendanceSettings>(DEFAULT_SETTINGS);
  const [grace, setGrace] = useState("15");
  const [mult, setMult] = useState("1.5");

  useEffect(() => {
    if (open && settings.data) {
      setS(settings.data);
      setGrace(String(settings.data.late_grace_minutes));
      setMult(String(settings.data.overtime_multiplier));
    }
  }, [open, settings.data]);

  const graceN = parseInt(grace, 10);
  const multN = parseFloat(mult);
  const graceBad = isNaN(graceN) || graceN < 0 || graceN > 240;
  const multBad = isNaN(multN) || multN < 1 || multN > 5;

  const submit = () => {
    if (graceBad || multBad) return;
    save.mutate(
      { ...s, late_grace_minutes: graceN, overtime_multiplier: multN },
      {
        onSuccess: () => {
          setMsg({ type: "success", text: "تم حفظ إعدادات الحضور" });
          onClose();
        },
        onError: (e) => setMsg({ type: "error", text: errorText(e, "تعذر حفظ الإعدادات") }),
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isPhone} fullWidth maxWidth="sm">
      <DialogTitle sx={{ px: 7 }}>
        إعدادات الحضور والرواتب
        <IconButton
          aria-label="إغلاق"
          onClick={onClose}
          sx={{ position: "absolute", top: 10, right: 10 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {settings.isError && <Alert severity="error">تعذر تحميل الإعدادات</Alert>}
        {settings.isLoading ? (
          <Stack spacing={1.5}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={90} />
            ))}
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Block
              title="اليوم الذي لم يُسجَّل"
              help="إذا لم تسجل حضور الموظف في يوم عمل، كيف يُحتسب عند حساب الراتب؟"
            >
              <RadioGroup
                value={s.unmarked_as}
                onChange={(e) => setS({ ...s, unmarked_as: e.target.value as AttendanceSettings["unmarked_as"] })}
              >
                <FormControlLabel
                  sx={radioSx}
                  value="present"
                  control={<Radio />}
                  label="حاضر (سجّل الغياب فقط) — الأسهل"
                />
                <FormControlLabel
                  sx={radioSx}
                  value="absent"
                  control={<Radio />}
                  label="غائب (لازم تسجل الحضور كل يوم)"
                />
              </RadioGroup>
            </Block>

            <Block
              title="أجر اليوم للراتب الشهري"
              help="يُستخدم لخصم أيام الغياب ونصف اليوم وحساب أجر الساعة."
            >
              <RadioGroup
                value={s.day_rate_basis}
                onChange={(e) =>
                  setS({ ...s, day_rate_basis: e.target.value as AttendanceSettings["day_rate_basis"] })
                }
              >
                <FormControlLabel
                  sx={radioSx}
                  value="calendar30"
                  control={<Radio />}
                  label="الراتب ÷ ٣٠ (مثال: ٣٠٠٠ ÷ ٣٠ = ١٠٠ لليوم)"
                />
                <FormControlLabel
                  sx={radioSx}
                  value="working_days"
                  control={<Radio />}
                  label="الراتب ÷ أيام العمل الفعلية في الشهر (بدون الإجازات الأسبوعية)"
                />
              </RadioGroup>
            </Block>

            <Block
              title="خصم التأخير"
              help="للموظفين الذين لهم موعد بداية وردية. يُخصم ما زاد عن فترة السماح بأجر الساعة (لا يطبق على أصحاب الأجر بالساعة لأنهم يُحاسبون على ساعاتهم الفعلية)."
            >
              <FormControlLabel
                sx={{ m: 0 }}
                control={
                  <Switch
                    checked={s.late_deduction}
                    onChange={(e) => setS({ ...s, late_deduction: e.target.checked })}
                  />
                }
                label={s.late_deduction ? "مفعّل" : "غير مفعّل"}
              />
              {s.late_deduction && (
                <TextField
                  label="فترة السماح"
                  value={grace}
                  onChange={(e) => setGrace(e.target.value)}
                  type="number"
                  size="small"
                  error={graceBad}
                  helperText={graceBad ? "من ٠ إلى ٢٤٠ دقيقة" : "مثال: ١٥ دقيقة — من يتأخر ٤٠ دقيقة يُخصم له ٢٥"}
                  sx={{ mt: 1, maxWidth: 320 }}
                  fullWidth
                  slotProps={{
                    htmlInput: { inputMode: "numeric", min: 0, max: 240, style: { fontSize: 16 } },
                    input: { endAdornment: <InputAdornment position="end">دقيقة</InputAdornment> },
                  }}
                />
              )}
            </Block>

            <Block
              title="الأجر الإضافي"
              help="يُصرف عن الساعات الزائدة على ساعات العمل اليومية (عند تسجيل الحضور والانصراف)، وعن العمل في يوم الإجازة الأسبوعية."
            >
              <FormControlLabel
                sx={{ m: 0 }}
                control={
                  <Switch
                    checked={s.overtime_pay}
                    onChange={(e) => setS({ ...s, overtime_pay: e.target.checked })}
                  />
                }
                label={s.overtime_pay ? "مفعّل" : "غير مفعّل"}
              />
              {s.overtime_pay && (
                <TextField
                  label="معامل الإضافي"
                  value={mult}
                  onChange={(e) => setMult(e.target.value)}
                  type="number"
                  size="small"
                  error={multBad}
                  helperText={multBad ? "من ١ إلى ٥" : "١٫٥ = الساعة الإضافية بساعة ونصف"}
                  sx={{ mt: 1, maxWidth: 320 }}
                  fullWidth
                  slotProps={{
                    htmlInput: { inputMode: "decimal", min: 1, max: 5, step: 0.25, style: { fontSize: 16 } },
                    input: { endAdornment: <InputAdornment position="end">×</InputAdornment> },
                  }}
                />
              )}
            </Block>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          إلغاء
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={save.isPending || settings.isLoading || graceBad || multBad}
          sx={{ minHeight: 44, minWidth: 110 }}
        >
          حفظ
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AttendanceSettingsDialog;

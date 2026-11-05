import { LoadingButton } from "@mui/lab";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Grid2,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  CloudSync as AutoBackupIcon,
  Save as SaveIcon,
  Backup as BackupIcon,
  FolderOpen as FolderIcon,
  CheckCircle as OkIcon,
  Error as ErrorIcon,
  HourglassTop as RunningIcon,
} from "@mui/icons-material";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import NumberField from "../../Shared/NumberField";
import { AlertMsg } from "../../Shared/AlertMessage";
import { apiError } from "../../utils/errors";

interface BackupSettings {
  enabled: boolean;
  time: string;
  keep_daily: number;
  keep_weekly: number;
  dir_override: string;
  send_telegram: boolean;
  after_shift_close: boolean;
}

interface BackupStatus {
  last_run_at?: string;
  last_result?: "success" | "failed" | "running";
  last_error?: string | null;
  last_success_at?: string;
  last_failure_at?: string;
  last_path?: string;
  last_name?: string;
  last_size?: number;
  last_duration_s?: number;
  telegram?: { sent: boolean; message: string };
}

interface BackupItem {
  name: string;
  size: number;
  created_at: string;
  kind: "daily" | "manual" | "shift";
  managed: boolean;
  other_db: boolean;
}

interface BackupOverview {
  settings: BackupSettings;
  status: BackupStatus;
  running: { running: boolean; kind: string | null; started_at: string | null };
  next_run_at: string | null;
  dir: string;
  dir_source: "override" | "env" | "documents" | "docker" | "home";
  default_dir: string;
  dir_exists: boolean;
  persistence_warning: string | null;
  pg_dump_found: boolean;
  telegram_configured: boolean;
  telegram_chats: number;
  backups: BackupItem[];
}

const KIND_LABEL: Record<BackupItem["kind"], string> = {
  daily: "يومية",
  manual: "يدوية",
  shift: "بعد الشيفت",
};

const SOURCE_LABEL: Record<BackupOverview["dir_source"], string> = {
  override: "مجلد مخصص",
  env: "مجلد السيرفر (BACKUP_DIR)",
  documents: "المستندات على هذا الجهاز",
  docker: "داخل الحاوية",
  home: "مجلد المستخدم",
};

const fmtDate = (iso?: string | null) =>
  iso ? iso.replace("T", " ").slice(0, 16) : "-";

const fmtSize = (bytes?: number) => {
  const n = bytes ?? 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

const getOverview = async () => {
  const { data } = await axios.get<BackupOverview>("/backup/status");
  return data;
};

const PathText = ({ children }: { children: string }) => (
  <Typography
    component="div"
    variant="body2"
    dir="ltr"
    sx={{
      fontFamily: "monospace",
      wordBreak: "break-all",
      bgcolor: "action.hover",
      borderRadius: 1,
      px: 1,
      py: 0.5,
      textAlign: "left",
    }}
  >
    {children}
  </Typography>
);

const AutoBackup = ({ setMsg }: { setMsg: (msg: AlertMsg) => void }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BackupSettings | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["backup-status"],
    queryFn: getOverview,
    refetchInterval: (q) => (q.state.data?.running.running ? 1500 : 30000),
  });

  // Load the saved settings once (don't overwrite what the user is editing).
  useEffect(() => {
    if (data && !form) setForm(data.settings);
  }, [data, form]);

  const running = Boolean(data?.running.running);

  // When a run finishes, tell the user how it went.
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (running) {
      setWasRunning(true);
    } else if (wasRunning && data) {
      setWasRunning(false);
      if (data.status.last_result === "success") {
        setMsg({
          type: "success",
          text: `تم إنشاء النسخة الاحتياطية (${fmtSize(data.status.last_size)})`,
        });
      } else if (data.status.last_result === "failed") {
        setMsg({
          type: "error",
          text: data.status.last_error || "فشل النسخ الاحتياطي",
        });
      }
    }
  }, [running, wasRunning, data, setMsg]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: async (body: BackupSettings) => {
      const { data } = await axios.put<BackupOverview>(
        "/backup/settings",
        body,
      );
      return data;
    },
    onSuccess: (ov) => {
      queryClient.setQueryData(["backup-status"], ov);
      setForm(ov.settings);
      setMsg({ type: "success", text: "تم حفظ إعدادات النسخ التلقائي" });
    },
    onError: (e) =>
      setMsg({ type: "error", text: apiError(e, "تعذر حفظ الإعدادات") }),
  });

  const { mutate: runNow, isPending: starting } = useMutation({
    mutationFn: () => axios.post("/backup/run"),
    onSuccess: () => {
      setWasRunning(true);
      queryClient.invalidateQueries({ queryKey: ["backup-status"] });
    },
    onError: (e) =>
      setMsg({ type: "error", text: apiError(e, "تعذر بدء النسخ الاحتياطي") }),
  });

  const set = <K extends keyof BackupSettings>(k: K, v: BackupSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const status = data?.status;
  const backups = data?.backups ?? [];
  const visible = showAll ? backups : backups.slice(0, 6);

  const statusChip = running ? (
    <Chip
      icon={<RunningIcon />}
      color="info"
      label="جاري النسخ الآن…"
      size="small"
    />
  ) : status?.last_result === "success" ? (
    <Chip
      icon={<OkIcon />}
      color="success"
      label="آخر نسخة ناجحة"
      size="small"
    />
  ) : status?.last_result === "failed" ? (
    <Chip
      icon={<ErrorIcon />}
      color="error"
      label="آخر محاولة فشلت"
      size="small"
    />
  ) : (
    <Chip label="لم تُنشأ نسخ تلقائية بعد" size="small" />
  );

  return (
    <Paper
      elevation={1}
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 1,
          flexWrap: "wrap",
        }}
      >
        <AutoBackupIcon sx={{ color: "success.main" }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          النسخ الاحتياطي التلقائي
        </Typography>
        <Box sx={{ marginInlineStart: "auto" }}>{statusChip}</Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        نسخة يومية من قاعدة البيانات تُحفظ في مجلد على الجهاز لا يُحذف مع
        البرنامج، وتُرسل إلى تليجرام إن كان مُعدًا. إن كان الجهاز مغلقًا في موعد
        النسخ تُنشأ النسخة عند تشغيل البرنامج بعده.
      </Typography>

      {isLoading || !form || !data ? (
        <Typography color="text.secondary">جاري التحميل…</Typography>
      ) : (
        <Stack spacing={2}>
          {!data.pg_dump_found && (
            <Alert severity="error">
              لم يتم العثور على برنامج pg_dump على السيرفر، لا يمكن إنشاء نسخ.
            </Alert>
          )}
          {data.persistence_warning && (
            <Alert severity="warning">{data.persistence_warning}</Alert>
          )}

          {/* Last run summary */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 1,
            }}
          >
            <Typography variant="body2">
              آخر نسخة ناجحة: <b>{fmtDate(status?.last_success_at)}</b>
              {status?.last_size ? ` • ${fmtSize(status.last_size)}` : ""}
            </Typography>
            <Typography variant="body2">
              النسخة القادمة:{" "}
              <b>
                {data.settings.enabled
                  ? fmtDate(data.next_run_at)
                  : "النسخ التلقائي متوقف"}
              </b>
            </Typography>
            {status?.telegram && status.last_result === "success" && (
              <Typography variant="body2" color="text.secondary">
                تليجرام: {status.telegram.message}
              </Typography>
            )}
            {status?.last_result === "failed" && status.last_error && (
              <Typography
                variant="body2"
                color="error"
                sx={{ gridColumn: "1 / -1", wordBreak: "break-word" }}
              >
                سبب الفشل ({fmtDate(status.last_failure_at)}):{" "}
                {status.last_error}
              </Typography>
            )}
          </Box>

          <Divider />

          {/* Settings */}
          <Grid2 container spacing={2}>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.enabled}
                    onChange={(e) => set("enabled", e.target.checked)}
                  />
                }
                label="تفعيل النسخ التلقائي اليومي"
              />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.after_shift_close}
                    onChange={(e) => set("after_shift_close", e.target.checked)}
                  />
                }
                label="نسخة إضافية بعد إغلاق كل شيفت"
              />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                type="time"
                label="وقت النسخ اليومي"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
                disabled={!form.enabled}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid2>
            <Grid2 size={{ xs: 6, sm: 4 }}>
              <NumberField
                fullWidth
                integer
                min={1}
                max={365}
                label="الاحتفاظ بآخر (يوم)"
                value={form.keep_daily}
                onValueChange={(v) => set("keep_daily", v)}
              />
            </Grid2>
            <Grid2 size={{ xs: 6, sm: 4 }}>
              <NumberField
                fullWidth
                integer
                min={0}
                max={104}
                label="و آخر (أسبوع)"
                value={form.keep_weekly}
                onValueChange={(v) => set("keep_weekly", v)}
              />
            </Grid2>
            <Grid2 size={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.send_telegram}
                    onChange={(e) => set("send_telegram", e.target.checked)}
                  />
                }
                label="إرسال النسخة إلى تليجرام"
              />
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {data.telegram_configured
                  ? data.telegram_chats > 0
                    ? `تُرسل إلى ${data.telegram_chats} محادثة مرتبطة بالمتاجر. النسخ الأكبر من 50 MB تُحفظ على الجهاز ويصلك إشعار بمكانها.`
                    : "لا توجد محادثة تليجرام مرتبطة بأي متجر بعد (الإعدادات ← تليجرام)."
                  : "بوت تليجرام غير مُعد؛ ستُحفظ النسخ على الجهاز فقط."}
              </Typography>
            </Grid2>

            <Grid2 size={12}>
              <Typography
                variant="body2"
                sx={{ mb: 0.5, display: "flex", gap: 1, alignItems: "center" }}
              >
                <FolderIcon fontSize="small" color="action" />
                المجلد الحالي (
                {SOURCE_LABEL[data.dir_source] ?? data.dir_source})
              </Typography>
              <PathText>{data.dir}</PathText>
            </Grid2>
            <Grid2 size={12}>
              <TextField
                fullWidth
                label="مجلد مخصص (اختياري)"
                placeholder={data.default_dir}
                value={form.dir_override}
                onChange={(e) => set("dir_override", e.target.value)}
                helperText="مسار كامل على السيرفر. اتركه فارغًا لاستخدام المجلد الافتراضي."
                slotProps={{
                  htmlInput: {
                    dir: "ltr",
                    spellCheck: false,
                    autoCapitalize: "none",
                  },
                }}
              />
            </Grid2>
          </Grid2>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            justifyContent="flex-end"
          >
            <LoadingButton
              variant="outlined"
              color="success"
              startIcon={<BackupIcon />}
              loading={starting || running}
              loadingPosition="start"
              disabled={!data.pg_dump_found}
              onClick={() => runNow()}
            >
              {running ? "جاري النسخ…" : "نسخ الآن"}
            </LoadingButton>
            <LoadingButton
              variant="contained"
              startIcon={<SaveIcon />}
              loading={saving}
              loadingPosition="start"
              onClick={() =>
                save({
                  ...form,
                  keep_daily: Math.min(365, Math.max(1, form.keep_daily || 14)),
                  keep_weekly: Math.min(104, Math.max(0, form.keep_weekly)),
                  dir_override: form.dir_override.trim(),
                })
              }
            >
              حفظ الإعدادات
            </LoadingButton>
          </Stack>

          <Divider />

          {/* Recent backups */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              النسخ المحفوظة ({backups.length})
            </Typography>
            {backups.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                لا توجد نسخ في هذا المجلد بعد.
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {visible.map((b) => (
                  <Box
                    key={b.name}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.5,
                      px: 1.25,
                      py: 0.75,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {fmtDate(b.created_at)}
                    </Typography>
                    <Chip size="small" label={KIND_LABEL[b.kind] ?? b.kind} />
                    <Typography variant="body2" color="text.secondary">
                      {fmtSize(b.size)}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      dir="ltr"
                      sx={{
                        marginInlineStart: "auto",
                        wordBreak: "break-all",
                        minWidth: 0,
                      }}
                    >
                      {b.name}
                    </Typography>
                  </Box>
                ))}
                {backups.length > 6 && (
                  <Button size="small" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "عرض أقل" : `عرض الكل (${backups.length})`}
                  </Button>
                )}
              </Stack>
            )}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1 }}
            >
              للاستعادة: اختر ملف .sql.gz من هذا المجلد بزر «استعادة نسخة
              احتياطية» أعلاه. لا يحذف البرنامج إلا النسخ التي أنشأها بنفسه.
            </Typography>
          </Box>
        </Stack>
      )}
    </Paper>
  );
};

export default AutoBackup;

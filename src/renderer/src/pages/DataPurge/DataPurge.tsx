// Data purge (حذف السجلات القديمة). Spec: docs/specs/v28-data-purge.md
import { LoadingButton } from "@mui/lab";
import {
  Alert,
  Box,
  Card,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  DeleteSweep as PurgeIcon,
  Preview as PreviewIcon,
  Schedule as ScheduleIcon,
  History as HistoryIcon,
  Save as SaveIcon,
  CheckCircle as OkIcon,
  Cancel as BadIcon,
} from "@mui/icons-material";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import { apiError } from "../utils/errors";

export interface PurgeSettings {
  enabled: boolean;
  weekday: number;
  time: string;
  with_backup: boolean;
}

interface PurgeHistoryRow {
  id: number;
  created_at: string;
  finished_at: string | null;
  source: "manual" | "scheduled";
  cutoff: string;
  with_backup: boolean;
  backup_file: string | null;
  backup_exists: boolean;
  username: string | null;
  status: "running" | "done" | "failed";
  counts: Record<string, any> | null;
  error: string | null;
}

export interface PurgeStatus {
  pending: { slot: string; run_at: string; seconds_left: number } | null;
  running: { running: boolean; started_at: string | null; source: string | null; cutoff: string | null };
  needs_approval: string | null;
  settings?: PurgeSettings;
  last_run?: { at: string; cutoff: string; source: string; success: boolean; error: string | null; bills?: number } | null;
  next_slot?: string | null;
  history?: PurgeHistoryRow[];
  backup_dir?: string;
  pg_dump_found?: boolean;
  persistence_warning?: string | null;
}

interface PreviewResult {
  ok: boolean;
  failures: string[];
  counts: Record<string, any>;
}

const WEEKDAYS = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"];

const COUNT_LABELS: [string, string][] = [
  ["bills", "فواتير"],
  ["cash_rows", "حركات مالية"],
  ["product_rows", "حركات منتجات"],
  ["installments", "أقساط منتهية"],
  ["salaries", "مرتبات"],
  ["attendance", "أيام حضور"],
  ["shifts", "شيفتات"],
  ["notifications", "إشعارات"],
  ["restock_requests", "طلبات بضاعة مغلقة"],
];

const KEPT_LABELS: [string, string][] = [
  ["bnpl", "آجل لم يُحصّل"],
  ["installment", "تقسيط لم يكتمل"],
  ["reserve", "حجز قائم"],
  ["crosses", "لها حركة بعد التاريخ"],
  ["transfer_partner", "نقل طرفه الآخر باقٍ"],
];

const CHECK_LABELS: Record<string, string> = {
  cash: "حركات النقدية لكل طرف",
  accounts: "أرصدة الحسابات",
  drawer: "رصيد الخزنة",
  flow: "حركة المنتجات",
  stock: "المخزون",
  after_cutoff: "الحركات بعد التاريخ",
  profit: "الأرباح بعد التاريخ",
};

export const fmtDateTime = (iso?: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "-");

const nowLocal = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
      {icon}
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
    </Box>
    {children}
  </Paper>
);

const ManualPurge = ({ status, setMsg }: { status?: PurgeStatus; setMsg: (m: AlertMsg) => void }) => {
  const queryClient = useQueryClient();
  const [cutoff, setCutoff] = useState(nowLocal());
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [withBackup, setWithBackup] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const expected = withBackup ? "حذف" : "حذف بدون نسخة";
  const running = Boolean(status?.running.running);

  useEffect(() => {
    setPreview(null);
    setConfirmText("");
  }, [cutoff]);

  const { mutate: runPreview, isPending: previewing } = useMutation({
    mutationFn: async () => (await axios.post<PreviewResult>("/purge/preview", { cutoff })).data,
    onSuccess: (data) => setPreview(data),
    onError: (e) => setMsg({ type: "error", text: apiError(e, "تعذرت المعاينة") }),
  });

  const { mutate: apply, isPending: applying } = useMutation({
    mutationFn: () => axios.post("/purge/apply", { cutoff, with_backup: withBackup, confirm: confirmText }),
    onSuccess: () => {
      setMsg({ type: "info", text: "بدأ حذف السجلات… ستظهر النتيجة في السجل أدناه" });
      setPreview(null);
      setConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["purge-status"] });
    },
    onError: (e) => setMsg({ type: "error", text: apiError(e, "تعذر بدء الحذف") }),
  });

  const counts = preview?.counts ?? {};
  const kept = (counts.kept_open ?? {}) as Record<string, number>;

  return (
    <Section icon={<PurgeIcon color="error" />} title="حذف يدوي">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        يحذف كل الفواتير والحركات قبل الوقت المختار ويُبقي المنتجات والأسعار والعملاء والمستخدمين والإعدادات. تبقى
        كل الأرصدة (الخزنة، الحسابات، العملاء، المخزون) كما هي تمامًا عبر «رصيد مرحّل»، ولا يُحذف آجل أو تقسيط أو حجز
        لم ينته.
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <TextField
          type="datetime-local"
          label="احذف كل ما قبل"
          value={cutoff}
          onChange={(e) => setCutoff(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 240 }}
        />
        <LoadingButton
          variant="outlined"
          startIcon={<PreviewIcon />}
          loading={previewing}
          loadingPosition="start"
          disabled={!cutoff || running}
          onClick={() => runPreview()}
        >
          معاينة
        </LoadingButton>
      </Stack>

      {preview && (
        <Box sx={{ mt: 2 }}>
          {preview.ok ? (
            <Alert severity="success" icon={<OkIcon />}>
              التحقق ناجح: كل الأرصدة ستبقى كما هي.
            </Alert>
          ) : (
            <Alert severity="error" icon={<BadIcon />}>
              لن يتم الحذف، التحقق فشل:
              {preview.failures.map((f) => (
                <Box key={f} component="div" sx={{ fontSize: "0.85rem" }}>
                  {f}
                </Box>
              ))}
            </Alert>
          )}
          {preview.ok && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                سيُحذف:
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {COUNT_LABELS.map(([k, label]) => (
                  <Chip key={k} label={`${label}: ${counts[k] ?? 0}`} size="small" />
                ))}
              </Box>
              {Object.values(kept).some((n) => n > 0) && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                    يبقى رغم قدمه (لم ينته بعد):
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {KEPT_LABELS.filter(([k]) => kept[k] > 0).map(([k, label]) => (
                      <Chip key={k} color="info" variant="outlined" label={`${label}: ${kept[k]}`} size="small" />
                    ))}
                  </Box>
                </>
              )}
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
                {Object.entries(counts.checks ?? {}).map(([k, v]) => (
                  <Chip
                    key={k}
                    size="small"
                    color={v ? "success" : "error"}
                    icon={v ? <OkIcon /> : <BadIcon />}
                    label={CHECK_LABELS[k] ?? k}
                  />
                ))}
              </Box>

              <Divider sx={{ my: 2 }} />
              <FormControlLabel
                control={<Switch checked={withBackup} onChange={(e) => setWithBackup(e.target.checked)} />}
                label="أخذ نسخة احتياطية كاملة قبل الحذف (تُحفظ ولا تُحذف تلقائيًا)"
              />
              {!withBackup && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  بدون نسخة لا يمكن استرجاع الفواتير المحذوفة أبدًا.
                </Alert>
              )}
              {withBackup && status?.pg_dump_found === false && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  لم يتم العثور على pg_dump على السيرفر، لا يمكن أخذ نسخة.
                </Alert>
              )}
              <Alert severity="warning" sx={{ mt: 1 }}>
                أثناء التنفيذ يتوقف البيع لحظات (ثوانٍ عادةً، وقد تصل لدقيقة في أول حذف كبير).
              </Alert>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }} alignItems={{ sm: "center" }}>
                <TextField
                  label={`اكتب «${expected}» للتأكيد`}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  sx={{ minWidth: 240 }}
                />
                <LoadingButton
                  variant="contained"
                  color="error"
                  startIcon={<PurgeIcon />}
                  loading={applying || running}
                  loadingPosition="start"
                  disabled={confirmText.trim() !== expected || running}
                  onClick={() => apply()}
                >
                  {running ? "جاري الحذف…" : "حذف السجلات"}
                </LoadingButton>
              </Stack>
            </>
          )}
        </Box>
      )}
    </Section>
  );
};

const Schedule = ({ status, setMsg }: { status?: PurgeStatus; setMsg: (m: AlertMsg) => void }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PurgeSettings | null>(null);

  useEffect(() => {
    if (status?.settings && !form) setForm(status.settings);
  }, [status, form]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: async (body: PurgeSettings) => (await axios.put<PurgeStatus>("/purge/settings", body)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["purge-status"], data);
      setForm(data.settings ?? null);
      setMsg({ type: "success", text: "تم حفظ الجدول" });
    },
    onError: (e) => setMsg({ type: "error", text: apiError(e, "تعذر الحفظ") }),
  });

  const { mutate: approve, isPending: approving } = useMutation({
    mutationFn: () => axios.post("/purge/approve"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purge-status"] }),
    onError: (e) => setMsg({ type: "error", text: apiError(e) }),
  });

  if (!form) return null;
  const set = <K extends keyof PurgeSettings>(k: K, v: PurgeSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const last = status?.last_run;

  return (
    <Section icon={<ScheduleIcon color="primary" />} title="حذف تلقائي أسبوعي">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        في الموعد يُحذف كل ما قبل هذا الموعد. إن كان البرنامج مغلقًا يتم الحذف عند تشغيله بعد ذلك بنفس التاريخ (وليس
        وقت التشغيل)، مع تنبيه ودقيقتين للإلغاء.
      </Typography>
      {status?.needs_approval && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <LoadingButton color="inherit" size="small" loading={approving} onClick={() => approve()}>
              موافقة
            </LoadingButton>
          }
        >
          موعد حذف ({fmtDateTime(status.needs_approval)}) بعيد جدًا عن آخر حركة مسجلة؛ قد تكون ساعة الجهاز خاطئة أو
          البرنامج مغلقًا لفترة طويلة. لن يُنفذ إلا بموافقتك.
        </Alert>
      )}
      <Stack spacing={2}>
        <FormControlLabel
          control={<Switch checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />}
          label="تفعيل الحذف التلقائي"
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField
            select
            label="اليوم"
            value={form.weekday}
            onChange={(e) => set("weekday", Number(e.target.value))}
            disabled={!form.enabled}
            sx={{ minWidth: 160 }}
          >
            {WEEKDAYS.map((d, i) => (
              <MenuItem key={d} value={i}>
                {d}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="time"
            label="الساعة"
            value={form.time}
            onChange={(e) => set("time", e.target.value)}
            disabled={!form.enabled}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        <FormControlLabel
          control={<Switch checked={form.with_backup} onChange={(e) => set("with_backup", e.target.checked)} />}
          label="أخذ نسخة احتياطية قبل كل حذف"
        />
        {form.enabled && !form.with_backup && (
          <Alert severity="error">الحذف التلقائي بدون نسخة لا يمكن التراجع عنه.</Alert>
        )}
        <Typography variant="body2">
          الموعد القادم: <b>{status?.settings?.enabled ? fmtDateTime(status?.next_slot) : "متوقف"}</b>
        </Typography>
        {last && (
          <Typography variant="body2" color={last.success ? "text.secondary" : "error"}>
            آخر تنفيذ: {fmtDateTime(last.at)} (قبل {fmtDateTime(last.cutoff)}){" "}
            {last.success ? `— حُذفت ${last.bills ?? 0} فاتورة` : `— ${last.error ?? "فشل"}`}
          </Typography>
        )}
        <Box>
          <LoadingButton
            variant="contained"
            startIcon={<SaveIcon />}
            loading={saving}
            loadingPosition="start"
            onClick={() => save(form)}
          >
            حفظ
          </LoadingButton>
        </Box>
      </Stack>
    </Section>
  );
};

const History = ({ status }: { status?: PurgeStatus }) => {
  const rows = status?.history ?? [];
  return (
    <Section icon={<HistoryIcon color="action" />} title="السجل والنسخ">
      {status?.persistence_warning && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {status.persistence_warning}
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        كل نسخة قبل الحذف هي النسخة الوحيدة من الفترة التي حُذفت؛ لا تحذفها. للاسترجاع: الإعدادات ← الأساسيات ←
        «استعادة نسخة احتياطية» واختر الملف (تؤخذ نسخة من البيانات الحالية أولًا).
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          لم يتم أي حذف بعد.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {rows.map((r) => (
            <Box
              key={r.id}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1.5,
                px: 1.25,
                py: 0.75,
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                alignItems: "center",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                قبل {fmtDateTime(r.cutoff)}
              </Typography>
              <Chip
                size="small"
                color={r.status === "done" ? "success" : r.status === "failed" ? "error" : "info"}
                label={r.status === "done" ? "تم" : r.status === "failed" ? "فشل" : "جارٍ"}
              />
              <Chip size="small" variant="outlined" label={r.source === "scheduled" ? "تلقائي" : `يدوي${r.username ? ` (${r.username})` : ""}`} />
              {r.status === "done" && (
                <Typography variant="body2" color="text.secondary">
                  {r.counts?.bills ?? 0} فاتورة
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {fmtDateTime(r.created_at)}
              </Typography>
              {r.error && (
                <Typography variant="caption" color="error" sx={{ width: "100%", wordBreak: "break-word" }}>
                  {r.error}
                </Typography>
              )}
              <Typography
                variant="caption"
                dir="ltr"
                color={r.backup_file && !r.backup_exists ? "error" : "text.secondary"}
                sx={{ width: "100%", wordBreak: "break-all", textAlign: "left" }}
              >
                {r.backup_file
                  ? `${r.backup_file}${r.backup_exists ? "" : "  (الملف غير موجود!)"}`
                  : r.with_backup
                    ? ""
                    : "بدون نسخة"}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Section>
  );
};

const DataPurge = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["purge-status"],
    queryFn: async () => (await axios.get<PurgeStatus>("/purge/status")).data,
    refetchInterval: (q) => (q.state.data?.running.running ? 2000 : 15000),
  });

  // Tell the user how a run they watched ended.
  const running = Boolean(status?.running.running);
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (running) setWasRunning(true);
    else if (wasRunning && status) {
      setWasRunning(false);
      const last = status.history?.[0];
      if (last?.status === "done") setMsg({ type: "success", text: `تم الحذف: ${last.counts?.bills ?? 0} فاتورة` });
      else if (last?.status === "failed") setMsg({ type: "error", text: last.error || "فشل الحذف" });
      queryClient.invalidateQueries();
    }
  }, [running, wasRunning, status, queryClient]);

  return (
    <Card elevation={3} sx={{ px: 0, py: 0, borderRadius: 3, overflow: "hidden" }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Box sx={{ px: { xs: 2, sm: 4 }, py: 3 }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 2, fontSize: { xs: "1.5rem", sm: "2.125rem" } }}
        >
          <PurgeIcon sx={{ fontSize: "2rem" }} />
          حذف السجلات القديمة
        </Typography>
      </Box>
      <Divider sx={{ opacity: 0.3 }} />
      <Stack spacing={3} sx={{ p: { xs: 1.5, sm: 4 } }}>
        <ManualPurge status={status} setMsg={setMsg} />
        <Schedule status={status} setMsg={setMsg} />
        <History status={status} />
      </Stack>
    </Card>
  );
};

export default DataPurge;

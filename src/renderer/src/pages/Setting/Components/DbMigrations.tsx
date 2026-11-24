// Advanced: run database migrations by hand / set the recorded version.
// For a restored backup that is older than the app (server/db_migrations.py).
import { LoadingButton } from "@mui/lab";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  PlayArrow as RunIcon,
  FastForward as RunAllIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import NumberField from "../../Shared/NumberField";
import useConfirm from "../../Shared/useConfirm";
import { AlertMsg } from "../../Shared/AlertMessage";
import { apiError } from "../../utils/errors";

interface Migration {
  num: number;
  file: string;
  summary: string;
  applied: boolean;
}

interface Overview {
  current: number | null;
  latest: number;
  migrations: Migration[];
  running: boolean;
}

interface RunResult {
  num: number;
  ok: boolean;
  output: string;
}

type RunResponse = Overview & { results: RunResult[]; backup: string | null };

const DbMigrations = ({ setMsg }: { setMsg: (m: AlertMsg) => void }) => {
  const queryClient = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [withBackup, setWithBackup] = useState(true);
  const [version, setVersion] = useState(0);
  const [results, setResults] = useState<RunResult[]>([]);

  const { data } = useQuery({
    queryKey: ["db-migrations"],
    queryFn: async () => (await axios.get<Overview>("/db-migrations")).data,
  });

  useEffect(() => {
    if (data) setVersion(data.current ?? 0);
  }, [data?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDone = (res: RunResponse) => {
    queryClient.setQueryData(["db-migrations"], res);
    queryClient.invalidateQueries({ queryKey: ["db-version"] });
    setResults(res.results);
    const failed = res.results.find((r) => !r.ok);
    if (failed) setMsg({ type: "error", text: `فشل التحديث ${failed.num}، توقف التشغيل عنده` });
    else if (res.results.length) setMsg({ type: "success", text: `تم تشغيل ${res.results.length} تحديث` });
    else setMsg({ type: "info", text: "لا توجد تحديثات ناقصة" });
  };

  const { mutate: runOne, isPending: runningOne, variables: runningNum } = useMutation({
    mutationFn: async (num: number) =>
      (await axios.post<RunResponse>("/db-migrations/run", { num, backup: withBackup })).data,
    onSuccess: onDone,
    onError: (e) => setMsg({ type: "error", text: apiError(e, "تعذر تشغيل التحديث") }),
  });

  const { mutate: runPending, isPending: runningAll } = useMutation({
    mutationFn: async () =>
      (await axios.post<RunResponse>("/db-migrations/run-pending", { backup: withBackup })).data,
    onSuccess: onDone,
    onError: (e) => setMsg({ type: "error", text: apiError(e, "تعذر تشغيل التحديثات") }),
  });

  const { mutate: saveVersion, isPending: savingVersion } = useMutation({
    mutationFn: async (v: number) => (await axios.put<Overview>("/db-migrations/version", { version: v })).data,
    onSuccess: (ov) => {
      queryClient.setQueryData(["db-migrations"], ov);
      queryClient.invalidateQueries({ queryKey: ["db-version"] });
      setMsg({ type: "success", text: `تم تسجيل إصدار قاعدة البيانات ${ov.current}` });
    },
    onError: (e) => setMsg({ type: "error", text: apiError(e, "تعذر حفظ الإصدار") }),
  });

  if (!data) return null;
  const busy = runningOne || runningAll || savingVersion || data.running;
  const pending = data.current === null ? [] : data.migrations.filter((m) => m.num > (data.current ?? 0));

  const askRun = async (num: number) => {
    const ok = await confirm({
      title: `تشغيل التحديث ${num}؟`,
      message: (
        <Typography component="div" variant="body2">
          سيتم تشغيل <b dir="ltr">update_db_{num}.py</b> على قاعدة البيانات الحالية
          {withBackup ? " بعد أخذ نسخة احتياطية." : " بدون نسخة احتياطية."}
        </Typography>
      ),
      confirmText: "تشغيل",
    });
    if (ok) runOne(num);
  };

  const askRunPending = async () => {
    const ok = await confirm({
      title: `تشغيل ${pending.length} تحديث ناقص؟`,
      message: (
        <Typography component="div" variant="body2">
          من {pending[0]?.num} إلى {pending[pending.length - 1]?.num} بالترتيب، ويتوقف عند أول خطأ
          {withBackup ? "، بعد أخذ نسخة احتياطية." : "، بدون نسخة احتياطية."}
        </Typography>
      ),
      confirmText: "تشغيل الكل",
    });
    if (ok) runPending();
  };

  const askSetVersion = async () => {
    const ok = await confirm({
      title: `تسجيل الإصدار ${version}؟`,
      message: (
        <Typography component="div" variant="body2">
          هذا يغير الرقم المسجل فقط ولا يشغّل أي تحديث. التحديثات الأعلى منه ستُعتبر ناقصة وتُشغَّل
          من هنا أو تلقائيًا عند فتح البرنامج (نسخة سطح المكتب). اختر رقمًا خاطئًا قد يتخطى تحديثات
          مطلوبة.
        </Typography>
      ),
      confirmText: "تسجيل",
      danger: true,
    });
    if (ok) saveVersion(version);
  };

  return (
    <>
    {/* Outside the Accordion: it treats its first child as the summary. */}
    {confirmDialog}
    <Accordion
      disableGutters
      elevation={0}
      sx={{ mt: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>متقدم: تحديثات قاعدة البيانات</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            بعد استعادة نسخة من إصدار أقدم: شغّل التحديثات الناقصة من هنا، أو سجّل الإصدار الصحيح للنسخة
            وسيكمل البرنامج الباقي. النسخ الأقدم من الإصدار 18 لا تحمل رقمًا، فسجّله أولًا.
          </Typography>

          {data.current === null && (
            <Alert severity="warning">إصدار قاعدة البيانات غير مسجل. حدده أدناه قبل تشغيل التحديثات.</Alert>
          )}

          <FormControlLabel
            control={<Switch checked={withBackup} onChange={(e) => setWithBackup(e.target.checked)} />}
            label="أخذ نسخة احتياطية قبل التشغيل"
          />

          <Box>
            <LoadingButton
              variant="contained"
              startIcon={<RunAllIcon />}
              loading={runningAll}
              loadingPosition="start"
              disabled={busy || pending.length === 0}
              onClick={askRunPending}
            >
              {pending.length ? `تشغيل التحديثات الناقصة (${pending.length})` : "لا توجد تحديثات ناقصة"}
            </LoadingButton>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <NumberField
              integer
              min={0}
              max={data.latest}
              label="تسجيل الإصدار يدويًا"
              value={version}
              onValueChange={(v) => setVersion(v)}
              sx={{ maxWidth: 220 }}
            />
            <LoadingButton
              variant="outlined"
              color="warning"
              startIcon={<SaveIcon />}
              loading={savingVersion}
              loadingPosition="start"
              disabled={busy || version === data.current}
              onClick={askSetVersion}
            >
              تسجيل
            </LoadingButton>
          </Stack>

          <Stack spacing={0.75}>
            {data.migrations
              .slice()
              .reverse()
              .map((m) => (
                <Box
                  key={m.num}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1.5,
                    px: 1.25,
                    py: 0.5,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 28 }}>
                    {m.num}
                  </Typography>
                  <Chip
                    size="small"
                    color={m.applied ? "success" : "default"}
                    variant={m.applied ? "filled" : "outlined"}
                    label={m.applied ? "مطبّق" : "غير مطبّق"}
                  />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    dir="ltr"
                    sx={{
                      // Phones: the description gets its own line under the number / button.
                      flex: { xs: "1 1 100%", sm: 1 },
                      order: { xs: 3, sm: 0 },
                      minWidth: 0,
                      textAlign: "left",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.summary || m.file}
                  </Typography>
                  <LoadingButton
                    size="small"
                    startIcon={<RunIcon />}
                    sx={{ marginInlineStart: "auto" }}
                    loading={runningOne && runningNum === m.num}
                    disabled={busy}
                    onClick={() => askRun(m.num)}
                  >
                    تشغيل
                  </LoadingButton>
                </Box>
              ))}
          </Stack>

          {results.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">نتيجة آخر تشغيل</Typography>
              {results.map((r) => (
                <Box key={r.num}>
                  <Chip
                    size="small"
                    color={r.ok ? "success" : "error"}
                    label={`${r.num}: ${r.ok ? "تم" : "فشل"}`}
                    sx={{ mb: 0.5 }}
                  />
                  {r.output && (
                    <Box
                      component="pre"
                      dir="ltr"
                      sx={{
                        m: 0,
                        p: 1,
                        fontSize: 12,
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        maxHeight: 220,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        textAlign: "left",
                      }}
                    >
                      {r.output}
                    </Box>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
    </>
  );
};

export default DbMigrations;

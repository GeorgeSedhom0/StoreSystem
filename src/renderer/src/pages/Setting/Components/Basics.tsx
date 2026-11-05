import { LoadingButton } from "@mui/lab";
import {
  Grid2,
  TextField,
  Typography,
  Paper,
  Box,
  Slider,
  Stack,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState, useContext } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import NumberField from "../../Shared/NumberField";
import useConfirm from "../../Shared/useConfirm";
import { apiError } from "../../utils/errors";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Profile } from "../../Shared/Utils";
import { StoreContext } from "@renderer/StoreDataProvider";
import AutoBackup from "./AutoBackup";
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Store as StoreIcon,
  Save as SaveIcon,
  Business as BusinessIcon,
  Notifications as NotificationsIcon,
  ZoomInMap as ZoomIcon,
  RestartAlt as ResetIcon,
  Storage as StorageIcon,
} from "@mui/icons-material";

interface ExtraInfo {
  expiration_alert_days?: number;
  expiration_check_time?: string;
  [key: string]: unknown;
}

const MIN_APP_ZOOM_PERCENT = 80;
const MAX_APP_ZOOM_PERCENT = 150;
const APP_ZOOM_MARKS = [
  { value: 80, label: "80%" },
  { value: 100, label: "100%" },
  { value: 125, label: "125%" },
  { value: 150, label: "150%" },
];

const clampAppZoomPercent = (value: number) => {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.min(
    MAX_APP_ZOOM_PERCENT,
    Math.max(MIN_APP_ZOOM_PERCENT, Math.round(value)),
  );
};

const saveStoreData = async ({
  name,
  phone,
  address,
  extra_info,
  storeId,
}: {
  name: string;
  phone: string;
  address: string;
  extra_info: ExtraInfo;
  storeId: number;
}) => {
  await axios.put(
    "/store-data",
    { extra_info },
    {
      params: {
        name,
        phone,
        address,
        store_id: storeId,
      },
    },
  );
};

const getStoreData = async (storeId: number) => {
  const { data } = await axios.get<Profile["store"]>("/store-data", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const getDbVersion = async () => {
  const { data } = await axios.get<{ current: number | null; latest: number }>(
    "/db-version",
  );
  return data;
};

// The browser build has no per-device zoom (the browser's own zoom does that).
const IS_WEB = Boolean((window as any).__IS_WEB__);

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const Basics = () => {
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirm, confirmDialog] = useConfirm();
  const [zoomLoading, setZoomLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [expirationAlertDays, setExpirationAlertDays] = useState(14);
  const [expirationCheckTime, setExpirationCheckTime] = useState("15:00");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const queryClient = useQueryClient();
  const { storeId } = useContext(StoreContext);

  const backUp = useCallback(async () => {
    setBackingUp(true);
    try {
      const { data } = await axios.get("/backup", { responseType: "blob" });
      // download the backup file
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `backup-${today()}.sql`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMsg({ type: "success", text: "تم تنزيل النسخة الاحتياطية" });
    } catch (e) {
      setMsg({
        type: "error",
        text: apiError(e, "تعذر إنشاء النسخة الاحتياطية"),
      });
    }
    setBackingUp(false);
  }, []);

  // Step 1: pick the file. Step 2 (onChange): confirm, then upload.
  const pickRestoreFile = useCallback(() => {
    if (fileInput.current) {
      fileInput.current.value = "";
      fileInput.current.click();
    }
  }, []);

  const restore = useCallback(
    async (picked: File | undefined) => {
      if (!picked) return;
      const lower = picked.name.toLowerCase();
      if (!lower.endsWith(".sql") && !lower.endsWith(".sql.gz")) {
        setMsg({
          type: "error",
          text: "الملف غير صالح، اختر ملف نسخة احتياطية بامتداد .sql أو .sql.gz",
        });
        return;
      }
      let file = picked;
      // Automatic backups are gzip-compressed; the server restores plain SQL.
      if (lower.endsWith(".gz")) {
        if (typeof DecompressionStream === "undefined") {
          setMsg({
            type: "error",
            text: "هذا المتصفح لا يدعم فك ضغط الملف؛ فك الضغط أولًا ثم اختر ملف .sql",
          });
          return;
        }
        try {
          const blob = await new Response(
            picked.stream().pipeThrough(new DecompressionStream("gzip")),
          ).blob();
          file = new File([blob], picked.name.replace(/\.gz$/i, ""), {
            type: "application/sql",
          });
        } catch {
          setMsg({ type: "error", text: "تعذر فك ضغط الملف، قد يكون تالفًا" });
          return;
        }
      }
      const ok = await confirm({
        title: "استعادة النسخة الاحتياطية؟",
        message: (
          <Typography component="div" variant="body2">
            سيتم <b>حذف جميع البيانات الحالية</b> (المنتجات، الفواتير، الحسابات،
            المستخدمين، ...) واستبدالها بمحتوى الملف:
            <Box
              component="span"
              sx={{ display: "block", my: 1, fontWeight: 700 }}
              dir="ltr"
            >
              {picked.name} (
              {file.size >= 1024 * 1024
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                : `${Math.max(1, Math.round(file.size / 1024))} KB`}
              )
            </Box>
            لا يمكن التراجع عن هذه العملية. يُنصح بإنشاء نسخة احتياطية من
            البيانات الحالية أولًا.
          </Typography>
        ),
        confirmText: "استعادة واستبدال البيانات",
        danger: true,
      });
      if (!ok) return;
      setRestoring(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        await axios.post("/restore", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        setMsg({
          type: "success",
          text: "تمت استعادة النسخة الاحتياطية بنجاح",
        });
        queryClient.invalidateQueries();
      } catch (e) {
        setMsg({
          type: "error",
          text: apiError(e, "فشلت استعادة النسخة الاحتياطية"),
        });
      } finally {
        setRestoring(false);
      }
    },
    [confirm, queryClient],
  );

  const { mutate: setStoreData, isPending: savingStoreData } = useMutation({
    mutationFn: saveStoreData,
    onError: (e) => {
      setMsg({ type: "error", text: apiError(e, "تعذر حفظ البيانات") });
    },
    onSuccess: () => {
      setMsg({ type: "success", text: "تم الحفظ" });
      queryClient.invalidateQueries({
        queryKey: ["store-data"],
      });
    },
  });

  const { data: storeInfo } = useQuery({
    queryKey: ["store-data", storeId],
    queryFn: () => getStoreData(storeId),
  });

  const { data: dbVersion } = useQuery({
    queryKey: ["db-version"],
    queryFn: getDbVersion,
  });

  const saveAppZoom = useCallback(
    async (nextZoomPercent?: number) => {
      setZoomLoading(true);
      try {
        const targetZoomPercent = clampAppZoomPercent(
          nextZoomPercent ?? zoomPercent,
        );
        const appliedZoom = await window.electron.ipcRenderer.invoke(
          "set",
          "appZoomFactor",
          targetZoomPercent / 100,
        );

        setZoomPercent(clampAppZoomPercent(Number(appliedZoom) * 100));
        setMsg({
          type: "success",
          text: "تم تحديث حجم الواجهة على هذا الجهاز",
        });
      } catch (error) {
        console.error(error);
        setMsg({
          type: "error",
          text: "تعذر تحديث حجم الواجهة",
        });
      } finally {
        setZoomLoading(false);
      }
    },
    [zoomPercent],
  );

  const resetAppZoom = useCallback(() => {
    void saveAppZoom(100);
  }, [saveAppZoom]);

  useEffect(() => {
    if (storeInfo) {
      setName(storeInfo.name);
      setPhone(storeInfo.phone);
      setAddress(storeInfo.address);
      // Load extra_info settings
      const extraInfo = storeInfo.extra_info || {};
      setExpirationAlertDays(
        extraInfo.expiration_alert_days
          ? parseInt(extraInfo.expiration_alert_days as any)
          : 14,
      );
      setExpirationCheckTime(extraInfo.expiration_check_time || "15:00");
    }
  }, [storeInfo]);

  useEffect(() => {
    if (IS_WEB) return;
    const loadAppZoom = async () => {
      try {
        const storedZoom = await window.electron.ipcRenderer.invoke(
          "get",
          "appZoomFactor",
        );
        setZoomPercent(clampAppZoomPercent((Number(storedZoom) || 1) * 100));
      } catch (error) {
        console.error("Failed to load app zoom factor:", error);
      }
    };

    loadAppZoom();
  }, []);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      {confirmDialog}
      <input
        ref={fileInput}
        type="file"
        accept=".sql,.gz"
        hidden
        onChange={(e) => restore(e.target.files?.[0])}
      />

      {/* Header Section */}
      <Paper
        elevation={2}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.05) 100%)",
          border: "1px solid",
          borderColor: "primary.light",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <BusinessIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: "primary.main",
              fontSize: { xs: "1.4rem", sm: "2.125rem" },
            }}
          >
            الإعدادات الأساسية
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          إدارة البيانات الأساسية للمتجر والنسخ الاحتياطي
        </Typography>
      </Paper>

      <Grid2 container spacing={3}>
        {/* Backup Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: { xs: 2, sm: 3 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <BackupIcon sx={{ color: "warning.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                النسخ الاحتياطي
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              قم بإنشاء نسخة احتياطية من بياناتك أو استعادة نسخة سابقة
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 2,
                flexDirection: { xs: "column", sm: "row" },
              }}
            >
              <LoadingButton
                loading={backingUp}
                disabled={restoring}
                onClick={backUp}
                startIcon={<BackupIcon />}
                color="success"
                variant="contained"
                size="large"
                sx={{
                  borderRadius: 2,
                  px: 4,
                  py: 1.5,
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: { xs: "1rem", sm: "1.1rem" },
                }}
              >
                إنشاء نسخة احتياطية
              </LoadingButton>
              <LoadingButton
                loading={restoring}
                disabled={backingUp}
                onClick={pickRestoreFile}
                startIcon={<RestoreIcon />}
                color="error"
                variant="contained"
                size="large"
                sx={{
                  borderRadius: 2,
                  px: 4,
                  py: 1.5,
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: { xs: "1rem", sm: "1.1rem" },
                }}
              >
                استعادة نسخة احتياطية
              </LoadingButton>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1.5 }}
            >
              الاستعادة تستبدل كل البيانات الحالية بمحتوى الملف المختار (‎.sql
              أو نسخة تلقائية ‎.sql.gz).
            </Typography>
          </Paper>
        </Grid2>

        {/* Automatic backups */}
        <Grid2 size={12}>
          <AutoBackup setMsg={setMsg} />
        </Grid2>

        {/* Store Information Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: { xs: 2, sm: 3 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <StoreIcon sx={{ color: "primary.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                معلومات المتجر
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              هذه المعلومات ستظهر في الفواتير المطبوعة (تُحفظ بزر الحفظ أسفل
              إعدادات التنبيهات)
            </Typography>

            <Grid2 container spacing={3}>
              <Grid2 size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  size="medium"
                  label="اسم المتجر"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  variant="outlined"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                    },
                  }}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  size="medium"
                  label="رقم الهاتف"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  variant="outlined"
                  slotProps={{ htmlInput: { inputMode: "tel", dir: "ltr" } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                    },
                  }}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  size="medium"
                  label="العنوان"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  variant="outlined"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                    },
                  }}
                />
              </Grid2>
            </Grid2>
          </Paper>
        </Grid2>

        {/* Display Zoom Section (desktop app only) */}
        {!IS_WEB && (
          <Grid2 size={12}>
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
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <ZoomIcon sx={{ color: "secondary.main" }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  حجم الواجهة
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                يكبر أو يصغر واجهة البرنامج على هذا الجهاز فقط لتسهيل القراءة،
                ولن يؤثر على الطباعة أو بيانات المتجر.
              </Typography>

              <Grid2 container spacing={3} alignItems="center">
                <Grid2 size={{ xs: 12, md: 8 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1.5 }}
                  >
                    اختر الحجم المناسب ثم اضغط تطبيق.
                  </Typography>
                  <Slider
                    value={zoomPercent}
                    min={MIN_APP_ZOOM_PERCENT}
                    max={MAX_APP_ZOOM_PERCENT}
                    step={5}
                    marks={APP_ZOOM_MARKS}
                    valueLabelDisplay="auto"
                    onChange={(_event, value) =>
                      setZoomPercent(
                        clampAppZoomPercent(
                          Array.isArray(value) ? value[0] : value,
                        ),
                      )
                    }
                  />
                </Grid2>

                <Grid2 size={{ xs: 12, md: 4 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      textAlign: "center",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      الحجم الحالي
                    </Typography>
                    <Typography
                      variant="h4"
                      sx={{ fontWeight: 700, color: "primary.main" }}
                    >
                      {zoomPercent}%
                    </Typography>
                  </Paper>
                </Grid2>

                <Grid2 size={12}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    justifyContent="flex-end"
                  >
                    <LoadingButton
                      variant="outlined"
                      startIcon={<ResetIcon />}
                      loading={zoomLoading}
                      disabled={zoomLoading || zoomPercent === 100}
                      onClick={resetAppZoom}
                      sx={{
                        borderRadius: 2,
                        px: 3,
                        py: 1.25,
                        textTransform: "none",
                        fontWeight: 600,
                      }}
                    >
                      إعادة الحجم الافتراضي
                    </LoadingButton>
                    <LoadingButton
                      variant="contained"
                      startIcon={<ZoomIcon />}
                      loading={zoomLoading}
                      onClick={() => void saveAppZoom()}
                      sx={{
                        borderRadius: 2,
                        px: 3,
                        py: 1.25,
                        textTransform: "none",
                        fontWeight: 600,
                      }}
                    >
                      تطبيق الحجم
                    </LoadingButton>
                  </Stack>
                </Grid2>
              </Grid2>
            </Paper>
          </Grid2>
        )}

        {/* Expiration Settings Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: { xs: 2, sm: 3 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <NotificationsIcon sx={{ color: "warning.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                إعدادات تنبيهات الصلاحية
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              ضبط إعدادات تنبيهات انتهاء صلاحية المنتجات
            </Typography>

            <Grid2 container spacing={3}>
              <Grid2 size={{ xs: 12, md: 6 }}>
                <NumberField
                  fullWidth
                  size="medium"
                  label="عدد أيام التنبيه قبل انتهاء الصلاحية"
                  integer
                  min={1}
                  max={365}
                  value={expirationAlertDays}
                  onValueChange={setExpirationAlertDays}
                  variant="outlined"
                  helperText="سيتم إرسال تنبيه للمنتجات التي ستنتهي صلاحيتها خلال هذه الفترة"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                    },
                  }}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  size="medium"
                  label="وقت الفحص اليومي"
                  type="time"
                  value={expirationCheckTime}
                  onChange={(e) => setExpirationCheckTime(e.target.value)}
                  variant="outlined"
                  helperText="الوقت الذي سيتم فيه فحص المنتجات يومياً"
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                    },
                  }}
                />
              </Grid2>
              <Grid2 size={12}>
                <Box
                  sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}
                >
                  <LoadingButton
                    variant="contained"
                    loading={savingStoreData}
                    onClick={() =>
                      setStoreData({
                        name,
                        phone,
                        address,
                        extra_info: {
                          expiration_alert_days: Math.min(
                            365,
                            Math.max(1, expirationAlertDays || 14),
                          ),
                          expiration_check_time: expirationCheckTime,
                        },
                        storeId,
                      })
                    }
                    startIcon={<SaveIcon />}
                    size="large"
                    sx={{
                      borderRadius: 2,
                      px: 4,
                      py: 1.5,
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "1.1rem",
                    }}
                  >
                    حفظ التغييرات
                  </LoadingButton>
                </Box>
              </Grid2>
            </Grid2>
          </Paper>
        </Grid2>

        {/* System Information Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: { xs: 2, sm: 3 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <StorageIcon sx={{ color: "info.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                معلومات النظام
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Typography variant="body1" color="text.secondary">
                إصدار قاعدة البيانات
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color:
                    dbVersion && dbVersion.current === dbVersion.latest
                      ? "success.main"
                      : "warning.main",
                }}
              >
                {dbVersion
                  ? dbVersion.current === null
                    ? `غير معروف (المتوقع ${dbVersion.latest})`
                    : `${dbVersion.current}`
                  : "..."}
              </Typography>
            </Box>
            {dbVersion &&
              dbVersion.current !== null &&
              dbVersion.current < dbVersion.latest && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                  ⚠️ يلزم تحديث قاعدة البيانات إلى الإصدار {dbVersion.latest}
                </Typography>
              )}
          </Paper>
        </Grid2>
      </Grid2>
    </Box>
  );
};

export default Basics;

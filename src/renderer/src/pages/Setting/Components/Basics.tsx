import { LoadingButton } from "@mui/lab";
import { Grid2, TextField, Typography, Paper, Box } from "@mui/material";
import { useCallback, useEffect, useState, useContext } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Profile } from "../../Shared/Utils";
import { StoreContext } from "@renderer/StoreDataProvider";
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Store as StoreIcon,
  Save as SaveIcon,
  Business as BusinessIcon,
  Notifications as NotificationsIcon,
} from "@mui/icons-material";

interface ExtraInfo {
  expiration_alert_days?: number;
  expiration_check_time?: string;
  [key: string]: unknown;
}

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

const Basics = () => {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [expirationAlertDays, setExpirationAlertDays] = useState(14);
  const [expirationCheckTime, setExpirationCheckTime] = useState("15:00");
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const queryClient = useQueryClient();
  const { storeId } = useContext(StoreContext);

  const backUp = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/backup");
      // download the backup file
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "backup.sql");
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  const restore = useCallback(async () => {
    const userConsent = window.confirm(
      "هل انت متاكد من استعادة النسخة الاحطياتية",
    );
    if (!userConsent) return;
    setLoading(true);
    try {
      // let use pick the file .sql
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".sql";
      fileInput.click();
      fileInput.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) {
          setMsg({ type: "error", text: "حدث خطا ما" });
        }
        const formData = new FormData();
        formData.append("file", file);
        await axios.post("/restore", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        setMsg({ type: "success", text: "تم استعادة النسخة الاحطياتية" });
      };
    } catch (e) {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  const { mutate: setStoreData } = useMutation({
    mutationFn: saveStoreData,
    onError: (e) => {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    },
    onSuccess: () => {
      setMsg({ type: "success", text: "تم الحفظ" });
      queryClient.invalidateQueries({
        queryKey: ["store-data"],
      });
    },
  });

  const { data: storeInfo } = useQuery({
    queryKey: ["store-data"],
    queryFn: () => getStoreData(storeId),
  });

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
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

      {/* Header Section */}
      <Paper
        elevation={2}
        sx={{
          p: 3,
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
            sx={{ fontWeight: 600, color: "primary.main" }}
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
              p: 3,
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
            <Box sx={{ display: "flex", gap: 2 }}>
              <LoadingButton
                loading={loading}
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
                  fontSize: "1.1rem",
                }}
              >
                إنشاء نسخة احتياطية
              </LoadingButton>
              <LoadingButton
                loading={loading}
                onClick={restore}
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
                  fontSize: "1.1rem",
                }}
              >
                استعادة النسخة الاحتياطية
              </LoadingButton>
            </Box>
          </Paper>
        </Grid2>

        {/* Store Information Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: 3,
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
              هذه المعلومات ستظهر في الفواتير المطبوعة
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

        {/* Expiration Settings Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: 3,
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
                <TextField
                  fullWidth
                  size="medium"
                  label="عدد أيام التنبيه قبل انتهاء الصلاحية"
                  type="number"
                  value={expirationAlertDays}
                  onChange={(e) =>
                    setExpirationAlertDays(parseInt(e.target.value) || 14)
                  }
                  variant="outlined"
                  helperText="سيتم إرسال تنبيه للمنتجات التي ستنتهي صلاحيتها خلال هذه الفترة"
                  inputProps={{ min: 1, max: 365 }}
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
                  InputLabelProps={{ shrink: true }}
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
                    loading={loading}
                    onClick={() =>
                      setStoreData({
                        name,
                        phone,
                        address,
                        extra_info: {
                          expiration_alert_days: expirationAlertDays,
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
      </Grid2>
    </Box>
  );
};

export default Basics;

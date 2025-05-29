import { useState, useEffect } from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Grid2,
  Typography,
  Paper,
  Box,
  Divider,
  Alert,
  Chip,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import AlertMessage, { AlertMsg } from "@renderer/pages/Shared/AlertMessage";
import {
  Print as PrintIcon,
  Receipt as ReceiptIcon,
  QrCode as BarcodeIcon,
  Save as SaveIcon,
  Straighten as SizeIcon,
} from "@mui/icons-material";

const PrinterSettings = () => {
  const [printers, setPrinters] = useState<
    {
      name: string;
    }[]
  >([]);
  const [settings, setSettings] = useState({
    billPrinter: "",
    barcodePrinter: "",
    billPrinterWidth: "",
    billPrinterHeight: "",
    barcodePrinterWidth: "",
    barcodePrinterHeight: "",
  });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [availablePrinters, savedSettings] = await Promise.all([
          window.electron.ipcRenderer.invoke("getPrinters"),
          window.electron.ipcRenderer.invoke("getPrinterSettings"),
        ]);
        setPrinters(availablePrinters);
        if (savedSettings) {
          setSettings(savedSettings);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const saveSettings = async () => {
    try {
      await window.electron.ipcRenderer.invoke("savePrinterSettings", settings);
      // Show success message
      setMsg({ type: "success", text: "تم حفظ الإعدادات بنجاح" });
    } catch (error) {
      // Show error message
      console.error("Failed to save settings:", error);
      setMsg({ type: "error", text: "فشل حفظ الإعدادات" });
    }
  };

  const handleChange = (field: string) => (event: any) => {
    setSettings((prev) => ({ ...prev, [field]: event.target.value }));
  };
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

      {/* Header */}
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
          <PrintIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "primary.main" }}
          >
            إعدادات الطابعة
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          تكوين إعدادات الطابعات المختلفة المستخدمة في النظام
        </Typography>
      </Paper>

      <Grid2 container spacing={3}>
        {/* Bill Printer Settings */}
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
              <ReceiptIcon sx={{ fontSize: "1.5rem", color: "primary.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                إعدادات طابعة الفواتير
              </Typography>
              <Chip
                label={settings.billPrinter || "غير محدد"}
                color={settings.billPrinter ? "success" : "default"}
                size="small"
              />
            </Box>

            <Grid2 container spacing={3}>
              <Grid2 size={12}>
                <FormControl fullWidth>
                  <InputLabel>طابعة الفواتير</InputLabel>
                  <Select
                    value={settings.billPrinter}
                    onChange={handleChange("billPrinter")}
                    label="طابعة الفواتير"
                    startAdornment={
                      <PrintIcon sx={{ mr: 1, color: "text.secondary" }} />
                    }
                  >
                    {printers.map((printer) => (
                      <MenuItem key={printer.name} value={printer.name}>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <PrintIcon sx={{ fontSize: "1.2rem" }} />
                          {printer.name}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid2>

              <Grid2 size={6}>
                <TextField
                  fullWidth
                  label="عرض الفاتورة (مم)"
                  type="number"
                  value={settings.billPrinterWidth}
                  onChange={handleChange("billPrinterWidth")}
                  InputProps={{
                    startAdornment: (
                      <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                    ),
                  }}
                  helperText="مطلوب*"
                />
              </Grid2>

              <Grid2 size={6}>
                <TextField
                  fullWidth
                  label="ارتفاع الفاتورة (مم)"
                  type="number"
                  value={settings.billPrinterHeight}
                  onChange={handleChange("billPrinterHeight")}
                  InputProps={{
                    startAdornment: (
                      <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                    ),
                  }}
                />
              </Grid2>
            </Grid2>
          </Paper>
        </Grid2>

        {/* Barcode Printer Settings */}
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
              <BarcodeIcon sx={{ fontSize: "1.5rem", color: "primary.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                إعدادات طابعة الباركود
              </Typography>
              <Chip
                label={settings.barcodePrinter || "غير محدد"}
                color={settings.barcodePrinter ? "success" : "default"}
                size="small"
              />
            </Box>

            <Grid2 container spacing={3}>
              <Grid2 size={12}>
                <FormControl fullWidth>
                  <InputLabel>طابعة الباركود</InputLabel>
                  <Select
                    value={settings.barcodePrinter}
                    onChange={handleChange("barcodePrinter")}
                    label="طابعة الباركود"
                    startAdornment={
                      <BarcodeIcon sx={{ mr: 1, color: "text.secondary" }} />
                    }
                  >
                    {printers.map((printer) => (
                      <MenuItem key={printer.name} value={printer.name}>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <BarcodeIcon sx={{ fontSize: "1.2rem" }} />
                          {printer.name}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid2>

              <Grid2 size={6}>
                <TextField
                  fullWidth
                  label="عرض الباركود (مم)"
                  type="number"
                  value={settings.barcodePrinterWidth}
                  onChange={handleChange("barcodePrinterWidth")}
                  InputProps={{
                    startAdornment: (
                      <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                    ),
                  }}
                  helperText="مطلوب*"
                />
              </Grid2>

              <Grid2 size={6}>
                <TextField
                  fullWidth
                  label="ارتفاع الباركود (مم)"
                  type="number"
                  value={settings.barcodePrinterHeight}
                  onChange={handleChange("barcodePrinterHeight")}
                  InputProps={{
                    startAdornment: (
                      <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                    ),
                  }}
                  helperText="مطلوب*"
                />
              </Grid2>
            </Grid2>
          </Paper>
        </Grid2>

        {/* Save Section */}
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
            {(!settings.billPrinter ||
              !settings.barcodePrinter ||
              !settings.billPrinterWidth ||
              !settings.barcodePrinterWidth ||
              !settings.barcodePrinterHeight) && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                يرجى ملء جميع الحقول المطلوبة قبل الحفظ
              </Alert>
            )}

            <Divider sx={{ my: 2 }} />

            <LoadingButton
              fullWidth
              variant="contained"
              size="large"
              startIcon={<SaveIcon />}
              onClick={saveSettings}
              loading={loading}
              disabled={
                loading ||
                !settings.billPrinter ||
                !settings.barcodePrinter ||
                !settings.billPrinterWidth ||
                !settings.barcodePrinterWidth ||
                !settings.barcodePrinterHeight
              }
              sx={{
                py: 1.5,
                borderRadius: 2,
                fontWeight: 600,
              }}
            >
              حفظ إعدادات الطابعة
            </LoadingButton>
          </Paper>
        </Grid2>
      </Grid2>
    </Box>
  );
};

export default PrinterSettings;

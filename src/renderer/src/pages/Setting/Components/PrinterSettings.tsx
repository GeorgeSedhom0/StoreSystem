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
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Slider,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import AlertMessage, { AlertMsg } from "@renderer/pages/Shared/AlertMessage";
import {
  Print as PrintIcon,
  Receipt as ReceiptIcon,
  QrCode as BarcodeIcon,
  Save as SaveIcon,
  Straighten as SizeIcon,
  ExpandMore as ExpandMoreIcon,
  Tune as TuneIcon,
} from "@mui/icons-material";

// Default barcode settings optimized for 40mm x 25mm labels
const DEFAULT_BARCODE_SETTINGS = {
  // Margins in mm
  marginTop: 1,
  marginBottom: 1,
  marginLeft: 2,
  marginRight: 2,
  // Barcode size as percentage of available space
  barcodeWidthPercent: 90,
  barcodeHeightPercent: 40,
  // What to show
  showProductName: true,
  showPrice: true,
  showStoreName: false,
  showBarcodeNumber: true,
  // Store name (for when showStoreName is true)
  storeName: "",
  // Font sizes in pixels
  productNameFontSize: 14,
  priceFontSize: 12,
  storeNameFontSize: 10,
  // Bar width (1-4, higher = thicker bars)
  barWidth: 2,
};

interface BarcodeSettings {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  barcodeWidthPercent: number;
  barcodeHeightPercent: number;
  showProductName: boolean;
  showPrice: boolean;
  showStoreName: boolean;
  showBarcodeNumber: boolean;
  storeName: string;
  productNameFontSize: number;
  priceFontSize: number;
  storeNameFontSize: number;
  barWidth: number;
}

interface PrinterSettingsState {
  billPrinter: string;
  barcodePrinter: string;
  billPrinterWidth: string;
  billPrinterHeight: string;
  barcodePrinterWidth: string;
  barcodePrinterHeight: string;
  barcodeSettings: BarcodeSettings;
}

const PrinterSettings = () => {
  const [printers, setPrinters] = useState<
    {
      name: string;
    }[]
  >([]);
  const [settings, setSettings] = useState<PrinterSettingsState>({
    billPrinter: "",
    barcodePrinter: "",
    billPrinterWidth: "",
    billPrinterHeight: "",
    barcodePrinterWidth: "40",
    barcodePrinterHeight: "25",
    barcodeSettings: { ...DEFAULT_BARCODE_SETTINGS },
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
          // Merge saved settings with defaults to handle new fields
          setSettings({
            ...settings,
            ...savedSettings,
            barcodeSettings: {
              ...DEFAULT_BARCODE_SETTINGS,
              ...(savedSettings.barcodeSettings || {}),
            },
          });
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

  const handleBarcodeSettingChange = <K extends keyof BarcodeSettings>(
    field: K,
    value: BarcodeSettings[K],
  ) => {
    setSettings((prev) => ({
      ...prev,
      barcodeSettings: {
        ...prev.barcodeSettings,
        [field]: value,
      },
    }));
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
                  slotProps={{
                    input: {
                      startAdornment: (
                        <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                    },
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
                  slotProps={{
                    input: {
                      startAdornment: (
                        <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                    },
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
              {/* Printer Selection */}
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

              {/* Label Size */}
              <Grid2 size={6}>
                <TextField
                  fullWidth
                  label="عرض الملصق (مم)"
                  type="number"
                  value={settings.barcodePrinterWidth}
                  onChange={handleChange("barcodePrinterWidth")}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                    },
                  }}
                  helperText="مثال: 40 مم"
                />
              </Grid2>

              <Grid2 size={6}>
                <TextField
                  fullWidth
                  label="ارتفاع الملصق (مم)"
                  type="number"
                  value={settings.barcodePrinterHeight}
                  onChange={handleChange("barcodePrinterHeight")}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <SizeIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                    },
                  }}
                  helperText="مثال: 25 مم"
                />
              </Grid2>

              {/* Advanced Barcode Settings */}
              <Grid2 size={12}>
                <Accordion defaultExpanded={false}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <TuneIcon color="primary" />
                      <Typography fontWeight={600}>
                        إعدادات متقدمة للباركود
                      </Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid2 container spacing={3}>
                      {/* Margins */}
                      <Grid2 size={12}>
                        <Typography
                          variant="subtitle2"
                          color="text.secondary"
                          gutterBottom
                        >
                          الهوامش (مم)
                        </Typography>
                      </Grid2>
                      <Grid2 size={3}>
                        <TextField
                          fullWidth
                          label="أعلى"
                          type="number"
                          size="small"
                          value={settings.barcodeSettings.marginTop}
                          onChange={(e) =>
                            handleBarcodeSettingChange(
                              "marginTop",
                              Number(e.target.value),
                            )
                          }
                          inputProps={{ min: 0, max: 10, step: 0.5 }}
                        />
                      </Grid2>
                      <Grid2 size={3}>
                        <TextField
                          fullWidth
                          label="أسفل"
                          type="number"
                          size="small"
                          value={settings.barcodeSettings.marginBottom}
                          onChange={(e) =>
                            handleBarcodeSettingChange(
                              "marginBottom",
                              Number(e.target.value),
                            )
                          }
                          inputProps={{ min: 0, max: 10, step: 0.5 }}
                        />
                      </Grid2>
                      <Grid2 size={3}>
                        <TextField
                          fullWidth
                          label="يسار"
                          type="number"
                          size="small"
                          value={settings.barcodeSettings.marginLeft}
                          onChange={(e) =>
                            handleBarcodeSettingChange(
                              "marginLeft",
                              Number(e.target.value),
                            )
                          }
                          inputProps={{ min: 0, max: 10, step: 0.5 }}
                        />
                      </Grid2>
                      <Grid2 size={3}>
                        <TextField
                          fullWidth
                          label="يمين"
                          type="number"
                          size="small"
                          value={settings.barcodeSettings.marginRight}
                          onChange={(e) =>
                            handleBarcodeSettingChange(
                              "marginRight",
                              Number(e.target.value),
                            )
                          }
                          inputProps={{ min: 0, max: 10, step: 0.5 }}
                        />
                      </Grid2>

                      {/* Barcode Size */}
                      <Grid2 size={12}>
                        <Divider sx={{ my: 1 }} />
                        <Typography
                          variant="subtitle2"
                          color="text.secondary"
                          gutterBottom
                          sx={{ mt: 2 }}
                        >
                          حجم الباركود
                        </Typography>
                      </Grid2>
                      <Grid2 size={6}>
                        <Typography variant="body2" gutterBottom>
                          عرض الباركود: {settings.barcodeSettings.barcodeWidthPercent}%
                        </Typography>
                        <Slider
                          value={settings.barcodeSettings.barcodeWidthPercent}
                          onChange={(_e, value) =>
                            handleBarcodeSettingChange(
                              "barcodeWidthPercent",
                              value as number,
                            )
                          }
                          min={50}
                          max={100}
                          valueLabelDisplay="auto"
                        />
                      </Grid2>
                      <Grid2 size={6}>
                        <Typography variant="body2" gutterBottom>
                          ارتفاع الباركود: {settings.barcodeSettings.barcodeHeightPercent}%
                        </Typography>
                        <Slider
                          value={settings.barcodeSettings.barcodeHeightPercent}
                          onChange={(_e, value) =>
                            handleBarcodeSettingChange(
                              "barcodeHeightPercent",
                              value as number,
                            )
                          }
                          min={20}
                          max={70}
                          valueLabelDisplay="auto"
                        />
                      </Grid2>
                      <Grid2 size={6}>
                        <Typography variant="body2" gutterBottom>
                          سُمك الخطوط: {settings.barcodeSettings.barWidth}
                        </Typography>
                        <Slider
                          value={settings.barcodeSettings.barWidth}
                          onChange={(_e, value) =>
                            handleBarcodeSettingChange("barWidth", value as number)
                          }
                          min={1}
                          max={4}
                          step={1}
                          marks
                          valueLabelDisplay="auto"
                        />
                      </Grid2>

                      {/* Display Options */}
                      <Grid2 size={12}>
                        <Divider sx={{ my: 1 }} />
                        <Typography
                          variant="subtitle2"
                          color="text.secondary"
                          gutterBottom
                          sx={{ mt: 2 }}
                        >
                          العناصر المعروضة
                        </Typography>
                      </Grid2>
                      <Grid2 size={6}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={settings.barcodeSettings.showProductName}
                              onChange={(e) =>
                                handleBarcodeSettingChange(
                                  "showProductName",
                                  e.target.checked,
                                )
                              }
                            />
                          }
                          label="اسم المنتج"
                        />
                      </Grid2>
                      <Grid2 size={6}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={settings.barcodeSettings.showPrice}
                              onChange={(e) =>
                                handleBarcodeSettingChange(
                                  "showPrice",
                                  e.target.checked,
                                )
                              }
                            />
                          }
                          label="السعر"
                        />
                      </Grid2>
                      <Grid2 size={6}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={settings.barcodeSettings.showBarcodeNumber}
                              onChange={(e) =>
                                handleBarcodeSettingChange(
                                  "showBarcodeNumber",
                                  e.target.checked,
                                )
                              }
                            />
                          }
                          label="رقم الباركود"
                        />
                      </Grid2>
                      <Grid2 size={6}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={settings.barcodeSettings.showStoreName}
                              onChange={(e) =>
                                handleBarcodeSettingChange(
                                  "showStoreName",
                                  e.target.checked,
                                )
                              }
                            />
                          }
                          label="اسم المتجر"
                        />
                      </Grid2>

                      {/* Store Name Input (shown only when showStoreName is true) */}
                      {settings.barcodeSettings.showStoreName && (
                        <Grid2 size={12}>
                          <TextField
                            fullWidth
                            label="اسم المتجر"
                            size="small"
                            value={settings.barcodeSettings.storeName}
                            onChange={(e) =>
                              handleBarcodeSettingChange("storeName", e.target.value)
                            }
                            placeholder="أدخل اسم المتجر"
                          />
                        </Grid2>
                      )}

                      {/* Font Sizes */}
                      <Grid2 size={12}>
                        <Divider sx={{ my: 1 }} />
                        <Typography
                          variant="subtitle2"
                          color="text.secondary"
                          gutterBottom
                          sx={{ mt: 2 }}
                        >
                          أحجام الخطوط (بكسل)
                        </Typography>
                      </Grid2>
                      <Grid2 size={4}>
                        <TextField
                          fullWidth
                          label="اسم المنتج"
                          type="number"
                          size="small"
                          value={settings.barcodeSettings.productNameFontSize}
                          onChange={(e) =>
                            handleBarcodeSettingChange(
                              "productNameFontSize",
                              Number(e.target.value),
                            )
                          }
                          inputProps={{ min: 8, max: 24 }}
                          disabled={!settings.barcodeSettings.showProductName}
                        />
                      </Grid2>
                      <Grid2 size={4}>
                        <TextField
                          fullWidth
                          label="السعر"
                          type="number"
                          size="small"
                          value={settings.barcodeSettings.priceFontSize}
                          onChange={(e) =>
                            handleBarcodeSettingChange(
                              "priceFontSize",
                              Number(e.target.value),
                            )
                          }
                          inputProps={{ min: 8, max: 24 }}
                          disabled={!settings.barcodeSettings.showPrice}
                        />
                      </Grid2>
                      <Grid2 size={4}>
                        <TextField
                          fullWidth
                          label="اسم المتجر"
                          type="number"
                          size="small"
                          value={settings.barcodeSettings.storeNameFontSize}
                          onChange={(e) =>
                            handleBarcodeSettingChange(
                              "storeNameFontSize",
                              Number(e.target.value),
                            )
                          }
                          inputProps={{ min: 8, max: 20 }}
                          disabled={!settings.barcodeSettings.showStoreName}
                        />
                      </Grid2>
                    </Grid2>
                  </AccordionDetails>
                </Accordion>
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

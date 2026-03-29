import { useState, useEffect, useContext } from "react";
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
  Stack,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import AlertMessage, { AlertMsg } from "@renderer/pages/Shared/AlertMessage";
import { StoreContext } from "@renderer/StoreDataProvider";
import {
  DEFAULT_BILL_LOGO_APPEARANCE,
  type BillLogoAppearance,
  notifyBillLogoAppearanceUpdated,
  notifyBillLogoUpdated,
  useBillLogo,
} from "@renderer/pages/Shared/hooks/useBillLogo";
import {
  Print as PrintIcon,
  Receipt as ReceiptIcon,
  QrCode as BarcodeIcon,
  Save as SaveIcon,
  Straighten as SizeIcon,
  ExpandMore as ExpandMoreIcon,
  Tune as TuneIcon,
  UploadFile as UploadFileIcon,
  DeleteOutline as DeleteOutlineIcon,
  ImageOutlined as ImageOutlinedIcon,
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
  billLogos?: Record<string, unknown>;
  billLogoSettings?: Record<string, BillLogoAppearance>;
}

const PrinterSettings = () => {
  const { storeId, store } = useContext(StoreContext);
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
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const { logo, reloadLogo } = useBillLogo(storeId);
  const billLogoAppearance =
    settings.billLogoSettings?.[String(storeId)] ||
    DEFAULT_BILL_LOGO_APPEARANCE;

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
            billPrinter: "",
            barcodePrinter: "",
            billPrinterWidth: "",
            billPrinterHeight: "",
            barcodePrinterWidth: "40",
            barcodePrinterHeight: "25",
            ...savedSettings,
            barcodeSettings: {
              ...DEFAULT_BARCODE_SETTINGS,
              ...(savedSettings.barcodeSettings || {}),
            },
            billLogos: savedSettings.billLogos || {},
            billLogoSettings: savedSettings.billLogoSettings || {},
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
      const currentSettings =
        (await window.electron.ipcRenderer.invoke("getPrinterSettings")) || {};

      const mergedSettings = {
        ...currentSettings,
        ...settings,
        barcodeSettings: {
          ...(currentSettings.barcodeSettings || {}),
          ...(settings.barcodeSettings || {}),
        },
        billLogos: {
          ...(currentSettings.billLogos || {}),
          ...(settings.billLogos || {}),
        },
        billLogoSettings: {
          ...(currentSettings.billLogoSettings || {}),
          ...(settings.billLogoSettings || {}),
        },
      };

      await window.electron.ipcRenderer.invoke(
        "savePrinterSettings",
        mergedSettings,
      );
      setSettings((prev) => ({
        ...prev,
        billLogos: mergedSettings.billLogos,
        billLogoSettings: mergedSettings.billLogoSettings,
      }));
      notifyBillLogoAppearanceUpdated(storeId);
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

  const handleLogoUpload = async () => {
    try {
      setUploadingLogo(true);
      const selection =
        await window.electron.ipcRenderer.invoke("selectBillLogo");

      if (selection?.cancelled || !selection?.sourcePath) {
        return;
      }

      const savedLogo = await window.electron.ipcRenderer.invoke(
        "saveBillLogo",
        {
          storeId,
          sourcePath: selection.sourcePath,
        },
      );

      setSettings((prev) => ({
        ...prev,
        billLogos: {
          ...(prev.billLogos || {}),
          [String(storeId)]: savedLogo,
        },
      }));
      await reloadLogo();
      notifyBillLogoUpdated(storeId);
      setMsg({
        type: "success",
        text: "تم رفع شعار الفاتورة لهذا المخزن على هذا الجهاز",
      });
    } catch (error) {
      console.error("Failed to upload bill logo:", error);
      setMsg({ type: "error", text: "فشل رفع شعار الفاتورة" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoRemove = async () => {
    try {
      setRemovingLogo(true);
      await window.electron.ipcRenderer.invoke("removeBillLogo", storeId);
      setSettings((prev) => {
        const nextBillLogos = { ...(prev.billLogos || {}) };
        delete nextBillLogos[String(storeId)];

        return {
          ...prev,
          billLogos: nextBillLogos,
        };
      });
      await reloadLogo();
      notifyBillLogoUpdated(storeId);
      setMsg({
        type: "success",
        text: "تم حذف شعار الفاتورة لهذا المخزن على هذا الجهاز",
      });
    } catch (error) {
      console.error("Failed to remove bill logo:", error);
      setMsg({ type: "error", text: "فشل حذف شعار الفاتورة" });
    } finally {
      setRemovingLogo(false);
    }
  };

  const handleBillLogoAppearanceChange = <K extends keyof BillLogoAppearance>(
    field: K,
    value: BillLogoAppearance[K],
  ) => {
    setSettings((prev) => ({
      ...prev,
      billLogoSettings: {
        ...(prev.billLogoSettings || {}),
        [String(storeId)]: {
          ...DEFAULT_BILL_LOGO_APPEARANCE,
          ...(prev.billLogoSettings?.[String(storeId)] || {}),
          [field]: value,
        },
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

              <Grid2 size={12}>
                <Divider sx={{ my: 1.5 }} />
              </Grid2>

              <Grid2 size={12}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    background:
                      "linear-gradient(180deg, rgba(25, 118, 210, 0.04) 0%, rgba(25, 118, 210, 0.01) 100%)",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: { xs: "flex-start", md: "center" },
                      justifyContent: "space-between",
                      gap: 2,
                      flexDirection: { xs: "column", md: "row" },
                      mb: 2,
                    }}
                  >
                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 0.5,
                        }}
                      >
                        <ImageOutlinedIcon color="primary" />
                        شعار أعلى الفاتورة
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        يطبّق هذا الشعار على المخزن الحالي فقط داخل هذا الجهاز
                        فقط.
                      </Typography>
                    </Box>

                    <Chip
                      color="primary"
                      variant="outlined"
                      label={`المخزن الحالي: ${store.name || storeId} (#${storeId})`}
                    />
                  </Box>

                  <Box
                    sx={{
                      minHeight: 140,
                      borderRadius: 3,
                      border: "1px dashed",
                      borderColor: logo ? "success.light" : "divider",
                      bgcolor: logo
                        ? "rgba(76, 175, 80, 0.05)"
                        : "background.paper",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      p: 2,
                    }}
                  >
                    {logo?.dataUrl ? (
                      <Box sx={{ textAlign: "center", width: "100%" }}>
                        <Box
                          component="img"
                          src={logo.dataUrl}
                          alt="Bill logo preview"
                          sx={{
                            maxHeight: billLogoAppearance.maxHeight,
                            maxWidth: "100%",
                            objectFit: "contain",
                            mb: 1,
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          سيتم وضع الشعار بشكل مركزي أعلى الفاتورة المطبوعة
                        </Typography>
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: "center" }}>
                        <ImageOutlinedIcon
                          sx={{
                            fontSize: "2rem",
                            color: "text.disabled",
                            mb: 1,
                          }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          لا يوجد شعار محفوظ لهذا المخزن على هذا الجهاز
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    sx={{ mt: 2 }}
                  >
                    <LoadingButton
                      variant="contained"
                      startIcon={<UploadFileIcon />}
                      loading={uploadingLogo}
                      onClick={handleLogoUpload}
                    >
                      رفع شعار
                    </LoadingButton>
                    <LoadingButton
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      loading={removingLogo}
                      onClick={handleLogoRemove}
                      disabled={!logo}
                    >
                      حذف الشعار
                    </LoadingButton>
                  </Stack>

                  <Grid2 container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid2 size={{ xs: 12, md: 6 }}>
                      <Typography gutterBottom sx={{ fontWeight: 600 }}>
                        ارتفاع الشعار
                      </Typography>
                      <Slider
                        value={billLogoAppearance.maxHeight}
                        min={40}
                        max={180}
                        step={5}
                        valueLabelDisplay="auto"
                        onChange={(_, value) =>
                          handleBillLogoAppearanceChange(
                            "maxHeight",
                            value as number,
                          )
                        }
                      />
                      <Typography variant="caption" color="text.secondary">
                        يتحكم في الحجم الأقصى للشعار أعلى الفاتورة
                      </Typography>
                    </Grid2>

                    <Grid2 size={{ xs: 12, md: 6 }}>
                      <Typography gutterBottom sx={{ fontWeight: 600 }}>
                        المسافة أسفل الشعار
                      </Typography>
                      <Slider
                        value={billLogoAppearance.spacingBottom}
                        min={0}
                        max={24}
                        step={1}
                        valueLabelDisplay="auto"
                        onChange={(_, value) =>
                          handleBillLogoAppearanceChange(
                            "spacingBottom",
                            value as number,
                          )
                        }
                      />
                      <Typography variant="caption" color="text.secondary">
                        تتحكم في الفراغ بين الشعار واسم المتجر
                      </Typography>
                    </Grid2>
                  </Grid2>
                </Paper>
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
                          عرض الباركود:{" "}
                          {settings.barcodeSettings.barcodeWidthPercent}%
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
                          ارتفاع الباركود:{" "}
                          {settings.barcodeSettings.barcodeHeightPercent}%
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
                            handleBarcodeSettingChange(
                              "barWidth",
                              value as number,
                            )
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
                              checked={
                                settings.barcodeSettings.showBarcodeNumber
                              }
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
                              handleBarcodeSettingChange(
                                "storeName",
                                e.target.value,
                              )
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

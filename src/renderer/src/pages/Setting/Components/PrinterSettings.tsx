import { useState, useEffect } from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Grid2,
  Typography,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import AlertMessage, { AlertMsg } from "@renderer/pages/Shared/AlertMessage";

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
    <Grid2 container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 size={12}>
        <Typography variant="h6">إعدادات الطابعة</Typography>
      </Grid2>
      <Grid2 size={12}>
        <FormControl fullWidth>
          <InputLabel>طابعة الفواتير</InputLabel>
          <Select
            value={settings.billPrinter}
            onChange={handleChange("billPrinter")}
            label="طابعة الفواتير"
          >
            {printers.map((printer) => (
              <MenuItem key={printer.name} value={printer.name}>
                {printer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid2>
      <Grid2 size={6}>
        <TextField
          label="عرض الفاتورة (مم)"
          type="number"
          value={settings.billPrinterWidth}
          onChange={handleChange("billPrinterWidth")}
          fullWidth
        />
      </Grid2>
      <Grid2 size={6}>
        <TextField
          label="ارتفاع الفاتورة (مم)"
          type="number"
          value={settings.billPrinterHeight}
          onChange={handleChange("billPrinterHeight")}
          fullWidth
        />
      </Grid2>
      <Grid2 size={12}>
        <FormControl fullWidth>
          <InputLabel>طابعة الباركود</InputLabel>
          <Select
            value={settings.barcodePrinter}
            onChange={handleChange("barcodePrinter")}
            label="طابعة الباركود"
          >
            {printers.map((printer) => (
              <MenuItem key={printer.name} value={printer.name}>
                {printer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid2>
      <Grid2 size={12}>
        <LoadingButton
          variant="contained"
          onClick={saveSettings}
          loading={loading}
          disabled={
            loading ||
            !settings.billPrinter ||
            !settings.barcodePrinter ||
            !settings.billPrinterWidth
          }
        >
          حفظ الإعدادات
        </LoadingButton>
      </Grid2>
    </Grid2>
  );
};

export default PrinterSettings;

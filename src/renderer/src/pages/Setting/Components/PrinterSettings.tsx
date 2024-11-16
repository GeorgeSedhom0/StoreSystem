import React, { useState, useEffect } from "react";
import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Grid,
  Typography,
} from "@mui/material";

const PrinterSettings = () => {
  const [printers, setPrinters] = useState([]);
  const [billPrinter, setBillPrinter] = useState("");
  const [barcodePrinter, setBarcodePrinter] = useState("");
  const [billPrinterWidth, setBillPrinterWidth] = useState("");
  const [billPrinterHeight, setBillPrinterHeight] = useState("");

  useEffect(() => {
    const fetchPrinters = async () => {
      const availablePrinters = await window.electron.ipcRenderer.invoke(
        "getPrinters"
      );
      setPrinters(availablePrinters);
    };

    fetchPrinters();
  }, []);

  const saveSettings = async () => {
    const printerSettings = {
      billPrinter,
      barcodePrinter,
      billPrinterWidth,
      billPrinterHeight,
    };
    await window.electron.ipcRenderer.invoke(
      "savePrinterSettings",
      printerSettings
    );
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6">إعدادات الطابعة</Typography>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>طابعة الفواتير</InputLabel>
          <Select
            value={billPrinter}
            onChange={(e) => setBillPrinter(e.target.value)}
          >
            {printers.map((printer) => (
              <MenuItem key={printer.name} value={printer.name}>
                {printer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="عرض الفاتورة"
          value={billPrinterWidth}
          onChange={(e) => setBillPrinterWidth(e.target.value)}
          fullWidth
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          label="ارتفاع الفاتورة (اختياري)"
          value={billPrinterHeight}
          onChange={(e) => setBillPrinterHeight(e.target.value)}
          fullWidth
        />
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>طابعة الباركود</InputLabel>
          <Select
            value={barcodePrinter}
            onChange={(e) => setBarcodePrinter(e.target.value)}
          >
            {printers.map((printer) => (
              <MenuItem key={printer.name} value={printer.name}>
                {printer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <Button variant="contained" onClick={saveSettings}>
          حفظ الإعدادات
        </Button>
      </Grid>
    </Grid>
  );
};

export default PrinterSettings;

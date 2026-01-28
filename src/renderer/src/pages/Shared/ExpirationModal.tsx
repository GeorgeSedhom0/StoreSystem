import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControlLabel,
  Switch,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { BatchInfo, SCProduct } from "../utils/types";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

interface ExpirationModalProps {
  open: boolean;
  onClose: () => void;
  product: SCProduct;
  onSave: (batches: BatchInfo[]) => void;
}

interface BatchRow {
  id: number;
  quantity: number;
  expiration_date: string;
  useProductionDate: boolean;
  production_date: string;
  shelf_life_days: number;
}

const calculateExpirationDate = (productionDate: string, shelfLifeDays: number): string => {
  if (!productionDate || shelfLifeDays <= 0) return "";
  const date = new Date(productionDate);
  date.setDate(date.getDate() + shelfLifeDays);
  return date.toISOString().split("T")[0];
};

const ExpirationModal = ({
  open,
  onClose,
  product,
  onSave,
}: ExpirationModalProps) => {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [error, setError] = useState<string>("");

  // Initialize batches from product or create default
  useEffect(() => {
    if (open) {
      if (product.batches && product.batches.length > 0) {
        setBatches(
          product.batches.map((b, index) => ({
            id: index + 1,
            quantity: b.quantity,
            expiration_date: b.expiration_date || "",
            useProductionDate: false,
            production_date: "",
            shelf_life_days: 0,
          }))
        );
      } else {
        // Default to single batch with full quantity
        setBatches([
          {
            id: 1,
            quantity: product.quantity,
            expiration_date: "",
            useProductionDate: false,
            production_date: "",
            shelf_life_days: 0,
          },
        ]);
      }
      setError("");
    }
  }, [open, product]);

  const addBatch = () => {
    const totalAssigned = batches.reduce((sum, b) => sum + b.quantity, 0);
    const remaining = product.quantity - totalAssigned;
    
    setBatches([
      ...batches,
      {
        id: Date.now(),
        quantity: remaining > 0 ? remaining : 0,
        expiration_date: "",
        useProductionDate: false,
        production_date: "",
        shelf_life_days: 0,
      },
    ]);
  };

  const removeBatch = (id: number) => {
    if (batches.length <= 1) return;
    setBatches(batches.filter((b) => b.id !== id));
  };

  const updateBatch = (id: number, field: keyof BatchRow, value: any) => {
    setBatches(
      batches.map((b) => {
        if (b.id !== id) return b;
        
        const updated = { ...b, [field]: value };
        
        // Auto-calculate expiration date from production date
        if (field === "production_date" || field === "shelf_life_days") {
          if (updated.useProductionDate && updated.production_date && updated.shelf_life_days > 0) {
            updated.expiration_date = calculateExpirationDate(
              updated.production_date,
              updated.shelf_life_days
            );
          }
        }
        
        // Clear production fields when switching off
        if (field === "useProductionDate" && !value) {
          updated.production_date = "";
          updated.shelf_life_days = 0;
        }
        
        return updated;
      })
    );
  };

  const validateAndSave = () => {
    // Check total quantity matches
    const totalQuantity = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
    
    if (totalQuantity !== product.quantity) {
      setError(
        `إجمالي الكميات (${totalQuantity}) يجب أن يساوي كمية المنتج (${product.quantity})`
      );
      return;
    }

    // Check for empty quantities
    if (batches.some((b) => b.quantity <= 0)) {
      setError("كل دفعة يجب أن تحتوي على كمية أكبر من صفر");
      return;
    }

    // Convert to BatchInfo format
    const batchInfo: BatchInfo[] = batches
      .filter((b) => b.quantity > 0)
      .map((b) => ({
        quantity: b.quantity,
        expiration_date: b.expiration_date || null,
      }));

    onSave(batchInfo);
    onClose();
  };

  const totalAssigned = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
  const remaining = product.quantity - totalAssigned;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            تواريخ الصلاحية - {product.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            الكمية الإجمالية: {product.quantity}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 2 }}>
          {error && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}

          <Typography
            variant="body2"
            color={remaining === 0 ? "success.main" : "warning.main"}
            sx={{ mb: 2 }}
          >
            {remaining === 0
              ? "✓ تم توزيع كل الكمية"
              : `⚠️ متبقي ${remaining} وحدة للتوزيع`}
          </Typography>
        </Box>

        <TableContainer component={Paper} sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>الكمية</TableCell>
                <TableCell>طريقة التحديد</TableCell>
                <TableCell>تاريخ الإنتاج</TableCell>
                <TableCell>مدة الصلاحية (أيام)</TableCell>
                <TableCell>تاريخ الانتهاء</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={batch.quantity}
                      onChange={(e) =>
                        updateBatch(batch.id, "quantity", parseInt(e.target.value) || 0)
                      }
                      sx={{ width: 80 }}
                    />
                  </TableCell>
                  <TableCell>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={batch.useProductionDate}
                          onChange={(e) =>
                            updateBatch(batch.id, "useProductionDate", e.target.checked)
                          }
                        />
                      }
                      label={batch.useProductionDate ? "انتاج" : "انتهاء"}
                    />
                  </TableCell>
                  <TableCell>
                    {batch.useProductionDate && (
                      <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DatePicker
                          value={batch.production_date ? dayjs(batch.production_date) : null}
                          onChange={(newValue) =>
                            updateBatch(
                              batch.id,
                              "production_date",
                              newValue ? newValue.format("YYYY-MM-DD") : ""
                            )
                          }
                          format="DD/MM/YYYY"
                          slotProps={{
                            textField: {
                              size: "small",
                              sx: { width: 150 },
                            },
                          }}
                        />
                      </LocalizationProvider>
                    )}
                  </TableCell>
                  <TableCell>
                    {batch.useProductionDate && (
                      <TextField
                        type="number"
                        size="small"
                        value={batch.shelf_life_days || ""}
                        onChange={(e) =>
                          updateBatch(
                            batch.id,
                            "shelf_life_days",
                            parseInt(e.target.value) || 0
                          )
                        }
                        sx={{ width: 80 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                      <DatePicker
                        value={batch.expiration_date ? dayjs(batch.expiration_date) : null}
                        onChange={(newValue) =>
                          updateBatch(
                            batch.id,
                            "expiration_date",
                            newValue ? newValue.format("YYYY-MM-DD") : ""
                          )
                        }
                        format="DD/MM/YYYY"
                        disabled={batch.useProductionDate}
                        slotProps={{
                          textField: {
                            size: "small",
                            sx: { width: 150 },
                          },
                        }}
                      />
                    </LocalizationProvider>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeBatch(batch.id)}
                      disabled={batches.length <= 1}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Button
          startIcon={<AddIcon />}
          onClick={addBatch}
          variant="outlined"
          size="small"
        >
          إضافة دفعة
        </Button>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          إلغاء
        </Button>
        <Button
          onClick={() => {
            // Save without expiration dates
            onSave([]);
            onClose();
          }}
          color="warning"
        >
          بدون صلاحية
        </Button>
        <Button onClick={validateAndSave} variant="contained" color="primary">
          حفظ
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExpirationModal;

import { useState, useEffect, useContext } from "react";
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
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { StoreContext } from "../../StoreDataProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

interface Batch {
  id?: number;
  store_id?: number;
  product_id?: number;
  quantity: number;
  expiration_date: string | null;
  created_at?: string;
}

interface BatchesResponse {
  batches: Batch[];
  total_stock: number;
  total_batch_quantity: number;
  untracked_quantity: number;
}

interface BatchManagementModalProps {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
  currentStock: number;
}

interface EditableBatch {
  id: string; // local ID for key
  quantity: number;
  expiration_date: string;
  isNew: boolean;
}

const getProductBatches = async (productId: number, storeId: number) => {
  const { data } = await axios.get<BatchesResponse>(
    `/product/${productId}/batches`,
    {
      params: { store_id: storeId },
    }
  );
  return data;
};

const updateProductBatches = async (
  productId: number,
  storeId: number,
  batches: { quantity: number; expiration_date: string | null }[]
) => {
  await axios.put(
    `/product/${productId}/batches`,
    { batches },
    { params: { store_id: storeId } }
  );
};

const isExpiringSoon = (dateString: string | null, days: number = 14) => {
  if (!dateString) return false;
  const expDate = new Date(dateString);
  const now = new Date();
  const diffDays = Math.ceil(
    (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDays <= days;
};

const isExpired = (dateString: string | null) => {
  if (!dateString) return false;
  const expDate = new Date(dateString);
  const now = new Date();
  return expDate < now;
};

const BatchManagementModal = ({
  open,
  onClose,
  productId,
  productName,
  currentStock,
}: BatchManagementModalProps) => {
  const { storeId } = useContext(StoreContext);
  const queryClient = useQueryClient();
  const [editableBatches, setEditableBatches] = useState<EditableBatch[]>([]);
  const [error, setError] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["productBatches", productId, storeId],
    queryFn: () => getProductBatches(productId, storeId),
    enabled: open && !!productId && !!storeId,
  });

  const { mutate: saveBatches, isPending: isSaving } = useMutation({
    mutationFn: (batches: { quantity: number; expiration_date: string | null }[]) =>
      updateProductBatches(productId, storeId, batches),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productBatches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "حدث خطأ أثناء الحفظ");
    },
  });

  // Initialize editable batches when data loads
  useEffect(() => {
    if (data && open) {
      const existing = data.batches.map((b, index) => ({
        id: `existing-${index}`,
        quantity: b.quantity,
        expiration_date: b.expiration_date || "",
        isNew: false,
      }));

      // If there's untracked quantity, add a batch for it
      if (data.untracked_quantity > 0) {
        existing.push({
          id: "untracked",
          quantity: data.untracked_quantity,
          expiration_date: "",
          isNew: true,
        });
      }

      // If no batches at all, create one with full stock
      if (existing.length === 0) {
        existing.push({
          id: "new-1",
          quantity: currentStock,
          expiration_date: "",
          isNew: true,
        });
      }

      setEditableBatches(existing);
      setError("");
    }
  }, [data, open, currentStock]);

  const addBatch = () => {
    const totalAssigned = editableBatches.reduce((sum, b) => sum + b.quantity, 0);
    const remaining = currentStock - totalAssigned;

    setEditableBatches([
      ...editableBatches,
      {
        id: `new-${Date.now()}`,
        quantity: remaining > 0 ? remaining : 0,
        expiration_date: "",
        isNew: true,
      },
    ]);
  };

  const removeBatch = (id: string) => {
    if (editableBatches.length <= 1) return;
    setEditableBatches(editableBatches.filter((b) => b.id !== id));
  };

  const updateBatch = (
    id: string,
    field: "quantity" | "expiration_date",
    value: any
  ) => {
    setEditableBatches(
      editableBatches.map((b) =>
        b.id === id ? { ...b, [field]: value } : b
      )
    );
  };

  const validateAndSave = () => {
    const totalQuantity = editableBatches.reduce(
      (sum, b) => sum + (b.quantity || 0),
      0
    );

    if (totalQuantity !== currentStock) {
      setError(
        `إجمالي الكميات (${totalQuantity}) يجب أن يساوي المخزون الحالي (${currentStock})`
      );
      return;
    }

    if (editableBatches.some((b) => b.quantity < 0)) {
      setError("الكمية لا يمكن أن تكون سالبة");
      return;
    }

    const batchesToSave = editableBatches
      .filter((b) => b.quantity > 0)
      .map((b) => ({
        quantity: b.quantity,
        expiration_date: b.expiration_date || null,
      }));

    saveBatches(batchesToSave);
  };

  const totalAssigned = editableBatches.reduce(
    (sum, b) => sum + (b.quantity || 0),
    0
  );
  const difference = currentStock - totalAssigned;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">إدارة تواريخ الصلاحية - {productName}</Typography>
          <Chip label={`المخزون: ${currentStock}`} color="primary" />
        </Box>
      </DialogTitle>

      <DialogContent>
        {isLoading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              py: 4,
            }}
          >
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Typography
              variant="body2"
              color={difference === 0 ? "success.main" : "warning.main"}
              sx={{ mb: 2 }}
            >
              {difference === 0
                ? "✓ تم توزيع كل المخزون"
                : difference > 0
                ? `⚠️ متبقي ${difference} وحدة للتوزيع`
                : `⚠️ تم توزيع ${Math.abs(difference)} وحدة زيادة`}
            </Typography>

            <TableContainer component={Paper} sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>الكمية</TableCell>
                    <TableCell>تاريخ الانتهاء</TableCell>
                    <TableCell>الحالة</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {editableBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          value={batch.quantity}
                          onChange={(e) =>
                            updateBatch(
                              batch.id,
                              "quantity",
                              parseInt(e.target.value) || 0
                            )
                          }
                          sx={{ width: 100 }}
                        />
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
                            slotProps={{
                              textField: {
                                size: "small",
                                sx: { width: 170 },
                              },
                            }}
                          />
                        </LocalizationProvider>
                      </TableCell>
                      <TableCell>
                        {batch.expiration_date ? (
                          isExpired(batch.expiration_date) ? (
                            <Chip
                              icon={<WarningAmberIcon />}
                              label="منتهي"
                              color="error"
                              size="small"
                            />
                          ) : isExpiringSoon(batch.expiration_date) ? (
                            <Chip
                              icon={<WarningAmberIcon />}
                              label="قريب الانتهاء"
                              color="warning"
                              size="small"
                            />
                          ) : (
                            <Chip label="صالح" color="success" size="small" />
                          )
                        ) : (
                          <Chip label="غير محدد" size="small" />
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeBatch(batch.id)}
                          disabled={editableBatches.length <= 1}
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
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={isSaving}>
          إلغاء
        </Button>
        <Button
          onClick={validateAndSave}
          variant="contained"
          color="primary"
          disabled={isLoading || isSaving}
        >
          {isSaving ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchManagementModal;

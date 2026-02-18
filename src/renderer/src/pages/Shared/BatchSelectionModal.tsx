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
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import axios from "axios";
import { StoreContext } from "../../StoreDataProvider";
import { SCProduct, BatchInfo } from "../utils/types";

interface Batch {
  id: number;
  quantity: number;
  expiration_date: string | null;
}

interface BatchSelectionModalProps {
  open: boolean;
  onClose: () => void;
  product: SCProduct;
  onSave: (batches: BatchInfo[]) => void;
}

const isExpiringSoon = (dateString: string | null, days: number = 14) => {
  if (!dateString) return false;
  const expDate = new Date(dateString);
  const now = new Date();
  const diffDays = Math.ceil(
    (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diffDays <= days;
};

const isExpired = (dateString: string | null) => {
  if (!dateString) return false;
  const expDate = new Date(dateString);
  const now = new Date();
  return expDate < now;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "غير محدد";
  return new Date(dateString).toLocaleDateString("en-GB");
};

const BatchSelectionModal = ({
  open,
  onClose,
  product,
  onSave,
}: BatchSelectionModalProps) => {
  const { storeId } = useContext(StoreContext);
  const [availableBatches, setAvailableBatches] = useState<Batch[]>([]);
  const [selectedQuantities, setSelectedQuantities] = useState<
    Map<number, number>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Load available batches
  useEffect(() => {
    const loadBatches = async () => {
      if (!open || !product.id || storeId === null || storeId === undefined)
        return;

      setLoading(true);
      setError("");

      try {
        const response = await axios.get(`/product/${product.id}/batches`, {
          params: { store_id: storeId },
        });
        const batches = (response.data.batches || []).filter(
          (b: Batch) => b.quantity > 0,
        );
        setAvailableBatches(batches);

        // Initialize with FEFO distribution if product already has batches selected
        if (product.batches && product.batches.length > 0) {
          const qtyMap = new Map<number, number>();
          // Match by expiration date
          product.batches.forEach((pb) => {
            const matchingBatch = batches.find(
              (b: Batch) => b.expiration_date === pb.expiration_date,
            );
            if (matchingBatch) {
              qtyMap.set(matchingBatch.id, pb.quantity);
            }
          });
          setSelectedQuantities(qtyMap);
        } else {
          // Default: distribute using FEFO
          distributeFefo(batches, product.quantity);
        }
      } catch (err) {
        console.error("Error loading batches:", err);
        setError("حدث خطأ أثناء تحميل الدفعات");
      }
      setLoading(false);
    };

    loadBatches();
  }, [open, product.id, product.quantity, storeId]);

  const distributeFefo = (batches: Batch[], totalQty: number) => {
    const qtyMap = new Map<number, number>();
    let remaining = totalQty;

    // Sort by expiration date (FEFO)
    const sorted = [...batches].sort((a, b) => {
      if (!a.expiration_date && !b.expiration_date) return 0;
      if (!a.expiration_date) return 1;
      if (!b.expiration_date) return -1;
      return (
        new Date(a.expiration_date).getTime() -
        new Date(b.expiration_date).getTime()
      );
    });

    for (const batch of sorted) {
      if (remaining <= 0) break;
      const takeQty = Math.min(remaining, batch.quantity);
      if (takeQty > 0) {
        qtyMap.set(batch.id, takeQty);
        remaining -= takeQty;
      }
    }

    setSelectedQuantities(qtyMap);
  };

  const updateQuantity = (batchId: number, qty: number) => {
    const newMap = new Map(selectedQuantities);
    if (qty <= 0) {
      newMap.delete(batchId);
    } else {
      newMap.set(batchId, qty);
    }
    setSelectedQuantities(newMap);
  };

  const getTotalSelected = () => {
    let total = 0;
    selectedQuantities.forEach((qty) => {
      total += qty;
    });
    return total;
  };

  const validateAndSave = () => {
    const totalSelected = getTotalSelected();

    if (totalSelected !== product.quantity) {
      setError(
        `الكمية المحددة (${totalSelected}) يجب أن تساوي كمية المنتج (${product.quantity})`,
      );
      return;
    }

    // Check if any selected quantity exceeds available
    for (const [batchId, qty] of selectedQuantities) {
      const batch = availableBatches.find((b) => b.id === batchId);
      if (batch && qty > batch.quantity) {
        setError(`الكمية المحددة تتجاوز المتاح في إحدى الدفعات`);
        return;
      }
    }

    // Convert to BatchInfo array
    const batchInfos: BatchInfo[] = [];
    selectedQuantities.forEach((qty, batchId) => {
      const batch = availableBatches.find((b) => b.id === batchId);
      if (batch && qty > 0) {
        batchInfos.push({
          quantity: qty,
          expiration_date: batch.expiration_date,
          batch_id: batchId,
        });
      }
    });

    onSave(batchInfos);
    onClose();
  };

  const handleAutoFefo = () => {
    distributeFefo(availableBatches, product.quantity);
    setError("");
  };

  const totalSelected = getTotalSelected();
  const difference = product.quantity - totalSelected;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            اختيار الدفعات للبيع - {product.name}
          </Typography>
          <Chip
            label={`الكمية المطلوبة: ${product.quantity}`}
            color="primary"
          />
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading ? (
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
                ? "✓ تم تحديد الكمية المطلوبة"
                : difference > 0
                  ? `⚠️ متبقي ${difference} وحدة للتحديد`
                  : `⚠️ تم تحديد ${Math.abs(difference)} وحدة زيادة`}
            </Typography>

            {availableBatches.length === 0 ? (
              <Alert severity="info">
                لا توجد دفعات مسجلة لهذا المنتج. سيتم البيع بدون تتبع الصلاحية.
              </Alert>
            ) : (
              <TableContainer component={Paper} sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>تاريخ الانتهاء</TableCell>
                      <TableCell>المتاح</TableCell>
                      <TableCell>الكمية المحددة</TableCell>
                      <TableCell>الحالة</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {availableBatches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(batch.expiration_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={batch.quantity}
                            color="info"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            size="small"
                            value={selectedQuantities.get(batch.id) || 0}
                            onChange={(e) =>
                              updateQuantity(
                                batch.id,
                                Math.min(
                                  parseInt(e.target.value) || 0,
                                  batch.quantity,
                                ),
                              )
                            }
                            inputProps={{ min: 0, max: batch.quantity }}
                            sx={{ width: 100 }}
                          />
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Button
              variant="outlined"
              size="small"
              onClick={handleAutoFefo}
              sx={{ mt: 1 }}
            >
              توزيع تلقائي (الأقرب انتهاءً أولاً)
            </Button>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          إلغاء
        </Button>
        <Button
          onClick={validateAndSave}
          variant="contained"
          color="primary"
          disabled={loading || availableBatches.length === 0}
        >
          تأكيد
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchSelectionModal;

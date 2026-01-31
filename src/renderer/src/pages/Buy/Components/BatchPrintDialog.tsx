import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
} from "@mui/material";
import { useState, useRef, useEffect } from "react";
import { SCProduct } from "../../utils/types";
import { printBatchBarcodes } from "../../utils/functions";

interface BatchPrintDialogProps {
  open: boolean;
  onClose: () => void;
  products: SCProduct[];
}

const BatchPrintDialog = ({
  open,
  onClose,
  products,
}: BatchPrintDialogProps) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [currentProduct, setCurrentProduct] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{
    completed: number;
    cancelled: boolean;
  } | null>(null);
  const cancelledRef = useRef(false);

  const productsWithBarcode = products.filter((p) => p.barCode);

  useEffect(() => {
    if (open) {
      cancelledRef.current = false;
      setResult(null);
      setIsPrinting(false);
      setProgress({ current: 0, total: productsWithBarcode.length });
      setCurrentProduct("");
    }
  }, [open, productsWithBarcode.length]);

  const handleStartPrint = async () => {
    setIsPrinting(true);
    cancelledRef.current = false;

    const printResult = await printBatchBarcodes(
      products,
      (current, total, productName) => {
        setProgress({ current, total });
        setCurrentProduct(productName);
      },
      () => cancelledRef.current,
    );

    setResult(printResult);
    setIsPrinting(false);
  };

  const handleCancel = () => {
    if (isPrinting) {
      cancelledRef.current = true;
    } else {
      onClose();
    }
  };

  const handleClose = () => {
    if (!isPrinting) {
      onClose();
    }
  };

  const progressPercent =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>طباعة جميع الباركودات</DialogTitle>
      <DialogContent>
        {productsWithBarcode.length === 0 ? (
          <Typography color="error">
            لا توجد منتجات تحتوي على باركود
          </Typography>
        ) : result ? (
          <Box sx={{ textAlign: "center", py: 2 }}>
            {result.cancelled ? (
              <>
                <Typography variant="h6" color="warning.main">
                  تم إلغاء الطباعة
                </Typography>
                <Typography>
                  تم طباعة {result.completed} من {progress.total} منتج
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h6" color="success.main">
                  تمت الطباعة بنجاح
                </Typography>
                <Typography>تم طباعة {result.completed} منتج</Typography>
              </>
            )}
          </Box>
        ) : isPrinting ? (
          <Box sx={{ py: 2 }}>
            <Typography gutterBottom>جاري طباعة: {currentProduct}</Typography>
            <LinearProgress variant="determinate" value={progressPercent} />
            <Typography align="center" sx={{ mt: 1 }}>
              {progress.current} / {progress.total}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ py: 2 }}>
            <Typography>
              سيتم طباعة باركود لـ {productsWithBarcode.length} منتج
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              كل منتج سيطبع عدد نسخ يساوي الكمية المحددة له
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {result ? (
          <Button onClick={onClose}>إغلاق</Button>
        ) : (
          <>
            <Button onClick={handleCancel} color="inherit">
              {isPrinting ? "إلغاء" : "إغلاق"}
            </Button>
            {!isPrinting && productsWithBarcode.length > 0 && (
              <Button
                onClick={handleStartPrint}
                variant="contained"
                color="primary"
              >
                بدء الطباعة
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BatchPrintDialog;

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Card,
  CardContent,
  Grid2,
  Divider,
  Chip,
  Box,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import ReceiptIcon from "@mui/icons-material/Receipt";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import LoadingScreen from "../../Shared/LoadingScreen";
import { useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "@renderer/StoreDataProvider";

interface ShiftDialogProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  shift: string;
}

interface ShiftTotal {
  sell_total: number;
  buy_total: number;
  return_total: number;
  installment_total: number;
  cash_in: number;
  cash_out: number;
  net_cash_flow: number;
  transaction_count: number;
  shift_start: string | null;
}

const getShiftTotal = async (storeId: number) => {
  const { data } = await axios.get<ShiftTotal>("/shift-total", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const ShiftDialog = ({
  dialogOpen,
  setDialogOpen,
  shift,
}: ShiftDialogProps) => {
  const handleClose = () => {
    if (!shift) return;
    setDialogOpen(false);
  };

  const navigate = useNavigate();
  const { storeId } = useContext(StoreContext);

  const {
    data: shiftTotal,
    isLoading: isShiftTotalLoading,
    refetch: refetchShiftDetails,
  } = useQuery({
    queryKey: ["shiftTotal"],
    queryFn: () => getShiftTotal(storeId),
    initialData: {
      sell_total: 0,
      buy_total: 0,
      return_total: 0,
      installment_total: 0,
      cash_in: 0,
      cash_out: 0,
      net_cash_flow: 0,
      transaction_count: 0,
      shift_start: null,
    },
  });

  useEffect(() => {
    refetchShiftDetails();
  }, [dialogOpen]);

  const closeShift = async () => {
    try {
      await axios.post(
        "/logout",
        {},
        {
          params: {
            store_id: storeId,
          },
        },
      );
      navigate("/login");
    } catch (err) {
      console.log(err);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const grossRevenue = shiftTotal.sell_total + shiftTotal.return_total;

  return (
    <Dialog
      open={dialogOpen}
      onClose={handleClose}
      fullWidth={true}
      maxWidth="lg"
      PaperProps={{
        sx: { borderRadius: 3, minHeight: "70vh" },
      }}
    >
      <LoadingScreen loading={isShiftTotalLoading} />

      <DialogTitle sx={{ textAlign: "center", pb: 1 }}>
        {shift && (
          <Chip
            label={`مفتوحة منذ: ${formatTime(shift)}`}
            color="primary"
            variant="outlined"
            sx={{ mt: 1 }}
          />
        )}
      </DialogTitle>

      <DialogContent sx={{ px: 3 }}>
        <Grid2 container spacing={3}>
          {/* Sales Summary Card */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Card elevation={3} sx={{ height: "100%", borderRadius: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontWeight="bold">
                    ملخص المبيعات
                  </Typography>
                </Box>

                <Box mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    إجمالي البيع
                  </Typography>
                  <Typography
                    variant="h5"
                    color="success.main"
                    fontWeight="bold"
                  >
                    {formatCurrency(shiftTotal.sell_total)}
                  </Typography>
                </Box>

                <Box mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    المرتجعات
                  </Typography>
                  <Typography variant="h6" color="error.main">
                    {formatCurrency(Math.abs(shiftTotal.return_total))}
                  </Typography>
                </Box>

                <Divider sx={{ my: 2 }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    إجمالي الإيرادات
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight="bold"
                    color="primary.main"
                  >
                    {formatCurrency(grossRevenue)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid2>

          {/* Purchases & Cash Flow Card */}
          <Grid2 size={{ xs: 12, md: 6 }}>
            <Card elevation={3} sx={{ height: "100%", borderRadius: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  <TrendingDownIcon color="error" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontWeight="bold">
                    ملخص الحركة النقدية
                  </Typography>
                </Box>

                <Box mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    اجمالى الدخول
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    {formatCurrency(shiftTotal.cash_in)}
                  </Typography>
                </Box>

                <Box mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    اجمالى الخروج
                  </Typography>
                  <Typography variant="h6" color="error.main">
                    {formatCurrency(shiftTotal.cash_out)}
                  </Typography>
                </Box>

                <Divider sx={{ my: 2 }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    صافي الحركة النقدية
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight="bold"
                    color={
                      shiftTotal.net_cash_flow >= 0
                        ? "success.main"
                        : "error.main"
                    }
                  >
                    {formatCurrency(shiftTotal.net_cash_flow)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid2>

          {/* Summary Statistics */}
          <Grid2 size={12}>
            <Card elevation={3} sx={{ borderRadius: 2 }}>
              <CardContent>
                <Box display="flex" alignItems="center" mb={3}>
                  <ReceiptIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6" fontWeight="bold">
                    الملخص النهائي
                  </Typography>
                </Box>

                <Grid2 container spacing={3}>
                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Box textAlign="center">
                      <AccountBalanceWalletIcon
                        sx={{ fontSize: 40, color: "primary.main", mb: 1 }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        عدد المعاملات
                      </Typography>
                      <Typography variant="h4" fontWeight="bold">
                        {shiftTotal.transaction_count}
                      </Typography>
                    </Box>
                  </Grid2>

                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Box textAlign="center">
                      <AttachMoneyIcon
                        sx={{
                          fontSize: 40,
                          color:
                            shiftTotal.net_cash_flow >= 0
                              ? "success.main"
                              : "error.main",
                          mb: 1,
                        }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        صافى الشيفت
                      </Typography>
                      <Typography
                        variant="h4"
                        fontWeight="bold"
                        color={
                          shiftTotal.net_cash_flow >= 0
                            ? "success.main"
                            : "error.main"
                        }
                      >
                        {formatCurrency(shiftTotal.net_cash_flow)}
                      </Typography>
                    </Box>
                  </Grid2>

                  <Grid2 size={{ xs: 12, sm: 4 }}>
                    <Box textAlign="center">
                      <TrendingUpIcon
                        sx={{ fontSize: 40, color: "info.main", mb: 1 }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        متوسط قيمة المعاملة
                      </Typography>
                      <Typography
                        variant="h4"
                        fontWeight="bold"
                        color="info.main"
                      >
                        {formatCurrency(
                          shiftTotal.transaction_count > 0
                            ? grossRevenue / shiftTotal.transaction_count
                            : 0,
                        )}
                      </Typography>
                    </Box>
                  </Grid2>
                </Grid2>
              </CardContent>
            </Card>
          </Grid2>
        </Grid2>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button
          onClick={handleClose}
          disabled={!shift}
          variant="outlined"
          startIcon={<CloseIcon />}
        >
          إغلاق
        </Button>
        <Button
          onClick={closeShift}
          disabled={!shift}
          variant="contained"
          color="error"
          sx={{ ml: 2 }}
        >
          إغلاق شيفت و تسجيل الخروج
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftDialog;

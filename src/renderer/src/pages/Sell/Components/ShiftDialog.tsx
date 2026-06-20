import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Card,
  Chip,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
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
  /** Admin view shows the full real breakdown (buys, cross-store, balances). */
  admin?: boolean;
}

interface PaymentBreakdownItem {
  method: string;
  total: number;
}

interface AccountBreakdownItem {
  method: string;
  shift_total: number;
  balance: number;
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
  payment_breakdown: PaymentBreakdownItem[];
  account_breakdown: AccountBreakdownItem[];
  shift_start: string | null;
}

const getShiftTotal = async (storeId: number, admin: boolean) => {
  const { data } = await axios.get<ShiftTotal>("/shift-total", {
    params: {
      store_id: storeId,
      admin,
    },
  });
  return data;
};

const ShiftDialog = ({
  dialogOpen,
  setDialogOpen,
  shift,
  admin = false,
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
    queryKey: ["shiftTotal", admin],
    queryFn: () => getShiftTotal(storeId, admin),
    initialData: {
      sell_total: 0,
      buy_total: 0,
      return_total: 0,
      installment_total: 0,
      cash_in: 0,
      cash_out: 0,
      net_cash_flow: 0,
      transaction_count: 0,
      payment_breakdown: [],
      account_breakdown: [],
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
  const netCash = shiftTotal.net_cash_flow;
  const avgTxn =
    shiftTotal.transaction_count > 0
      ? grossRevenue / shiftTotal.transaction_count
      : 0;

  const topMethod = shiftTotal.payment_breakdown.reduce<PaymentBreakdownItem | null>(
    (best, m) => (best === null || m.total > best.total ? m : best),
    null,
  );

  const kpis: { label: string; value: string; color: string }[] = admin
    ? [
        { label: "إجمالي البيع", value: formatCurrency(shiftTotal.sell_total), color: "success.main" },
        { label: "المرتجعات", value: formatCurrency(Math.abs(shiftTotal.return_total)), color: "error.main" },
        { label: "إجمالي الشراء", value: formatCurrency(Math.abs(shiftTotal.buy_total)), color: "warning.main" },
        { label: "الدخول النقدي", value: formatCurrency(shiftTotal.cash_in), color: "success.main" },
        { label: "الخروج النقدي", value: formatCurrency(shiftTotal.cash_out), color: "error.main" },
        { label: "صافي الشيفت", value: formatCurrency(netCash), color: netCash >= 0 ? "success.main" : "error.main" },
        { label: "عدد المعاملات", value: String(shiftTotal.transaction_count), color: "text.primary" },
        { label: "متوسط الفاتورة", value: formatCurrency(avgTxn), color: "info.main" },
      ]
    : [
        { label: "إجمالي البيع", value: formatCurrency(shiftTotal.sell_total), color: "success.main" },
        { label: "المرتجعات", value: formatCurrency(Math.abs(shiftTotal.return_total)), color: "error.main" },
        { label: "إجمالي الإيرادات", value: formatCurrency(grossRevenue), color: "primary.main" },
        { label: "عدد المعاملات", value: String(shiftTotal.transaction_count), color: "text.primary" },
        { label: "متوسط الفاتورة", value: formatCurrency(avgTxn), color: "info.main" },
        {
          label: "أعلى طريقة دفع",
          value: topMethod ? topMethod.method : "—",
          color: "secondary.main",
        },
      ];

  // Merge the bills-only split with the all-transactions/balance breakdown so
  // every account shows: bills collected · all shift movement · current balance.
  const billsByMethod: Record<string, number> = {};
  for (const p of shiftTotal.payment_breakdown) billsByMethod[p.method] = p.total;
  const accountRows = shiftTotal.account_breakdown.map((a) => ({
    method: a.method,
    bills: billsByMethod[a.method] || 0,
    all: a.shift_total,
    balance: a.balance,
  }));

  return (
    <Dialog
      open={dialogOpen}
      onClose={handleClose}
      fullWidth={true}
      maxWidth="lg"
      PaperProps={{
        sx: { borderRadius: 3 },
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

      <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
        {/* KPI strip — all key numbers at a glance */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2.5 }}>
          {kpis.map((k) => (
            <Paper
              key={k.label}
              variant="outlined"
              sx={{
                flex: "1 1 180px",
                minWidth: 160,
                px: 2,
                py: 1.5,
                textAlign: "center",
                borderRadius: 2,
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                noWrap
                display="block"
                sx={{ mb: 0.5 }}
              >
                {k.label}
              </Typography>
              <Typography
                variant="h6"
                fontWeight={700}
                color={k.color}
                noWrap
              >
                {k.value}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* Cashier view: simple sales payment-method split (bills only) */}
        {!admin && shiftTotal.payment_breakdown.length > 0 && (
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 2,
                pt: 1.5,
                pb: 0.5,
              }}
            >
              <AccountBalanceWalletIcon color="primary" />
              <Typography variant="h6" fontWeight={700}>
                تحصيل المبيعات حسب طريقة الدفع
              </Typography>
            </Box>
            <TableContainer>
              <Table
                size="medium"
                sx={{
                  "& td, & th": { fontSize: "1rem", py: 1.25 },
                  "& th": { fontWeight: 700 },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>الطريقة</TableCell>
                    <TableCell align="right">المبلغ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shiftTotal.payment_breakdown.map((p) => (
                    <TableRow key={p.method} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{p.method}</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          color: p.total >= 0 ? "success.main" : "error.main",
                        }}
                      >
                        {formatCurrency(p.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}

        {/* Accounts: bills collected vs all shift movement vs current balance.
            Admin-only — the cashier view stays focused on sales. */}
        {admin && accountRows.length > 0 && (
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 2,
                pt: 1.5,
                pb: 0.5,
                flexWrap: "wrap",
              }}
            >
              <AccountBalanceWalletIcon color="primary" />
              <Typography variant="h6" fontWeight={700}>
                الحسابات
              </Typography>
              <Typography variant="body2" color="text.secondary">
                (حركة الشيفت تشمل كل المعاملات — قارن الرصيد الحالي بالفعلي)
              </Typography>
            </Box>
            <TableContainer>
              <Table
                size="medium"
                sx={{
                  "& td, & th": { fontSize: "1rem", py: 1.25 },
                  "& th": { fontWeight: 700 },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>الطريقة</TableCell>
                    <TableCell align="right">تحصيل الفواتير</TableCell>
                    <TableCell align="right">حركة الشيفت (الكل)</TableCell>
                    <TableCell align="right">الرصيد الحالي</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {accountRows.map((r) => (
                    <TableRow key={r.method} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{r.method}</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          color: r.bills >= 0 ? "success.main" : "error.main",
                        }}
                      >
                        {formatCurrency(r.bills)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ color: r.all >= 0 ? "success.main" : "error.main" }}
                      >
                        {r.all >= 0 ? "+" : ""}
                        {formatCurrency(r.all)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 700,
                          color: r.balance >= 0 ? "primary.main" : "error.main",
                        }}
                      >
                        {formatCurrency(r.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
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

import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid2,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import {
  AccountBalanceWallet as WalletIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  SwapHoriz as SwapIcon,
  FactCheck as ReconcileIcon,
} from "@mui/icons-material";
import { useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoreContext } from "@renderer/StoreDataProvider";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import LoadingScreen from "../Shared/LoadingScreen";
import useAccounts, { getAccountTransactions } from "../Shared/hooks/useAccounts";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  }).format(value || 0);

const SOURCE_LABELS: Record<string, string> = {
  bill: "فاتورة",
  manual: "حركة",
  transfer: "تحويل",
};

type DialogMode = "deposit" | "payout" | "reconcile" | "transfer" | null;

const Accounts = () => {
  const { storeId } = useContext(StoreContext);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const {
    accounts,
    total,
    isAccountsLoading,
    deposit,
    payout,
    reconcile,
    transfer,
  } = useAccounts(storeId, setMsg);

  const activeAccounts = accounts.filter((a) => !a.is_deleted);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedAccount = accounts.find((a) => a.id === selectedId) || null;

  // Dialog state
  const [mode, setMode] = useState<DialogMode>(null);
  const [methodId, setMethodId] = useState<number | "">("");
  const [toMethodId, setToMethodId] = useState<number | "">("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState<string>("");

  const { data: ledger = [], isFetching: isLedgerLoading } = useQuery({
    queryKey: ["account-transactions", storeId, selectedId],
    queryFn: () => getAccountTransactions(storeId, selectedId as number),
    enabled: selectedId !== null,
  });

  // Running balance per ledger row (rows are newest-first)
  const ledgerWithBalance = useMemo(() => {
    if (!selectedAccount) return [];
    let running = selectedAccount.balance;
    return ledger.map((row) => {
      const balanceAfter = running;
      running = Math.round((running - row.amount) * 100) / 100;
      return { ...row, balanceAfter };
    });
  }, [ledger, selectedAccount]);

  const openDialog = (m: DialogMode, presetMethod?: number) => {
    setMode(m);
    setMethodId(presetMethod ?? activeAccounts[0]?.id ?? "");
    setToMethodId(
      activeAccounts.find((a) => a.id !== (presetMethod ?? activeAccounts[0]?.id))
        ?.id ?? "",
    );
    setAmount(0);
    setDescription("");
  };

  const closeDialog = () => setMode(null);

  const isBusy =
    deposit.isPending ||
    payout.isPending ||
    reconcile.isPending ||
    transfer.isPending;

  const handleSubmit = async () => {
    if (methodId === "") return;
    const opts = { onSuccess: closeDialog };
    if (mode === "deposit") {
      deposit.mutate(
        { paymentMethodId: methodId, amount, description },
        opts,
      );
    } else if (mode === "payout") {
      payout.mutate({ paymentMethodId: methodId, amount, description }, opts);
    } else if (mode === "reconcile") {
      reconcile.mutate(
        { paymentMethodId: methodId, actualAmount: amount, description },
        opts,
      );
    } else if (mode === "transfer") {
      if (toMethodId === "" || toMethodId === methodId) return;
      transfer.mutate(
        {
          fromMethodId: methodId,
          toMethodId: toMethodId,
          amount,
          description,
        },
        opts,
      );
    }
  };

  const dialogTitle =
    mode === "deposit"
      ? "إيداع في حساب"
      : mode === "payout"
        ? "سحب من حساب"
        : mode === "reconcile"
          ? "تسوية حساب (جرد)"
          : mode === "transfer"
            ? "تحويل بين الحسابات"
            : "";

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={isAccountsLoading} />

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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <WalletIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
            <Box>
              <Typography
                variant="h4"
                sx={{ fontWeight: 600, color: "primary.main" }}
              >
                الحسابات
              </Typography>
              <Typography variant="body2" color="text.secondary">
                رصيد كل طريقة دفع على حدة (نقدي، انستا، فوري...)
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              إجمالي الأرصدة
            </Typography>
            <Typography
              variant="h4"
              sx={{ fontWeight: 700, color: "success.main" }}
            >
              {formatCurrency(total)}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, mt: 3, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<AddIcon />}
            onClick={() => openDialog("deposit")}
          >
            إيداع
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<RemoveIcon />}
            onClick={() => openDialog("payout")}
          >
            سحب
          </Button>
          <Button
            variant="outlined"
            startIcon={<SwapIcon />}
            onClick={() => openDialog("transfer")}
            disabled={activeAccounts.length < 2}
          >
            تحويل بين الحسابات
          </Button>
          <Button
            variant="outlined"
            startIcon={<ReconcileIcon />}
            onClick={() => openDialog("reconcile")}
          >
            تسوية / جرد
          </Button>
        </Box>
      </Paper>

      {/* Account balance cards */}
      <Grid2 container spacing={2} sx={{ mb: 3 }}>
        {accounts.map((account) => (
          <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={account.id}>
            <Card
              elevation={3}
              sx={{
                borderRadius: 2,
                border: "2px solid",
                borderColor:
                  selectedId === account.id ? "primary.main" : "transparent",
              }}
            >
              <CardActionArea
                onClick={() =>
                  setSelectedId(selectedId === account.id ? null : account.id)
                }
              >
                <CardContent>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 1,
                    }}
                  >
                    <WalletIcon color="primary" />
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {account.name}
                    </Typography>
                    {account.is_default && (
                      <Chip label="نقدي" size="small" color="primary" />
                    )}
                    {account.is_deleted && (
                      <Chip label="محذوف" size="small" color="default" />
                    )}
                  </Box>
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    color={
                      account.balance >= 0 ? "success.main" : "error.main"
                    }
                  >
                    {formatCurrency(account.balance)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    اضغط لعرض الحركات
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid2>
        ))}
      </Grid2>

      {/* Selected account ledger */}
      {selectedAccount && (
        <Paper
          elevation={1}
          sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              حركات حساب: {selectedAccount.name}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                color="success"
                onClick={() => openDialog("deposit", selectedAccount.id)}
              >
                إيداع
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => openDialog("payout", selectedAccount.id)}
              >
                سحب
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => openDialog("reconcile", selectedAccount.id)}
              >
                تسوية
              </Button>
            </Box>
          </Box>

          <TableContainer sx={{ maxHeight: 480 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>التاريخ</TableCell>
                  <TableCell>البيان</TableCell>
                  <TableCell>النوع</TableCell>
                  <TableCell align="right">المبلغ</TableCell>
                  <TableCell align="right">الرصيد بعد الحركة</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgerWithBalance.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {row.time}
                    </TableCell>
                    <TableCell>
                      {row.description ||
                        (row.party_name ? row.party_name : "-")}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={SOURCE_LABELS[row.source] || row.source}
                      />
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color: row.amount >= 0 ? "success.main" : "error.main",
                        fontWeight: 600,
                      }}
                    >
                      {formatCurrency(row.amount)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(row.balanceAfter)}
                    </TableCell>
                  </TableRow>
                ))}
                {!isLedgerLoading && ledgerWithBalance.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      لا توجد حركات على هذا الحساب
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Action dialog */}
      <Dialog open={mode !== null} onClose={closeDialog} fullWidth maxWidth="xs">
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>
                {mode === "transfer" ? "من حساب" : "الحساب"}
              </InputLabel>
              <Select
                label={mode === "transfer" ? "من حساب" : "الحساب"}
                value={methodId}
                onChange={(e) => setMethodId(Number(e.target.value))}
              >
                {activeAccounts.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name} — {formatCurrency(a.balance)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {mode === "transfer" && (
              <FormControl fullWidth size="small">
                <InputLabel>إلى حساب</InputLabel>
                <Select
                  label="إلى حساب"
                  value={toMethodId}
                  onChange={(e) => setToMethodId(Number(e.target.value))}
                >
                  {activeAccounts
                    .filter((a) => a.id !== methodId)
                    .map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.name} — {formatCurrency(a.balance)}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            )}

            <TextField
              fullWidth
              size="small"
              type="number"
              label={mode === "reconcile" ? "الرصيد الفعلي" : "المبلغ"}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              inputMode="decimal"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">جنيه</InputAdornment>
                  ),
                },
              }}
            />

            {mode === "reconcile" && methodId !== "" && (
              <Typography variant="body2" color="text.secondary">
                الرصيد الحالي:{" "}
                {formatCurrency(
                  accounts.find((a) => a.id === methodId)?.balance ?? 0,
                )}
                {" — "}
                الفرق سيُسجّل كتسوية
              </Typography>
            )}

            <TextField
              fullWidth
              size="small"
              label="ملاحظة (اختياري)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog}>إلغاء</Button>
          <LoadingButton
            variant="contained"
            loading={isBusy}
            onClick={handleSubmit}
            disabled={
              methodId === "" ||
              (mode !== "reconcile" && amount <= 0) ||
              (mode === "transfer" &&
                (toMethodId === "" || toMethodId === methodId))
            }
          >
            تأكيد
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Accounts;

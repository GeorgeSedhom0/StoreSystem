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
  TablePagination,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import {
  AccountBalanceWallet as WalletIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  SwapHoriz as SwapIcon,
  FactCheck as ReconcileIcon,
} from "@mui/icons-material";
import { useContext, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoreContext } from "@renderer/StoreDataProvider";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import LoadingScreen from "../Shared/LoadingScreen";
import NumberField from "../Shared/NumberField";
import useAccounts, {
  getAccountTransactions,
} from "../Shared/hooks/useAccounts";

// Same digits/grouping as the rest of the money screens (Cash, Bills).
// Negatives are wrapped in an LTR isolate so RTL text shows "-75.50", not "75.50-".
const formatCurrency = (value: number) => {
  const s = (value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? `⁦${s}⁩` : s} ج.م`;
};

const formatTime = (time: string) => {
  const d = new Date(time.replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? time
    : d.toLocaleString("ar-EG", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const SOURCE_LABELS: Record<string, string> = {
  bill: "فاتورة",
  manual: "حركة",
  transfer: "تحويل",
};

type DialogMode = "deposit" | "payout" | "reconcile" | "transfer" | null;

const Accounts = () => {
  const { storeId } = useContext(StoreContext);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down("sm"));
  const ledgerRef = useRef<HTMLDivElement>(null);

  const {
    accounts,
    total,
    isAccountsLoading,
    deposit,
    payout,
    reconcile,
    transfer,
    storeBalances,
    storeTransfer,
  } = useAccounts(storeId, setMsg);

  const activeAccounts = accounts.filter((a) => !a.is_deleted);

  // Inter-store settle dialog
  const [settleStore, setSettleStore] = useState<{
    store_id: number;
    name: string;
    balance: number;
  } | null>(null);
  const [settleDir, setSettleDir] = useState<"pay" | "receive">("pay");
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMyMethod, setSettleMyMethod] = useState<number | "">("");
  const [settleTheirMethod, setSettleTheirMethod] = useState<number | "">("");

  const openSettle = (sb: {
    store_id: number;
    name: string;
    balance: number;
  }) => {
    setSettleStore(sb);
    // balance > 0 => I owe them => default to paying them
    setSettleDir(sb.balance >= 0 ? "pay" : "receive");
    setSettleAmount(Math.abs(sb.balance));
    setSettleMyMethod(activeAccounts[0]?.id ?? "");
    setSettleTheirMethod(activeAccounts[0]?.id ?? "");
  };

  const submitSettle = () => {
    if (!settleStore) return;
    const me = storeId;
    const other = settleStore.store_id;
    const payload =
      settleDir === "pay"
        ? {
            fromStoreId: me,
            toStoreId: other,
            fromPaymentMethodId: settleMyMethod,
            toPaymentMethodId: settleTheirMethod,
          }
        : {
            fromStoreId: other,
            toStoreId: me,
            fromPaymentMethodId: settleTheirMethod,
            toPaymentMethodId: settleMyMethod,
          };
    storeTransfer.mutate(
      {
        ...payload,
        amount: settleAmount,
        description: "تسوية حساب بين المتاجر",
      },
      { onSuccess: () => setSettleStore(null) },
    );
  };

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedAccount = accounts.find((a) => a.id === selectedId) || null;

  // Ledger pagination
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerRowsPerPage, setLedgerRowsPerPage] = useState(25);

  // Dialog state
  const [mode, setMode] = useState<DialogMode>(null);
  const [methodId, setMethodId] = useState<number | "">("");
  const [toMethodId, setToMethodId] = useState<number | "">("");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState<string>("");

  const { data: ledgerData, isFetching: isLedgerLoading } = useQuery({
    queryKey: [
      "account-transactions",
      storeId,
      selectedId,
      ledgerPage,
      ledgerRowsPerPage,
    ],
    queryFn: () =>
      getAccountTransactions(
        storeId,
        selectedId as number,
        ledgerRowsPerPage,
        ledgerPage * ledgerRowsPerPage,
      ),
    enabled: selectedId !== null,
    placeholderData: (prev) => prev,
  });

  const ledger = ledgerData?.transactions ?? [];
  const ledgerTotal = ledgerData?.total ?? 0;

  const selectAccount = (id: number) => {
    setSelectedId((cur) => (cur === id ? null : id));
    setLedgerPage(0);
  };

  // On a phone the ledger opens far below the tapped card; bring it into view.
  useEffect(() => {
    if (selectedId !== null && isMobile) {
      ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId, isMobile]);

  const openDialog = (m: DialogMode, presetMethod?: number) => {
    setMode(m);
    setMethodId(presetMethod ?? activeAccounts[0]?.id ?? "");
    setToMethodId(
      activeAccounts.find(
        (a) => a.id !== (presetMethod ?? activeAccounts[0]?.id),
      )?.id ?? "",
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
      deposit.mutate({ paymentMethodId: methodId, amount, description }, opts);
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
          p: { xs: 2, md: 3 },
          mb: { xs: 2, md: 3 },
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
                sx={{
                  fontWeight: 600,
                  color: "primary.main",
                  fontSize: { xs: "1.6rem", md: "2.125rem" },
                }}
              >
                الحسابات
              </Typography>
              <Typography variant="body2" color="text.secondary">
                رصيد كل طريقة دفع على حدة (نقدي، انستا، فوري...)
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: { xs: "start", sm: "center" } }}>
            <Typography variant="body2" color="text.secondary">
              إجمالي الأرصدة
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: total >= 0 ? "success.main" : "error.main",
                fontSize: { xs: "1.6rem", md: "2.125rem" },
              }}
            >
              {formatCurrency(total)}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            display: { xs: "grid", sm: "flex" },
            gridTemplateColumns: "1fr 1fr",
            gap: 1.5,
            mt: { xs: 2, md: 3 },
            flexWrap: "wrap",
            "& .MuiButton-root": { minHeight: 44 },
          }}
        >
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
      <Grid2
        container
        spacing={{ xs: 1.5, md: 2 }}
        sx={{ mb: { xs: 2, md: 3 } }}
      >
        {accounts.map((account) => (
          <Grid2 size={{ xs: 6, md: 4 }} key={account.id}>
            <Card
              elevation={3}
              sx={{
                borderRadius: 2,
                border: "2px solid",
                borderColor:
                  selectedId === account.id ? "primary.main" : "transparent",
              }}
            >
              <CardActionArea onClick={() => selectAccount(account.id)}>
                <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 1,
                      minWidth: 0,
                    }}
                  >
                    <WalletIcon
                      color="primary"
                      sx={{ display: { xs: "none", sm: "block" } }}
                    />
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
                    color={account.balance >= 0 ? "success.main" : "error.main"}
                    sx={{ fontSize: { xs: "1.05rem", md: "1.5rem" } }}
                  >
                    {formatCurrency(account.balance)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedId === account.id
                      ? "اضغط لإخفاء الحركات"
                      : "اضغط لعرض الحركات"}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid2>
        ))}
      </Grid2>

      {/* Inter-store balances */}
      {storeBalances.length > 0 && (
        <Paper
          elevation={1}
          sx={{
            p: { xs: 2, md: 3 },
            mb: { xs: 2, md: 3 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            الأرصدة بين المتاجر
          </Typography>
          <Grid2 container spacing={2}>
            {storeBalances.map((sb) => {
              const owe = sb.balance > 0.001; // we owe them
              const owed = sb.balance < -0.001; // they owe us
              return (
                <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={sb.store_id}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: owe
                        ? "error.light"
                        : owed
                          ? "success.light"
                          : "divider",
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {sb.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      color={
                        owe
                          ? "error.main"
                          : owed
                            ? "success.main"
                            : "text.secondary"
                      }
                      sx={{ mb: 1 }}
                    >
                      {owe
                        ? `أنت مدين لهم بـ ${formatCurrency(sb.balance)}`
                        : owed
                          ? `هم مدينون لك بـ ${formatCurrency(-sb.balance)}`
                          : "لا يوجد رصيد مستحق"}
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => openSettle(sb)}
                      sx={{ minHeight: 40 }}
                    >
                      تسوية / تحويل
                    </Button>
                  </Box>
                </Grid2>
              );
            })}
          </Grid2>
        </Paper>
      )}

      {/* Selected account ledger */}
      {selectedAccount && (
        <Paper
          ref={ledgerRef}
          elevation={1}
          sx={{
            p: { xs: 1.5, md: 3 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            scrollMarginTop: 72,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
              mb: 2,
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              حركات حساب: {selectedAccount.name}
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 1,
                width: { xs: "100%", sm: "auto" },
                "& .MuiButton-root": {
                  flex: { xs: 1, sm: "0 0 auto" },
                  minHeight: { xs: 40, md: "auto" },
                },
              }}
            >
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

          {isMobile ? (
            <Box sx={{ position: "relative", minHeight: 80 }}>
              <LoadingScreen loading={isLedgerLoading} />
              {ledger.map((row) => (
                <Box
                  key={row.id}
                  sx={{
                    py: 1.25,
                    px: 0.5,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <Box
                    sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, wordBreak: "break-word" }}
                      >
                        {row.description || row.party_name || "-"}
                      </Typography>
                      {row.description && row.party_name && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="div"
                          noWrap
                        >
                          {row.party_name}
                        </Typography>
                      )}
                    </Box>
                    <Typography
                      sx={{
                        fontWeight: 700,
                        flexShrink: 0,
                        color: row.amount >= 0 ? "success.main" : "error.main",
                      }}
                    >
                      {formatCurrency(row.amount)}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    <Chip
                      size="small"
                      label={SOURCE_LABELS[row.source] || row.source}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {formatTime(row.time)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ marginInlineStart: "auto" }}
                    >
                      الرصيد: {formatCurrency(row.balance_after)}
                    </Typography>
                  </Box>
                </Box>
              ))}
              {!isLedgerLoading && ledger.length === 0 && (
                <Typography
                  align="center"
                  color="text.secondary"
                  sx={{ py: 3 }}
                >
                  لا توجد حركات على هذا الحساب
                </Typography>
              )}
            </Box>
          ) : (
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
                  {ledger.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {formatTime(row.time)}
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
                          color:
                            row.amount >= 0 ? "success.main" : "error.main",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCurrency(row.amount)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {formatCurrency(row.balance_after)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLedgerLoading && ledger.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        لا توجد حركات على هذا الحساب
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <TablePagination
            rowsPerPageOptions={[25, 50, 100]}
            component="div"
            count={ledgerTotal}
            rowsPerPage={ledgerRowsPerPage}
            page={ledgerPage}
            onPageChange={(_e, newPage) => setLedgerPage(newPage)}
            onRowsPerPageChange={(e) => {
              setLedgerRowsPerPage(parseInt(e.target.value, 10));
              setLedgerPage(0);
            }}
            labelRowsPerPage="عدد الصفوف:"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} من ${count}`
            }
          />
        </Paper>
      )}

      {/* Action dialog */}
      <Dialog
        open={mode !== null}
        onClose={closeDialog}
        fullWidth
        maxWidth="xs"
        fullScreen={fullScreenDialog}
      >
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

            <NumberField
              fullWidth
              size="small"
              label={mode === "reconcile" ? "الرصيد الفعلي" : "المبلغ"}
              value={amount}
              onValueChange={setAmount}
              allowNegative={mode === "reconcile"}
              autoFocus
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
                الفرق الذي سيُسجّل كتسوية:{" "}
                <b>
                  {formatCurrency(
                    amount -
                      (accounts.find((a) => a.id === methodId)?.balance ?? 0),
                  )}
                </b>
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

      {/* Inter-store settle dialog */}
      <Dialog
        open={settleStore !== null}
        onClose={() => setSettleStore(null)}
        fullWidth
        maxWidth="xs"
        fullScreen={fullScreenDialog}
      >
        <DialogTitle>تسوية / تحويل مع {settleStore?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>الاتجاه</InputLabel>
              <Select
                label="الاتجاه"
                value={settleDir}
                onChange={(e) =>
                  setSettleDir(e.target.value as "pay" | "receive")
                }
              >
                <MenuItem value="pay">أدفع لهم</MenuItem>
                <MenuItem value="receive">يدفعون لي</MenuItem>
              </Select>
            </FormControl>

            <NumberField
              fullWidth
              size="small"
              label="المبلغ"
              value={settleAmount}
              onValueChange={setSettleAmount}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">جنيه</InputAdornment>
                  ),
                },
              }}
            />

            <FormControl fullWidth size="small">
              <InputLabel>حسابي</InputLabel>
              <Select
                label="حسابي"
                value={settleMyMethod}
                onChange={(e) => setSettleMyMethod(Number(e.target.value))}
              >
                {activeAccounts.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>حسابهم</InputLabel>
              <Select
                label="حسابهم"
                value={settleTheirMethod}
                onChange={(e) => setSettleTheirMethod(Number(e.target.value))}
              >
                {activeAccounts.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSettleStore(null)}>إلغاء</Button>
          <LoadingButton
            variant="contained"
            loading={storeTransfer.isPending}
            onClick={submitSettle}
            disabled={
              settleAmount <= 0 ||
              settleMyMethod === "" ||
              settleTheirMethod === ""
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

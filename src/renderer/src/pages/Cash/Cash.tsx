import { useCallback, useEffect, useMemo, useState, useContext } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  Grid2,
  Button,
  Card,
  TextField,
  TableCell,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  ButtonGroup,
  Autocomplete,
  FormControlLabel,
  Switch,
  Box,
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
  Chip,
  InputAdornment,
  TablePagination,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Virtuoso } from "react-virtuoso";
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  PictureAsPdf as PictureAsPdfIcon,
} from "@mui/icons-material";
import { CashFlow, Party } from "../utils/types";
import LoadingScreen from "../Shared/LoadingScreen";
import dayjs, { Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { DateTimePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { useParams } from "react-router-dom";
import NumberField from "../Shared/NumberField";
import { apiError } from "../utils/errors";
import useParties from "../Shared/hooks/useParties";
import usePaymentMethods from "../Shared/hooks/usePaymentMethods";
import useAccounts from "../Shared/hooks/useAccounts";
import { StoreContext } from "@renderer/StoreDataProvider";
import { exportToExcel } from "../Analytics/utils";
import { buildCashFlowReportHtml, exportPdfDocument } from "../utils/a4Reports";
import { localTimestamp } from "../utils/functions";
import StatCard from "../Shared/StatCard";

const getCashFlow = async (
  startDate: Dayjs,
  endDate: Dayjs,
  partyId: number | null,
  storeId: number,
) => {
  const { data } = await axios.get<CashFlow[]>("/cash-flow", {
    params: {
      start_date: localTimestamp(startDate),
      end_date: localTimestamp(endDate),
      party_id: partyId,
      store_id: storeId,
    },
  });
  return data;
};

// Negative numbers are wrapped in an LTR isolate so RTL text shows "-75.5",
// not "75.5-".
const fmt = (n: number) =>
  Number.isFinite(n)
    ? n < 0
      ? `⁦${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}⁩`
      : n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

const formatTime = (time: string) =>
  new Date(time).toLocaleString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const accountLabel = (
  accounts: NonNullable<CashFlow["accounts"]>,
  acc: { name: string; amount: number },
) =>
  accounts.length > 1 ? `${acc.name}: ${fmt(Math.abs(acc.amount))}` : acc.name;

const NO_PARTY = "بدون طرف ثانٍ";
const NEW_PARTY = "طرف ثانٍ جديد";

/** One cash-flow row as a phone card. */
const CashFlowCard = ({ row }: { row: CashFlow }) => {
  const isIn = row.type === "in";
  const accounts = row.accounts || [];
  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.25,
        borderRadius: 3,
        p: 1.5,
        borderInlineStart: 4,
        borderInlineStartColor: isIn ? "success.main" : "error.main",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, wordBreak: "break-word" }}>
            {row.description || "-"}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {row.party_name || NO_PARTY}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "left", flexShrink: 0 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 18,
              color: isIn ? "success.main" : "error.main",
            }}
          >
            {fmt(row.amount)}
          </Typography>
          <Chip
            label={isIn ? "دخول" : "خروج"}
            color={isIn ? "success" : "error"}
            size="small"
          />
        </Box>
      </Box>
      {accounts.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
          {accounts.map((acc, i) => (
            <Chip
              key={i}
              size="small"
              variant="outlined"
              label={accountLabel(accounts, acc)}
            />
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          gap: 1,
          mt: 1,
          pt: 1,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {formatTime(row.time)}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          الرصيد: {fmt(row.total)}
        </Typography>
      </Box>
    </Card>
  );
};

const Cash = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [moveType, setMoveType] = useState<"in" | "out">("in");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [counterpartAccountId, setCounterpartAccountId] = useState<number | "">(
    "",
  );
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("day"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs().endOf("day"));
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [addingParty, setAddingParty] = useState<boolean>(false);
  const [newParty, setNewParty] = useState<Party>({
    id: null,
    name: "",
    phone: "",
    address: "",
    type: "",
    extra_info: {},
  });
  const [showGlobalTotal, setShowGlobalTotal] = useState<boolean>(() => {
    return localStorage.getItem("cashFlowShowGlobalTotal") === "true";
  });

  // New state for enhanced table functionality
  const [searchTerm, setSearchTerm] = useState("");
  const [orderBy, setOrderBy] = useState<keyof CashFlow>("time");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { partyId } = useParams();
  const { storeId, store } = useContext(StoreContext);

  useEffect(() => {
    if (partyId) setSelectedPartyId(parseInt(partyId));
  }, [partyId]);

  useEffect(() => {
    if (showGlobalTotal) {
      localStorage.setItem("cashFlowShowGlobalTotal", "true");
    } else {
      localStorage.removeItem("cashFlowShowGlobalTotal");
    }
  }, [showGlobalTotal]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, selectedPartyId, startDate, endDate]);

  const { data: lastShift, isLoading: isShiftLoading } = useQuery({
    queryKey: ["lastShift"],
    queryFn: async () => {
      const { data } = await axios.get("/last-shift", {
        params: {
          store_id: storeId,
        },
      });
      return data;
    },
  });

  const { parties, addPartyMutationAsync } = useParties(setMsg);
  const { paymentMethods } = usePaymentMethods();
  const { accounts: accountBalances, total: accountsTotal } =
    useAccounts(storeId);

  // When the selected party is another store, this is a cross-store transfer,
  // so we let the user choose the account on the other store's side too.
  const selectedParty = parties.find((p) => p.id === selectedPartyId);
  // Store parties carry extra_info.store_id (which can legitimately be 0 for the
  // warehouse), so check for presence rather than truthiness.
  const isStoreParty = selectedParty?.extra_info?.store_id != null;

  const {
    data: rawCashFlow,
    isLoading: isCashFlowLoading,
    refetch: updateCashFlow,
  } = useQuery({
    queryKey: ["cashFlow", startDate, endDate, selectedPartyId],
    queryFn: () => getCashFlow(startDate, endDate, selectedPartyId, storeId),
    initialData: [],
  });

  const filteredAndSortedCashFlow = useMemo(() => {
    const searchTokens = searchTerm
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);

    const filtered = rawCashFlow.filter((item) => {
      if (searchTokens.length === 0) {
        return true;
      }

      const searchableText = [item.description, item.party_name || ""]
        .join(" ")
        .toLowerCase();

      return searchTokens.every((token) => searchableText.includes(token));
    });

    filtered.sort((a, b) => {
      const aValue = a[orderBy];
      const bValue = b[orderBy];

      if (orderBy === "time") {
        const aTime = new Date(aValue as string).getTime();
        const bTime = new Date(bValue as string).getTime();
        return order === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (orderBy === "amount" || orderBy === "total") {
        const aNum = Number(aValue) || 0;
        const bNum = Number(bValue) || 0;
        return order === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aStr = String(aValue || "").toLowerCase();
      const bStr = String(bValue || "").toLowerCase();
      return order === "asc"
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });

    if (showGlobalTotal) {
      return filtered;
    }

    const localCashFlow: CashFlow[] = [];
    let total = 0;
    for (let i = filtered.length - 1; i >= 0; i--) {
      const row = filtered[i];
      total += row.amount;
      localCashFlow.unshift({ ...row, total });
    }

    return localCashFlow;
  }, [rawCashFlow, searchTerm, orderBy, order, showGlobalTotal]);

  // Statistics calculations
  const statistics = useMemo(() => {
    const totalIn = filteredAndSortedCashFlow
      .filter((item) => item.type === "in")
      .reduce((sum, item) => sum + item.amount, 0);

    const totalOut = filteredAndSortedCashFlow
      .filter((item) => item.type === "out")
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);

    const netFlow = totalIn - totalOut;

    return {
      totalIn,
      totalOut,
      netFlow,
      totalTransactions: filteredAndSortedCashFlow.length,
    };
  }, [filteredAndSortedCashFlow]);

  const loading = isShiftLoading || isCashFlowLoading;
  const isInstallmentReservedDescription = description.trim() === "قسط";

  // Handler functions for enhanced functionality
  const handleSort = (property: keyof CashFlow) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExportToExcel = () => {
    const exportData = [
      [
        "الوقت",
        "المبلغ",
        "نوع الحركة",
        "الوصف",
        "المجموع",
        "الطرف الثاني",
        "الحساب",
      ],
      ...filteredAndSortedCashFlow.map((item) => [
        new Date(item.time).toLocaleString("ar-EG"),
        item.amount,
        item.type === "in" ? "دخول" : "خروج",
        item.description,
        item.total,
        item.party_name || NO_PARTY,
        (item.accounts || [])
          .map((acc) =>
            (item.accounts || []).length > 1
              ? `${acc.name}: ${Math.abs(acc.amount)}`
              : acc.name,
          )
          .join("، "),
      ]),
    ];
    exportToExcel(exportData, "الحركات المالية");
  };

  const handleExportToPdf = async () => {
    try {
      const selectedPartyName =
        parties.find((party) => party.id === selectedPartyId)?.name ||
        (selectedPartyId === null ? "كل الأطراف" : "طرف غير معروف");

      const html = buildCashFlowReportHtml({
        store,
        rows: filteredAndSortedCashFlow,
        startDate: startDate.format("YYYY/MM/DD HH:mm"),
        endDate: endDate.format("YYYY/MM/DD HH:mm"),
        totalIn: statistics.totalIn,
        totalOut: statistics.totalOut,
        netFlow: statistics.netFlow,
        showGlobalTotal,
        searchTerm,
        selectedParty: selectedPartyName,
      });

      const result = await exportPdfDocument({
        fileName: `cash-flow-${startDate.format("YYYY-MM-DD")}-${endDate.format("YYYY-MM-DD")}.pdf`,
        html,
        landscape: true,
      });

      if (result?.cancelled) {
        return;
      }

      if (!result?.success) {
        throw new Error(result?.error || "Unknown export error");
      }

      setMsg({
        type: "success",
        text: "تم تصدير تقرير التدفقات النقدية PDF بنجاح",
      });
    } catch (error) {
      console.error("Cash flow PDF export failed:", error);
      setMsg({
        type: "error",
        text: "فشل تصدير تقرير التدفقات النقدية PDF",
      });
    }
  };

  const setRange = useCallback(
    (range: "shift" | "day" | "week" | "month") => {
      switch (range) {
        case "shift":
          if (lastShift) {
            setStartDate(dayjs(lastShift.start_date_time));
            setEndDate(dayjs(lastShift.end_date_time));
          }
          break;
        case "day":
          setStartDate(dayjs().startOf("day"));
          setEndDate(dayjs().endOf("day"));
          break;
        case "week":
          setStartDate(dayjs().startOf("week"));
          setEndDate(dayjs().endOf("week"));
          break;
        case "month":
          setStartDate(dayjs().startOf("month"));
          setEndDate(dayjs().endOf("month"));
          break;
        default:
          break;
      }
    },
    [lastShift],
  );

  const addCashFlow = async () => {
    if (amount <= 0) {
      setMsg({ type: "error", text: "أدخل مبلغًا أكبر من صفر" });
      return;
    }
    if (isInstallmentReservedDescription) {
      setMsg({
        type: "error",
        text: "الوصف (قسط) مخصص تلقائيًا للأقساط ولا يمكن إضافته يدويًا",
      });
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    try {
      let newPartyId = selectedPartyId;

      if (addingParty) {
        newPartyId = await addPartyMutationAsync(newParty);
        setAddingParty(false);
        setNewParty({
          id: null,
          name: "",
          phone: "",
          address: "",
          type: "",
          extra_info: {},
        });
      }

      await axios.post(
        "/cash-flow",
        {},
        {
          params: {
            amount,
            move_type: moveType,
            description,
            store_id: storeId,
            party_id: newPartyId,
            time: localTimestamp(),
            payment_method_id: accountId === "" ? null : accountId,
            counterpart_payment_method_id:
              isStoreParty && counterpartAccountId !== ""
                ? counterpartAccountId
                : null,
          },
        },
      );
      await updateCashFlow();
      setAmount(0);
      setDescription("");
      setMoveType("in");
      setSelectedPartyId(null);
      setAccountId("");
      setCounterpartAccountId("");
      setMsg({ type: "success", text: "تمت إضافة الحركة النقدية بنجاح" });
    } catch (error) {
      setMsg({ type: "error", text: apiError(error, "لم تتم الإضافة بنجاح") });
    } finally {
      setSubmitting(false);
    }
  };
  const pageRows = filteredAndSortedCashFlow.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  const sortHeader = (key: keyof CashFlow, label: string) => (
    <TableCell>
      <TableSortLabel
        active={orderBy === key}
        direction={orderBy === key ? order : "asc"}
        onClick={() => handleSort(key)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const emptyText =
    searchTerm.trim() !== ""
      ? "لا توجد حركات مطابقة للبحث"
      : "لا توجد حركات نقدية في هذه الفترة";

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={loading} />
      <Grid2 container spacing={{ xs: 2, md: 3 }}>
        {/* Statistics Cards */}
        <Grid2 container size={12} spacing={{ xs: 1, sm: 2 }} sx={{ mt: 0 }}>
          <Grid2 size={{ xs: 6, sm: 4 }}>
            <StatCard
              color="success"
              icon={<TrendingUpIcon />}
              label="إجمالي النقد الوارد"
              value={fmt(statistics.totalIn)}
              info="مجموع الحركات النقدية الواردة ضمن الفلتر الحالي (الفترة/الطرف/البحث). يشمل نقد الفواتير ومقدمات وأقساط التقسيط والإيداعات اليدوية."
            />
          </Grid2>
          <Grid2 size={{ xs: 6, sm: 4 }}>
            <StatCard
              color="error"
              icon={<TrendingDownIcon />}
              label="إجمالي النقد الصادر"
              value={fmt(statistics.totalOut)}
              info="مجموع الحركات النقدية الصادرة ضمن الفلتر الحالي (الفترة/الطرف/البحث). يشمل فواتير الشراء والمرتجعات والرواتب والسحوبات والمصاريف اليدوية."
            />
          </Grid2>
          <Grid2
            size={{ xs: 12, sm: 4 }}
            sx={{ display: { xs: "none", sm: "block" } }}
          >
            <StatCard
              color="primary"
              icon={<AccountBalanceIcon />}
              label="عدد المعاملات"
              value={statistics.totalTransactions}
            />
          </Grid2>
        </Grid2>

        {/* Account balances strip */}
        {accountBalances.length > 0 && (
          <Grid2 size={12}>
            <Card elevation={3} sx={{ p: { xs: 2, md: 3 } }}>
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
                <Typography
                  variant="h6"
                  sx={{ color: "primary.main", fontWeight: 600 }}
                >
                  أرصدة الحسابات
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  الإجمالي: {fmt(accountsTotal)} جنيه
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                {accountBalances.map((account) => (
                  <Chip
                    key={account.id}
                    color={account.balance >= 0 ? "success" : "error"}
                    variant="outlined"
                    sx={{ fontWeight: 600, fontSize: "0.95rem", py: 2 }}
                    label={
                      <span>
                        {account.name}: {fmt(account.balance)} جنيه
                      </span>
                    }
                  />
                ))}
              </Box>
            </Card>
          </Grid2>
        )}

        {/* Add Cash Flow Form */}
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: { xs: 2, md: 3 } }}>
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                color: "primary.main",
                fontWeight: 600,
                fontSize: "1.2rem",
              }}
            >
              إضافة حركة نقدية جديدة
            </Typography>
            <Grid2 container spacing={{ xs: 2, md: 3 }}>
              <Grid2
                container
                size={12}
                justifyContent="space-between"
                rowGap={2}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: { xs: 1.5, md: 3 },
                    flexWrap: "wrap",
                    width: { xs: "100%", md: "auto" },
                    "& > *": { flex: { xs: "1 1 140px", md: "0 0 auto" } },
                  }}
                >
                  <NumberField
                    label="المبلغ"
                    value={amount}
                    onValueChange={setAmount}
                    min={0}
                  />
                  <FormControl>
                    <InputLabel>نوع الحركة</InputLabel>
                    <Select
                      label="نوع الحركة"
                      value={moveType}
                      onChange={(e) =>
                        setMoveType(e.target.value as "in" | "out")
                      }
                      sx={{ minWidth: 120 }}
                    >
                      <MenuItem value="in">دخول</MenuItem>
                      <MenuItem value="out">خروج</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl>
                    <InputLabel>الحساب</InputLabel>
                    <Select
                      label="الحساب"
                      value={accountId}
                      onChange={(e) =>
                        setAccountId(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                      sx={{ minWidth: 140 }}
                    >
                      <MenuItem value="">
                        <em>نقدي (افتراضي)</em>
                      </MenuItem>
                      {paymentMethods.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {m.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {isStoreParty && (
                    <FormControl>
                      <InputLabel>حساب المتجر الآخر</InputLabel>
                      <Select
                        label="حساب المتجر الآخر"
                        value={counterpartAccountId}
                        onChange={(e) =>
                          setCounterpartAccountId(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                        sx={{ minWidth: 160 }}
                      >
                        <MenuItem value="">
                          <em>نقدي (افتراضي)</em>
                        </MenuItem>
                        {paymentMethods.map((m) => (
                          <MenuItem key={m.id} value={m.id}>
                            {m.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <TextField
                    label="الوصف"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    error={isInstallmentReservedDescription}
                    helperText={
                      isInstallmentReservedDescription
                        ? "القيمة (قسط) محجوزة لنظام الأقساط"
                        : ""
                    }
                  />
                  <Button
                    onClick={addCashFlow}
                    disabled={
                      loading ||
                      submitting ||
                      amount <= 0 ||
                      isInstallmentReservedDescription
                    }
                    variant="contained"
                    sx={{ minWidth: 120, minHeight: 44 }}
                  >
                    إضافة حركة نقدية
                  </Button>
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showGlobalTotal}
                      onChange={(e) => setShowGlobalTotal(e.target.checked)}
                    />
                  }
                  label="إظهار الإجمالي العام"
                />
              </Grid2>
              <Grid2 size={12}>
                <Autocomplete
                  options={
                    [
                      {
                        id: null,
                        name: NO_PARTY,
                        phone: "01xxx",
                        address: "****",
                        type: "****",
                      },
                      {
                        id: null,
                        name: NEW_PARTY,
                        phone: "01xxx",
                        address: "****",
                        type: "****",
                      },
                      ...parties,
                    ] as Party[]
                  }
                  getOptionLabel={(option) =>
                    option.name + " - " + option.phone + " - " + option.type
                  }
                  isOptionEqualToValue={(option, value) =>
                    option.id === value.id && option.name === value.name
                  }
                  value={
                    parties.find((party) => party.id === selectedPartyId) ||
                    null
                  }
                  onChange={(_, value) => {
                    if (value && value.id) {
                      setSelectedPartyId(value.id);
                      setAddingParty(false);
                    } else {
                      setSelectedPartyId(null);
                      if (value && value.name === NEW_PARTY) {
                        setAddingParty(true);
                      } else {
                        setAddingParty(false);
                      }
                    }
                  }}
                  filterOptions={(options, params) => {
                    const filtered = options.filter(
                      (option) =>
                        option.name.toLowerCase().includes(params.inputValue) ||
                        option.phone.includes(params.inputValue),
                    );
                    return filtered;
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="الطرف الثاني"
                      helperText="اختيار طرف يعرض حركاته فقط في القائمة بالأسفل"
                    />
                  )}
                />
              </Grid2>
              {addingParty && (
                <Grid2 container size={12} spacing={2}>
                  <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField
                      fullWidth
                      label="اسم الطرف الثاني"
                      value={newParty.name}
                      onChange={(e) =>
                        setNewParty({ ...newParty, name: e.target.value })
                      }
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField
                      fullWidth
                      label="رقم الهاتف"
                      value={newParty.phone}
                      onChange={(e) =>
                        setNewParty({ ...newParty, phone: e.target.value })
                      }
                      slotProps={{ htmlInput: { inputMode: "tel" } }}
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                    <TextField
                      fullWidth
                      label="العنوان"
                      value={newParty.address}
                      onChange={(e) =>
                        setNewParty({ ...newParty, address: e.target.value })
                      }
                    />
                  </Grid2>
                  <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                    <FormControl fullWidth>
                      <InputLabel>النوع</InputLabel>
                      <Select
                        label="النوع"
                        value={newParty.type}
                        onChange={(e) =>
                          setNewParty({ ...newParty, type: e.target.value })
                        }
                      >
                        <MenuItem value="عميل">عميل</MenuItem>
                        <MenuItem value="مورد">مورد</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid2>
                </Grid2>
              )}
            </Grid2>
          </Card>
        </Grid2>

        {/* Period, search and export */}
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                color: "primary.main",
                fontWeight: 600,
                fontSize: "1.2rem",
              }}
            >
              البحث في الحركات النقدية
            </Typography>
            <Grid2 container spacing={2} alignItems="center">
              <LocalizationProvider
                dateAdapter={AdapterDayjs}
                adapterLocale="ar-sa"
              >
                <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                  <DateTimePicker
                    label="من"
                    value={startDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setStartDate(newValue);
                    }}
                    disableFuture
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid2>
                <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                  <DateTimePicker
                    label="إلى"
                    value={endDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setEndDate(newValue);
                    }}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid2>
              </LocalizationProvider>
              <Grid2 size={{ xs: 12, md: 6 }}>
                <ButtonGroup
                  fullWidth={isMobile}
                  sx={{
                    "& .MuiButton-root": {
                      minHeight: 40,
                      whiteSpace: "nowrap",
                      px: { xs: 0.5, sm: 2 },
                    },
                  }}
                >
                  <Button onClick={() => setRange("shift")}>آخر شيفت</Button>
                  <Button onClick={() => setRange("day")}>اليوم</Button>
                  <Button onClick={() => setRange("week")}>هذا الأسبوع</Button>
                  <Button onClick={() => setRange("month")}>هذا الشهر</Button>
                </ButtonGroup>
              </Grid2>
              <Grid2 size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  placeholder="ابحث في الوصف أو الطرف الثاني (افصل بفاصلة لمطابقة كل الكلمات)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                      ),
                    },
                  }}
                  size="small"
                />
              </Grid2>
              <Grid2 size={{ xs: 6, md: 3 }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportToExcel}
                  fullWidth
                  sx={{ minHeight: 40 }}
                >
                  تصدير Excel
                </Button>
              </Grid2>
              <Grid2 size={{ xs: 6, md: 3 }}>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={handleExportToPdf}
                  fullWidth
                  sx={{ minHeight: 40 }}
                >
                  تصدير PDF
                </Button>
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>

        {/* Cash flow list */}
        <Grid2 size={12}>
          {isMobile ? (
            <Box sx={{ position: "relative", minHeight: 120 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  mb: 1.5,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  الحركات ({statistics.totalTransactions})
                </Typography>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>ترتيب</InputLabel>
                  <Select
                    label="ترتيب"
                    value={`${orderBy}:${order}`}
                    onChange={(e) => {
                      const [k, o] = String(e.target.value).split(":");
                      setOrderBy(k as keyof CashFlow);
                      setOrder(o as "asc" | "desc");
                    }}
                  >
                    <MenuItem value="time:desc">الأحدث أولًا</MenuItem>
                    <MenuItem value="time:asc">الأقدم أولًا</MenuItem>
                    <MenuItem value="amount:desc">الأكبر مبلغًا</MenuItem>
                    <MenuItem value="amount:asc">الأصغر مبلغًا</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              {!loading && filteredAndSortedCashFlow.length === 0 && (
                <Typography
                  align="center"
                  color="text.secondary"
                  sx={{ py: 4 }}
                >
                  {emptyText}
                </Typography>
              )}
              {/* Window scrolling: no nested scroll box on phones. */}
              <Virtuoso
                useWindowScroll
                increaseViewportBy={{ top: 600, bottom: 1600 }}
                data={filteredAndSortedCashFlow}
                itemContent={(_, row) => <CashFlowCard row={row} />}
              />
            </Box>
          ) : (
            <Card elevation={3}>
              <TableContainer component={Paper}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      {sortHeader("time", "الوقت")}
                      {sortHeader("amount", "المبلغ")}
                      {sortHeader("type", "نوع الحركة")}
                      {sortHeader("description", "الوصف")}
                      {sortHeader("total", "الرصيد")}
                      {sortHeader("party_name", "الطرف الثاني")}
                      <TableCell>الحساب</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {!loading && pageRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          align="center"
                          sx={{ py: 4, color: "text.secondary" }}
                        >
                          {emptyText}
                        </TableCell>
                      </TableRow>
                    )}
                    {pageRows.map((row, index) => (
                      <TableRow key={index} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {formatTime(row.time)}
                        </TableCell>
                        <TableCell
                          sx={{
                            fontWeight: 600,
                            color:
                              row.type === "in" ? "success.main" : "error.main",
                          }}
                        >
                          {fmt(row.amount)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.type === "in" ? "دخول" : "خروج"}
                            color={row.type === "in" ? "success" : "error"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell>{fmt(row.total)}</TableCell>
                        <TableCell>{row.party_name || NO_PARTY}</TableCell>
                        <TableCell>
                          {row.accounts && row.accounts.length > 0 ? (
                            <Box
                              sx={{
                                display: "flex",
                                gap: 0.5,
                                flexWrap: "wrap",
                              }}
                            >
                              {row.accounts.map((acc, i) => (
                                <Chip
                                  key={i}
                                  size="small"
                                  variant="outlined"
                                  label={accountLabel(row.accounts!, acc)}
                                />
                              ))}
                            </Box>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[10, 25, 50, 100]}
                component="div"
                count={filteredAndSortedCashFlow.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                labelRowsPerPage="عدد الصفوف لكل صفحة:"
                labelDisplayedRows={({ from, to, count }) =>
                  `${from}-${to} من ${count}`
                }
              />
            </Card>
          )}
        </Grid2>
      </Grid2>
    </>
  );
};

export default Cash;

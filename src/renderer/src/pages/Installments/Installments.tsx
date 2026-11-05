import {
  Button,
  Card,
  Grid2,
  Paper,
  Typography,
  Chip,
  Box,
  Divider,
  Avatar,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Collapse,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Schedule as ScheduleIcon,
  EventAvailable,
  ViewAgenda,
  ViewList,
  Payment,
  CheckCircle,
  Warning,
  Search,
  ExpandMore,
  ExpandLess,
  TrendingUp,
  TrendingDown,
  AccountBalance,
  PictureAsPdf,
} from "@mui/icons-material";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import LoadingScreen from "../Shared/LoadingScreen";
import { useState, useContext, useEffect, useMemo, useRef } from "react";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import PayInstallment from "./Components/PayInstallment";
import { StoreContext } from "@renderer/StoreDataProvider";
import StatCard from "../Shared/StatCard";
import useConfirm from "../Shared/useConfirm";
import { apiError } from "../utils/errors";
import { fmtMoney } from "./format";
import { Schedule, scheduleOf } from "./schedule";
import { InstallmentCard, InstallmentRow } from "./Components/InstallmentCard";
import { normalizeArabic } from "../Shared/ProductAutocomplete";
import {
  buildInstallmentsReportHtml,
  exportPdfDocument,
} from "../utils/a4Reports";

export interface Installment {
  id: number;
  bill_id: number;
  paid: number;
  time: string;
  installments_count: number;
  installment_interval: number;
  party_name: string;
  party_phone?: string;
  flow: {
    id: number;
    amount: number;
    time: string;
  }[];
  total: number;
  products: {
    id: number;
    name: string;
    price: number;
    amount: number;
  }[];
  ended: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  all: "الكل",
  overdue: "متأخر",
  week: "مستحق خلال 7 أيام",
  active: "نشط",
  completed: "مكتمل",
  unknown: "عملاء غير معروفين",
};

type ViewMode = "cards" | "list";
const VIEW_KEY = "installmentsView";
const readView = (): ViewMode => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
};

const getInstallments = async (storeId: number) => {
  const { data } = await axios.get<Installment[]>("/installments", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const Installments = () => {
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [showEnded, setShowEnded] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(
    null,
  );
  const [confirm, confirmDialog] = useConfirm();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const topRef = useRef<HTMLDivElement>(null);

  // New search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due");
  const [view, setViewState] = useState<ViewMode>(readView);
  const setView = (v: ViewMode) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);

  const { storeId, store } = useContext(StoreContext);

  // Helper functions for calculations - moved before usage
  const getTotalPaid = (installment: Installment) => {
    return (
      installment.paid +
      installment.flow.reduce((acc, flow) => acc + flow.amount, 0)
    );
  };

  const getTotalRemaining = (installment: Installment) => {
    return Math.abs(installment.total) - getTotalPaid(installment);
  };

  const getPaymentProgress = (installment: Installment) => {
    const totalBill = Math.abs(installment.total);
    const totalPaid = getTotalPaid(installment);
    return totalBill > 0 ? (totalPaid / totalBill) * 100 : 0;
  };

  // One schedule rule for the list, the cards and the pay screen.
  const getInstallmentStatus = (installment: Installment) =>
    scheduleOf(installment).status;

  const {
    data: rawData = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["installments", storeId],
    queryFn: () => getInstallments(storeId),
  });

  // Schedules computed once per load, shared by filters, sort and cards.
  const schedules = useMemo(() => {
    const m = new Map<number, Schedule>();
    rawData.forEach((i) => m.set(i.id, scheduleOf(i)));
    return m;
  }, [rawData]);
  const sched = (i: Installment) => schedules.get(i.id) ?? scheduleOf(i);
  const isDueThisWeek = (i: Installment) => {
    const x = sched(i);
    return x.status === "active" && x.nextDue !== null && x.daysUntil <= 7;
  };

  // Counts for the quick filter chips (ignore the status filter itself).
  const chipCounts = useMemo(() => {
    const visible = rawData.filter((i) => showEnded || !i.ended);
    return {
      all: visible.length,
      overdue: visible.filter((i) => sched(i).status === "overdue").length,
      week: visible.filter(isDueThisWeek).length,
      active: visible.filter((i) => sched(i).status === "active").length,
      completed: visible.filter((i) => sched(i).status === "completed").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, schedules, showEnded]);

  const data = useMemo(() => {
    let filteredData = rawData
      .map((installment) => ({
        ...installment,
        flow: installment.flow.filter((flow) => flow.id),
      }))
      .filter((installment) => {
        // Show ended filter
        if (!showEnded && installment.ended) return false;

        // Search: name (ignoring أ/إ/آ…), phone, plan or bill number
        if (searchTerm) {
          const q = normalizeArabic(searchTerm);
          const hay = [
            normalizeArabic(installment.party_name || ""),
            installment.party_phone || "",
            String(installment.id),
            String(installment.bill_id),
          ].join(" ");
          if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
        }

        // Status filter
        if (statusFilter !== "all") {
          const status = getInstallmentStatus(installment);
          if (statusFilter === "unknown") {
            if (installment.party_name) return false;
          } else if (statusFilter === "week") {
            if (!isDueThisWeek(installment)) return false;
          } else if (statusFilter !== status) return false;
        }

        return true;
      });

    // Sorting
    filteredData.sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case "due": {
          // Most urgent first: late (longest first), then soonest due,
          // finished plans last. Direction-independent on purpose.
          const rank = (x: Schedule) =>
            x.status === "overdue"
              ? -1e12 - x.daysLate
              : x.nextDue
                ? x.nextDue.getTime()
                : 1e15;
          return rank(sched(a)) - rank(sched(b));
        }
        case "time":
          aVal = new Date(a.time).getTime();
          bVal = new Date(b.time).getTime();
          break;
        case "total":
          aVal = Math.abs(a.total);
          bVal = Math.abs(b.total);
          break;
        case "remaining":
          aVal = getTotalRemaining(a);
          bVal = getTotalRemaining(b);
          break;
        case "party":
          aVal = (a.party_name || "").toLowerCase();
          bVal = (b.party_name || "").toLowerCase();
          break;
        case "progress":
          aVal = getPaymentProgress(a);
          bVal = getPaymentProgress(b);
          break;
        default:
          return 0;
      }

      const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "asc" ? result : -result;
    });

    return filteredData;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rawData,
    schedules,
    showEnded,
    searchTerm,
    statusFilter,
    sortBy,
    sortOrder,
  ]);

  const selected =
    selectedInstallment !== null
      ? data.find((installment) => installment.id === selectedInstallment)
      : undefined;

  // The selected installment can disappear after a refetch (e.g. it became
  // fully paid and completed ones are hidden): go back to the list.
  useEffect(() => {
    if (selectedInstallment !== null && !isLoading && !selected) {
      setSelectedInstallment(null);
    }
  }, [selectedInstallment, selected, isLoading]);

  // Opening the pay screen from deep in the list: start at its top.
  useEffect(() => {
    if (selectedInstallment !== null) {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedInstallment]);

  // Calculate summary statistics - now after helper functions are defined
  const summaryStats = {
    totalBills: data.reduce((sum, inst) => sum + Math.abs(inst.total), 0),
    totalPaid: data.reduce((sum, inst) => sum + getTotalPaid(inst), 0),
    totalRemaining: data.reduce(
      (sum, inst) => sum + getTotalRemaining(inst),
      0,
    ),
    overdueCount: data.filter(
      (inst) => getInstallmentStatus(inst) === "overdue",
    ).length,
    completedCount: data.filter(
      (inst) => getInstallmentStatus(inst) === "completed",
    ).length,
    unknownParties: data.filter((inst) => !inst.party_name).length,
    dueWeekCount: data.filter(isDueThisWeek).length,
    dueWeekAmount: data
      .filter(isDueThisWeek)
      .reduce((sum, inst) => sum + sched(inst).nextAmount, 0),
  };

  const handleDeletePayment = async (
    flowId: number,
    amount: number,
    partyName: string,
  ) => {
    const ok = await confirm({
      title: "حذف الدفعة؟",
      message: (
        <Typography>
          سيتم حذف دفعة بقيمة <b>{fmtMoney(amount)}</b> من أقساط{" "}
          {partyName || "عميل غير معروف"} وخصمها من الخزينة.
          <br />
          <b>لا يمكن التراجع عن هذا الإجراء.</b>
        </Typography>
      ),
      confirmText: "حذف",
      danger: true,
    });
    if (!ok) return;

    try {
      await axios.delete(`/installments/flow/${flowId}`);
      setMsg({
        type: "success",
        text: "تم حذف الدفعة بنجاح",
      });
      refetch();
    } catch (error) {
      console.error("Error deleting payment:", error);
      setMsg({
        type: "error",
        text: apiError(error, "فشل في حذف الدفعة"),
      });
    }
  };

  const handleExportInstallmentsPdf = async () => {
    try {
      const html = buildInstallmentsReportHtml({
        store,
        installments: data,
        searchTerm,
        statusFilter,
        showEnded,
        totalBills: summaryStats.totalBills,
        totalPaid: summaryStats.totalPaid,
        totalRemaining: summaryStats.totalRemaining,
        overdueCount: summaryStats.overdueCount,
        completedCount: summaryStats.completedCount,
        getStatus: getInstallmentStatus,
        getTotalPaid,
        getTotalRemaining,
        getPaymentProgress,
      });

      const result = await exportPdfDocument({
        fileName: `installments-${new Date().toISOString().slice(0, 10)}.pdf`,
        html,
      });

      if (result?.cancelled) {
        return;
      }

      if (!result?.success) {
        throw new Error(result?.error || "Unknown export error");
      }

      setMsg({
        type: "success",
        text: "تم تصدير تقرير الأقساط PDF بنجاح",
      });
    } catch (error) {
      console.error("Installments PDF export failed:", error);
      setMsg({
        type: "error",
        text: "فشل تصدير تقرير الأقساط PDF",
      });
    }
  };

  return (
    <>
      {confirmDialog}
      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Card
            elevation={3}
            sx={{
              px: { xs: 1.5, md: 4 },
              py: { xs: 2, md: 3 },
              position: "relative",
              minHeight: 200,
            }}
          >
            <LoadingScreen loading={isLoading} />
            <AlertMessage message={msg} setMessage={setMsg} />

            {/* Header Section */}
            <Box sx={{ mb: { xs: 2, md: 4 } }}>
              <Stack
                direction="row"
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
                gap={2}
                sx={{ mb: 2 }}
              >
                <Avatar
                  sx={{
                    bgcolor: "primary.main",
                    display: { xs: "none", sm: "flex" },
                  }}
                >
                  <Payment />
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="h4"
                    color="primary"
                    sx={{ fontSize: { xs: "1.5rem", md: "2.125rem" } }}
                  >
                    إدارة الأقساط
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    متابعة وإدارة أقساط العملاء والمدفوعات
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<PictureAsPdf />}
                  onClick={handleExportInstallmentsPdf}
                  sx={{ minHeight: 40 }}
                >
                  تصدير PDF
                </Button>
              </Stack>

              {/* Summary Cards */}
              <Grid2 container spacing={{ xs: 1, md: 2 }} sx={{ mb: 3 }}>
                <Grid2 size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatCard
                    color="primary"
                    icon={<AccountBalance />}
                    label="إجمالي الفواتير"
                    value={fmtMoney(summaryStats.totalBills)}
                  />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatCard
                    color="success"
                    icon={<TrendingUp />}
                    label="إجمالي المدفوع"
                    value={fmtMoney(summaryStats.totalPaid)}
                  />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatCard
                    color="warning"
                    icon={<TrendingDown />}
                    label="إجمالي المتبقي"
                    value={fmtMoney(summaryStats.totalRemaining)}
                  />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatCard
                    color="error"
                    icon={<Warning />}
                    label="متأخرة"
                    value={summaryStats.overdueCount}
                  />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatCard
                    color="info"
                    icon={<CheckCircle />}
                    label="مكتملة"
                    value={summaryStats.completedCount}
                  />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 4, md: 2 }}>
                  <StatCard
                    color="secondary"
                    icon={<EventAvailable />}
                    label="مستحق خلال 7 أيام"
                    value={
                      summaryStats.dueWeekCount
                        ? `${summaryStats.dueWeekCount} · ${fmtMoney(summaryStats.dueWeekAmount)}`
                        : 0
                    }
                  />
                </Grid2>
              </Grid2>

              {/* Search and Filter Controls */}
              <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 3 }} elevation={1}>
                <Stack spacing={2}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    useFlexGap
                    flexWrap="wrap"
                    gap={{ xs: 1, md: 2 }}
                  >
                    <TextField
                      placeholder="البحث بالاسم أو رقم القسط..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      size="small"
                      sx={{ minWidth: { xs: "100%", sm: 250 } }}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <Search />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />

                    <Button
                      variant="outlined"
                      startIcon={showFilters ? <ExpandLess /> : <ExpandMore />}
                      onClick={() => setShowFilters(!showFilters)}
                      sx={{ minHeight: 40 }}
                    >
                      فلاتر متقدمة
                    </Button>

                    <Button
                      variant={showEnded ? "contained" : "outlined"}
                      color="primary"
                      startIcon={showEnded ? <CheckCircle /> : <ScheduleIcon />}
                      onClick={() => setShowEnded((prev) => !prev)}
                      sx={{ minHeight: 40 }}
                    >
                      {showEnded ? "إخفاء المكتملة" : "عرض المكتملة"}
                    </Button>

                    <Box sx={{ ml: "auto" }}>
                      <Typography variant="body2" color="text.secondary">
                        عدد النتائج: {data.length}
                      </Typography>
                    </Box>
                  </Stack>

                  <Collapse in={showFilters}>
                    <Stack
                      direction="row"
                      useFlexGap
                      flexWrap="wrap"
                      gap={2}
                      alignItems="center"
                      sx={{
                        pt: 1,
                        "& .MuiFormControl-root": {
                          flex: { xs: "1 1 140px", sm: "0 0 auto" },
                        },
                      }}
                    >
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>الحالة</InputLabel>
                        <Select
                          value={statusFilter}
                          label="الحالة"
                          onChange={(e) => setStatusFilter(e.target.value)}
                        >
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <MenuItem key={k} value={k}>
                              {v}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>ترتيب حسب</InputLabel>
                        <Select
                          value={sortBy}
                          label="ترتيب حسب"
                          onChange={(e) => setSortBy(e.target.value)}
                        >
                          <MenuItem value="due">الأقرب استحقاقاً</MenuItem>
                          <MenuItem value="due">الأقرب استحقاقاً</MenuItem>
                          <MenuItem value="time">التاريخ</MenuItem>
                          <MenuItem value="total">إجمالي الفاتورة</MenuItem>
                          <MenuItem value="remaining">المبلغ المتبقي</MenuItem>
                          <MenuItem value="party">اسم العميل</MenuItem>
                          <MenuItem value="progress">نسبة التقدم</MenuItem>
                        </Select>
                      </FormControl>

                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>الترتيب</InputLabel>
                        <Select
                          value={sortOrder}
                          label="الترتيب"
                          onChange={(e) =>
                            setSortOrder(e.target.value as "asc" | "desc")
                          }
                        >
                          <MenuItem value="desc">تنازلي</MenuItem>
                          <MenuItem value="asc">تصاعدي</MenuItem>
                        </Select>
                      </FormControl>

                      <Button
                        variant="outlined"
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("all");
                          setSortBy("due");
                          setSortOrder("desc");
                        }}
                        sx={{ minHeight: 40 }}
                      >
                        إعادة تعيين
                      </Button>
                    </Stack>
                  </Collapse>
                </Stack>
              </Paper>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Quick filters + layout */}
            {!selected && (
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flex: 1,
                    minWidth: 0,
                    flexWrap: { xs: "nowrap", md: "wrap" },
                    overflowX: { xs: "auto", md: "visible" },
                    py: 0.5,
                    scrollbarWidth: "none",
                    "&::-webkit-scrollbar": { display: "none" },
                  }}
                >
                  {(
                    [
                      ["all", "الكل", "default"],
                      ["overdue", "متأخر", "error"],
                      ["week", "خلال 7 أيام", "warning"],
                      ["active", "نشط", "primary"],
                      ...(showEnded ? [["completed", "مكتمل", "success"]] : []),
                    ] as [
                      keyof typeof chipCounts,
                      string,
                      "default" | "error" | "warning" | "primary" | "success",
                    ][]
                  ).map(([key, label, color]) => (
                    <Chip
                      key={key}
                      label={`${label} ${chipCounts[key]}`}
                      color={statusFilter === key ? color : "default"}
                      variant={statusFilter === key ? "filled" : "outlined"}
                      onClick={() => setStatusFilter(key)}
                      sx={{ flexShrink: 0, height: 34, fontWeight: 600 }}
                    />
                  ))}
                </Box>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={view}
                  onChange={(_, v) => v && setView(v)}
                  sx={{ flexShrink: 0 }}
                >
                  <ToggleButton value="cards" aria-label="عرض البطاقات">
                    <ViewAgenda fontSize="small" />
                  </ToggleButton>
                  <ToggleButton value="list" aria-label="قائمة مختصرة">
                    <ViewList fontSize="small" />
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            {/* Results Info */}
            {(searchTerm || statusFilter !== "all") && (
              <Alert severity="info" sx={{ mb: 2 }}>
                عرض {data.length} نتيجة من إجمالي الأقساط
                {searchTerm && ` • البحث: "${searchTerm}"`}
                {statusFilter !== "all" &&
                  ` • الحالة: ${STATUS_LABELS[statusFilter] ?? statusFilter}`}
              </Alert>
            )}

            {/* Content Section */}
            <Box ref={topRef} sx={{ scrollMarginTop: 72 }} />
            <Grid2
              container
              spacing={view === "list" && !selected ? 1 : { xs: 2, md: 3 }}
              sx={
                isMobile
                  ? undefined
                  : { maxHeight: "75vh", overflowY: "auto", pr: 1 }
              }
            >
              {isError && (
                <Grid2 size={12}>
                  <Alert
                    severity="error"
                    action={
                      <Button color="inherit" onClick={() => refetch()}>
                        إعادة المحاولة
                      </Button>
                    }
                  >
                    تعذر تحميل الأقساط
                  </Alert>
                </Grid2>
              )}

              {!isLoading && !isError && data.length === 0 && (
                <Grid2 size={12}>
                  <Box
                    sx={{
                      textAlign: "center",
                      py: 8,
                      color: "text.secondary",
                    }}
                  >
                    <Payment sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
                    <Typography variant="h6">
                      {searchTerm || statusFilter !== "all"
                        ? "لا توجد أقساط مطابقة"
                        : showEnded
                          ? "لا توجد أقساط"
                          : "لا توجد أقساط نشطة"}
                    </Typography>
                    <Typography variant="body2">
                      {searchTerm || statusFilter !== "all"
                        ? "جرّب تغيير البحث أو الفلاتر"
                        : showEnded
                          ? "لم يتم العثور على أقساط"
                          : "يمكنك إنشاء أقساط جديدة من صفحة البيع"}
                    </Typography>
                  </Box>
                </Grid2>
              )}

              {selected ? (
                <PayInstallment
                  selectedInstallment={selected}
                  setSelectedInstallment={setSelectedInstallment}
                  setMsg={setMsg}
                  refetchInstallments={refetch}
                />
              ) : (
                data.map((installment) => (
                  <Grid2 size={12} key={installment.id}>
                    {view === "list" ? (
                      <InstallmentRow
                        inst={installment}
                        s={sched(installment)}
                        isMobile={isMobile}
                        storeName={store?.name}
                        onPay={setSelectedInstallment}
                        onDeletePayment={handleDeletePayment}
                      />
                    ) : (
                      <InstallmentCard
                        inst={installment}
                        s={sched(installment)}
                        isMobile={isMobile}
                        storeName={store?.name}
                        onPay={setSelectedInstallment}
                        onDeletePayment={handleDeletePayment}
                      />
                    )}
                  </Grid2>
                ))
              )}
            </Grid2>
          </Card>
        </Grid2>
      </Grid2>
    </>
  );
};

export default Installments;

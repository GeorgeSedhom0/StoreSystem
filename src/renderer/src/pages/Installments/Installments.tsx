import {
  Button,
  Card,
  CardActions,
  CardContent,
  Grid2,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Box,
  Divider,
  LinearProgress,
  Avatar,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Collapse,
  Alert,
} from "@mui/material";
import {
  Person,
  Schedule,
  Payment,
  CheckCircle,
  Warning,
  AttachMoney,
  Delete,
  Search,
  ExpandMore,
  ExpandLess,
  TrendingUp,
  TrendingDown,
  AccountBalance,
} from "@mui/icons-material";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import LoadingScreen from "../Shared/LoadingScreen";
import { useState, useContext } from "react";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import PayInstallment from "./Components/PayInstallment";
import { StoreContext } from "@renderer/StoreDataProvider";
import FormatedNumber from "../Shared/FormatedNumber";

export interface Installment {
  id: number;
  bill_id: number; // Add this line
  paid: number;
  time: string;
  installments_count: number;
  installment_interval: number;
  party_name: string;
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
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    flowId: number | null;
    amount: number;
    installmentId: number | null;
  }>({
    open: false,
    flowId: null,
    amount: 0,
    installmentId: null,
  });

  // New search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);

  const { storeId } = useContext(StoreContext);

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

  const getInstallmentStatus = (installment: Installment) => {
    if (installment.ended) return "completed";

    const totalRemaining = getTotalRemaining(installment);
    if (totalRemaining <= 0) return "completed";

    // Check if overdue
    const lastPaymentDate =
      installment.flow.length > 0
        ? new Date(installment.flow[installment.flow.length - 1].time)
        : new Date(installment.time);

    const nextDueDate = new Date(
      lastPaymentDate.getTime() +
        installment.installment_interval * 24 * 60 * 60 * 1000,
    );

    if (new Date() > nextDueDate) return "overdue";
    return "active";
  };

  const { data, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ["installments"],
    queryFn: () => getInstallments(storeId),
    initialData: [],
    select: (data: Installment[]) => {
      let filteredData = data
        .map((installment) => ({
          ...installment,
          flow: installment.flow.filter((flow) => flow.id),
        }))
        .filter((installment) => {
          // Show ended filter
          if (!showEnded && installment.ended) return false;

          // Search filter
          if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            const partyName = (installment.party_name || "").toLowerCase();
            const installmentId = installment.id.toString();

            if (
              !partyName.includes(searchLower) &&
              !installmentId.includes(searchLower)
            ) {
              return false;
            }
          }

          // Status filter
          if (statusFilter !== "all") {
            const status = getInstallmentStatus(installment);
            if (statusFilter === "unknown" && installment.party_name)
              return false;
            if (statusFilter !== "unknown" && statusFilter !== status)
              return false;
          }

          return true;
        });

      // Sorting
      filteredData.sort((a, b) => {
        let aVal, bVal;

        switch (sortBy) {
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
    },
  });

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
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Chip
            icon={<CheckCircle />}
            label="مكتمل"
            color="success"
            size="small"
          />
        );
      case "overdue":
        return (
          <Chip icon={<Warning />} label="متأخر" color="error" size="small" />
        );
      case "active":
        return (
          <Chip icon={<Schedule />} label="نشط" color="primary" size="small" />
        );
      default:
        return <Chip label="غير معروف" color="default" size="small" />;
    }
  };

  const handleDeletePayment = async () => {
    if (!deleteDialog.flowId) return;

    try {
      await axios.delete(`/installments/flow/${deleteDialog.flowId}`);
      setMsg({
        type: "success",
        text: "تم حذف الدفعة بنجاح",
      });
      refetch();
    } catch (error) {
      console.error("Error deleting payment:", error);
      setMsg({
        type: "error",
        text: "فشل في حذف الدفعة",
      });
    } finally {
      setDeleteDialog({
        open: false,
        flowId: null,
        amount: 0,
        installmentId: null,
      });
    }
  };

  return (
    <>
      <Dialog
        open={deleteDialog.open}
        onClose={() =>
          setDeleteDialog({
            open: false,
            flowId: null,
            amount: 0,
            installmentId: null,
          })
        }
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title">تأكيد حذف الدفعة</DialogTitle>
        <DialogContent>
          <DialogContentText>
            هل أنت متأكد من حذف هذه الدفعة؟
            <br />
            المبلغ: <FormatedNumber money>{deleteDialog.amount}</FormatedNumber>
            <br />
            <strong>لا يمكن التراجع عن هذا الإجراء.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() =>
              setDeleteDialog({
                open: false,
                flowId: null,
                amount: 0,
                installmentId: null,
              })
            }
            color="primary"
          >
            إلغاء
          </Button>
          <Button
            onClick={handleDeletePayment}
            color="error"
            variant="contained"
            startIcon={<Delete />}
          >
            حذف
          </Button>
        </DialogActions>
      </Dialog>

      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ px: 4, py: 3, position: "relative" }}>
            <LoadingScreen loading={isFetching && isPlaceholderData} />
            <AlertMessage message={msg} setMessage={setMsg} />

            {/* Header Section */}
            <Box sx={{ mb: 4 }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{ mb: 2 }}
              >
                <Avatar sx={{ bgcolor: "primary.main" }}>
                  <Payment />
                </Avatar>
                <Box>
                  <Typography variant="h4" color="primary" gutterBottom>
                    إدارة الأقساط
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    متابعة وإدارة أقساط العملاء والمدفوعات
                  </Typography>
                </Box>
              </Stack>

              {/* Summary Cards */}
              <Grid2 container spacing={2} sx={{ mb: 3 }}>
                <Grid2 size={{ xs: 6, md: 2 }}>
                  <Card sx={{ textAlign: "center", p: 2 }} elevation={2}>
                    <AccountBalance sx={{ color: "primary.main", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      إجمالي الفواتير
                    </Typography>
                    <Typography variant="h6" color="primary.main">
                      <FormatedNumber money>
                        {summaryStats.totalBills}
                      </FormatedNumber>
                    </Typography>
                  </Card>
                </Grid2>

                <Grid2 size={{ xs: 6, md: 2 }}>
                  <Card sx={{ textAlign: "center", p: 2 }} elevation={2}>
                    <TrendingUp sx={{ color: "success.main", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      إجمالي المدفوع
                    </Typography>
                    <Typography variant="h6" color="success.main">
                      <FormatedNumber money>
                        {summaryStats.totalPaid}
                      </FormatedNumber>
                    </Typography>
                  </Card>
                </Grid2>

                <Grid2 size={{ xs: 6, md: 2 }}>
                  <Card sx={{ textAlign: "center", p: 2 }} elevation={2}>
                    <TrendingDown sx={{ color: "warning.main", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      إجمالي المتبقي
                    </Typography>
                    <Typography variant="h6" color="warning.main">
                      <FormatedNumber money>
                        {summaryStats.totalRemaining}
                      </FormatedNumber>
                    </Typography>
                  </Card>
                </Grid2>

                <Grid2 size={{ xs: 6, md: 2 }}>
                  <Card sx={{ textAlign: "center", p: 2 }} elevation={2}>
                    <Warning sx={{ color: "error.main", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      متأخرة
                    </Typography>
                    <Typography variant="h6" color="error.main">
                      {summaryStats.overdueCount}
                    </Typography>
                  </Card>
                </Grid2>

                <Grid2 size={{ xs: 6, md: 2 }}>
                  <Card sx={{ textAlign: "center", p: 2 }} elevation={2}>
                    <CheckCircle sx={{ color: "info.main", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      مكتملة
                    </Typography>
                    <Typography variant="h6" color="info.main">
                      {summaryStats.completedCount}
                    </Typography>
                  </Card>
                </Grid2>

                <Grid2 size={{ xs: 6, md: 2 }}>
                  <Card sx={{ textAlign: "center", p: 2 }} elevation={2}>
                    <Person sx={{ color: "text.secondary", mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      عملاء غير معروفين
                    </Typography>
                    <Typography variant="h6" color="text.secondary">
                      {summaryStats.unknownParties}
                    </Typography>
                  </Card>
                </Grid2>
              </Grid2>

              {/* Search and Filter Controls */}
              <Paper sx={{ p: 2, mb: 3 }} elevation={1}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <TextField
                      placeholder="البحث بالاسم أو رقم القسط..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      size="small"
                      sx={{ minWidth: 250 }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Search />
                          </InputAdornment>
                        ),
                      }}
                    />

                    <Button
                      variant="outlined"
                      startIcon={showFilters ? <ExpandLess /> : <ExpandMore />}
                      onClick={() => setShowFilters(!showFilters)}
                      size="small"
                    >
                      فلاتر متقدمة
                    </Button>

                    <Button
                      variant={showEnded ? "contained" : "outlined"}
                      color="primary"
                      startIcon={showEnded ? <CheckCircle /> : <Schedule />}
                      onClick={() => setShowEnded((prev) => !prev)}
                      size="small"
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
                    <Stack direction="row" spacing={2} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>الحالة</InputLabel>
                        <Select
                          value={statusFilter}
                          label="الحالة"
                          onChange={(e) => setStatusFilter(e.target.value)}
                        >
                          <MenuItem value="all">الكل</MenuItem>
                          <MenuItem value="active">نشط</MenuItem>
                          <MenuItem value="overdue">متأخر</MenuItem>
                          <MenuItem value="completed">مكتمل</MenuItem>
                          <MenuItem value="unknown">عملاء غير معروفين</MenuItem>
                        </Select>
                      </FormControl>

                      <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>ترتيب حسب</InputLabel>
                        <Select
                          value={sortBy}
                          label="ترتيب حسب"
                          onChange={(e) => setSortBy(e.target.value)}
                        >
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
                        size="small"
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("all");
                          setSortBy("time");
                          setSortOrder("desc");
                        }}
                      >
                        إعادة تعيين
                      </Button>
                    </Stack>
                  </Collapse>
                </Stack>
              </Paper>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Results Info */}
            {(searchTerm || statusFilter !== "all") && (
              <Alert severity="info" sx={{ mb: 2 }}>
                عرض {data.length} نتيجة من إجمالي الأقساط
                {searchTerm && ` • البحث: "${searchTerm}"`}
                {statusFilter !== "all" && ` • الحالة: ${statusFilter}`}
              </Alert>
            )}

            {/* Content Section */}
            <Grid2
              container
              spacing={3}
              sx={{
                maxHeight: "75vh",
                overflowY: "auto",
                pr: 1,
              }}
            >
              {data.length === 0 && (
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
                      لا توجد أقساط {showEnded ? "مكتملة" : "نشطة"}
                    </Typography>
                    <Typography variant="body2">
                      {showEnded
                        ? "لم يتم العثور على أقساط مكتملة"
                        : "يمكنك إنشاء أقساط جديدة من صفحة المبيعات"}
                    </Typography>
                  </Box>
                </Grid2>
              )}

              {selectedInstallment ? (
                <PayInstallment
                  selectedInstallment={
                    data.find(
                      (installment) => installment.id === selectedInstallment,
                    )!
                  }
                  setSelectedInstallment={setSelectedInstallment}
                  setMsg={setMsg}
                  refetchInstallments={refetch}
                />
              ) : (
                data.map((installment) => {
                  const status = getInstallmentStatus(installment);
                  const progress = getPaymentProgress(installment);
                  const totalPaid = getTotalPaid(installment);
                  const totalRemaining = getTotalRemaining(installment);

                  return (
                    <Grid2 size={12} key={installment.id}>
                      <Card
                        elevation={2}
                        sx={{
                          border:
                            status === "overdue" ? "2px solid" : "1px solid",
                          borderColor:
                            status === "overdue" ? "error.main" : "divider",
                        }}
                      >
                        <CardContent sx={{ pb: 1 }}>
                          {/* Header with customer info and status */}
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="flex-start"
                            sx={{ mb: 3 }}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={2}
                            >
                              <Avatar sx={{ bgcolor: "secondary.main" }}>
                                <Person />
                              </Avatar>
                              <Box>
                                <Typography
                                  variant="h6"
                                  sx={{ fontWeight: 600 }}
                                >
                                  {installment.party_name || "عميل غير معروف"}
                                </Typography>
                                <Stack direction="row" spacing={2}>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    رقم القسط: #{installment.id}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    رقم الفاتورة: #{installment.bill_id}
                                  </Typography>
                                </Stack>
                              </Box>
                            </Stack>
                            {getStatusChip(status)}
                          </Stack>{" "}
                          {/* Financial Summary */}
                          <Grid2 container spacing={3} sx={{ mb: 3 }}>
                            <Grid2 size={{ xs: 6, md: 3 }}>
                              <Card
                                sx={{
                                  textAlign: "center",
                                  p: 2,
                                  borderRadius: 2,
                                }}
                                elevation={9}
                              >
                                <AttachMoney
                                  sx={{ color: "primary.main", mb: 1 }}
                                />
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  إجمالي الفاتورة
                                </Typography>
                                <Typography variant="h6" color="primary.main">
                                  <FormatedNumber money>
                                    {Math.abs(installment.total)}
                                  </FormatedNumber>
                                </Typography>
                              </Card>
                            </Grid2>

                            <Grid2 size={{ xs: 6, md: 3 }}>
                              <Card
                                sx={{
                                  textAlign: "center",
                                  p: 2,
                                  borderRadius: 2,
                                }}
                                elevation={9}
                              >
                                <Payment
                                  sx={{ color: "success.main", mb: 1 }}
                                />
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  المقدم
                                </Typography>
                                <Typography variant="h6" color="success.main">
                                  <FormatedNumber money>
                                    {installment.paid}
                                  </FormatedNumber>
                                </Typography>
                              </Card>
                            </Grid2>

                            <Grid2 size={{ xs: 6, md: 3 }}>
                              <Card
                                sx={{
                                  textAlign: "center",
                                  p: 2,
                                  borderRadius: 2,
                                }}
                                elevation={9}
                              >
                                <CheckCircle
                                  sx={{ color: "info.main", mb: 1 }}
                                />
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  إجمالي المدفوع
                                </Typography>
                                <Typography variant="h6" color="info.main">
                                  <FormatedNumber money>
                                    {totalPaid}
                                  </FormatedNumber>
                                </Typography>
                              </Card>
                            </Grid2>

                            <Grid2 size={{ xs: 6, md: 3 }}>
                              <Card
                                sx={{
                                  textAlign: "center",
                                  p: 2,
                                  borderRadius: 2,
                                }}
                                elevation={9}
                              >
                                <Warning
                                  sx={{
                                    color:
                                      totalRemaining > 0
                                        ? "warning.main"
                                        : "success.main",
                                    mb: 1,
                                  }}
                                />
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  المتبقي
                                </Typography>
                                <Typography
                                  variant="h6"
                                  color={
                                    totalRemaining > 0
                                      ? "warning.main"
                                      : "success.main"
                                  }
                                >
                                  <FormatedNumber money>
                                    {Math.max(0, totalRemaining)}
                                  </FormatedNumber>
                                </Typography>
                              </Card>
                            </Grid2>
                          </Grid2>
                          {/* Progress Bar */}
                          <Box sx={{ mb: 3 }}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                              sx={{ mb: 1 }}
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                تقدم السداد
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {progress.toFixed(1)}%
                              </Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(progress, 100)}
                              sx={{
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: "grey.200",
                                "& .MuiLinearProgress-bar": {
                                  backgroundColor:
                                    progress >= 100
                                      ? "success.main"
                                      : progress >= 75
                                        ? "info.main"
                                        : progress >= 50
                                          ? "warning.main"
                                          : "error.main",
                                },
                              }}
                            />
                          </Box>
                          {/* Payment History */}
                          {installment.flow.length > 0 && (
                            <Box>
                              <Typography
                                variant="subtitle2"
                                sx={{ mb: 2, fontWeight: 600 }}
                              >
                                سجل المدفوعات ({installment.flow.length})
                              </Typography>
                              <TableContainer
                                component={Paper}
                                variant="outlined"
                                sx={{ maxHeight: 200 }}
                              >
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell sx={{ fontWeight: 600 }}>
                                        المبلغ
                                      </TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>
                                        التاريخ
                                      </TableCell>
                                      <TableCell
                                        sx={{ fontWeight: 600, width: 80 }}
                                      >
                                        إجراءات
                                      </TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {installment.flow.map((flow) => (
                                      <TableRow key={flow.id} hover>
                                        <TableCell>
                                          <FormatedNumber money>
                                            {flow.amount}
                                          </FormatedNumber>
                                        </TableCell>
                                        <TableCell>
                                          {new Date(flow.time).toLocaleString(
                                            "ar-EG",
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() =>
                                              setDeleteDialog({
                                                open: true,
                                                flowId: flow.id,
                                                amount: flow.amount,
                                                installmentId: installment.id,
                                              })
                                            }
                                            sx={{
                                              opacity: 0.7,
                                              "&:hover": { opacity: 1 },
                                            }}
                                          >
                                            <Delete fontSize="small" />
                                          </IconButton>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableContainer>
                            </Box>
                          )}
                        </CardContent>

                        <CardActions sx={{ px: 3, pb: 2 }}>
                          <Button
                            variant="contained"
                            color={status === "overdue" ? "error" : "primary"}
                            startIcon={<Payment />}
                            onClick={() =>
                              setSelectedInstallment(installment.id)
                            }
                            disabled={installment.ended || totalRemaining <= 0}
                            sx={{ minWidth: 120 }}
                          >
                            {status === "overdue" ? "دفع متأخر" : "دفع قسط"}
                          </Button>

                          {status === "completed" && (
                            <Chip
                              icon={<CheckCircle />}
                              label="تم السداد بالكامل"
                              color="success"
                              variant="outlined"
                            />
                          )}
                        </CardActions>
                      </Card>
                    </Grid2>
                  );
                })
              )}
            </Grid2>
          </Card>
        </Grid2>
      </Grid2>
    </>
  );
};

export default Installments;

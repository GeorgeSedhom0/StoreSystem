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
} from "@mui/material";
import {
  Person,
  Schedule,
  Payment,
  CheckCircle,
  Warning,
  AttachMoney,
  Delete,
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

  const { storeId } = useContext(StoreContext);

  const { data, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ["installments"],
    queryFn: () => getInstallments(storeId),
    initialData: [],
    // filter nulls in the flow array
    select: (data: Installment[]) => {
      return data
        .map((installment) => ({
          ...installment,
          flow: installment.flow.filter((flow) => flow.id),
        }))
        .filter((installment) => {
          return showEnded ? true : !installment.ended;
        });
    },
  });

  // Helper functions for calculations
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

              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant={showEnded ? "contained" : "outlined"}
                  color="primary"
                  startIcon={showEnded ? <CheckCircle /> : <Schedule />}
                  onClick={() => setShowEnded((prev) => !prev)}
                >
                  {showEnded ? "إخفاء المكتملة" : "عرض المكتملة"}
                </Button>

                <Box sx={{ ml: "auto" }}>
                  <Typography variant="body2" color="text.secondary">
                    عدد الأقساط: {data.length}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Divider sx={{ mb: 3 }} />

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
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  رقم القسط: #{installment.id}
                                </Typography>
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

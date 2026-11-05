import {
  Button,
  Card,
  CardActions,
  CardContent,
  Grid2,
  Typography,
  Box,
  Stack,
  Avatar,
  Divider,
  Alert,
  Chip,
  Paper,
  InputAdornment,
} from "@mui/material";
import {
  ArrowBack,
  Payment,
  Person,
  AttachMoney,
  Warning,
  CheckCircle,
  Schedule,
} from "@mui/icons-material";
import { Installment } from "../Installments";
import { fmtMoney } from "../format";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useState, useEffect } from "react";
import { AlertMsg } from "../../Shared/AlertMessage";
import NumberField from "../../Shared/NumberField";
import useConfirm from "../../Shared/useConfirm";
import { apiError } from "../../utils/errors";
import { localTimestamp } from "../../utils/functions";

const round2 = (n: number) => Math.round(n * 100) / 100;

const payInstallment = async ({
  id,
  amount,
}: {
  id: number;
  amount: number;
}) => {
  return axios.post(
    "/installments/pay/" + id.toString(),
    {},
    {
      params: {
        amount,
        time: localTimestamp(),
      },
    },
  );
};

const PayInstallment = ({
  selectedInstallment,
  setSelectedInstallment,
  setMsg,
  refetchInstallments,
}: {
  selectedInstallment: Installment;
  setSelectedInstallment: Dispatch<SetStateAction<number | null>>;
  setMsg: Dispatch<SetStateAction<AlertMsg>>;
  refetchInstallments: () => void;
}) => {
  // The parent only renders this with an installment that exists (and goes
  // back to the list when it disappears), so every hook below always runs.
  const [confirm, confirmDialog] = useConfirm();

  // Calculations
  const totalBill = Math.abs(selectedInstallment.total);
  const installmentSize =
    (totalBill - selectedInstallment.paid) /
    selectedInstallment.installments_count;
  const totalPaid = selectedInstallment.flow.reduce(
    (acc, flow) => acc + flow.amount,
    0,
  );
  const totalPaidIncludingDeposit = selectedInstallment.paid + totalPaid;
  const remainingAmount = totalBill - totalPaidIncludingDeposit;
  const remainingInstallmentsCount = Math.max(
    0,
    selectedInstallment.installments_count -
      Math.ceil(totalPaid / installmentSize),
  );

  // Calculate next installment due date
  const fullyPaidIntervals = Math.floor(totalPaid / installmentSize);
  const nextInstallmentTime =
    new Date(selectedInstallment.time).getTime() +
    selectedInstallment.installment_interval *
      1000 *
      60 *
      60 *
      24 *
      (fullyPaidIntervals + 1);
  const nextDueDate = new Date(nextInstallmentTime);
  const isOverdue = new Date() > nextDueDate && remainingAmount > 0;

  // State for payment amount with validation
  const [amount, setAmount] = useState<number>(
    round2(Math.min(installmentSize, remainingAmount)),
  );
  const [amountError, setAmountError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Validate payment amount
  useEffect(() => {
    if (amount <= 0) {
      setAmountError("المبلغ يجب أن يكون أكبر من صفر");
    } else if (amount > remainingAmount + 0.01) {
      // Small tolerance for floating point
      setAmountError(
        `المبلغ لا يمكن أن يزيد عن المتبقي (${fmtMoney(remainingAmount)})`,
      );
    } else {
      setAmountError("");
    }
  }, [amount, remainingAmount]);

  const { mutateAsync: pay } = useMutation({
    mutationKey: ["pay"],
    mutationFn: payInstallment,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم دفع القسط بنجاح" });
      setSelectedInstallment(null);
      refetchInstallments();
    },
    onError: (error) => {
      console.error("Payment error:", error);
      setMsg({
        type: "error",
        text: apiError(error, "حدث خطأ أثناء الدفع. يرجى المحاولة مرة أخرى"),
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const handlePayment = async () => {
    if (amountError || amount <= 0 || amount > remainingAmount + 0.01) {
      return;
    }
    const ok = await confirm({
      title: "تأكيد دفع القسط",
      message: (
        <Typography>
          تسجيل دفعة بقيمة <b>{fmtMoney(amount)}</b> من{" "}
          {selectedInstallment.party_name || "عميل غير معروف"}؟
          <br />
          المتبقي بعد الدفع: {fmtMoney(Math.max(0, remainingAmount - amount))}
        </Typography>
      ),
      confirmText: "دفع",
    });
    if (!ok) return;

    setIsSubmitting(true);
    try {
      await pay({
        id: selectedInstallment.id,
        amount: amount,
      });
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const getInstallmentStatus = () => {
    if (remainingAmount <= 0) return "completed";
    if (isOverdue) return "overdue";
    return "active";
  };

  const status = getInstallmentStatus();

  return (
    <Grid2 size={12}>
      {confirmDialog}
      <Card elevation={3} sx={{ maxWidth: 800, mx: "auto" }}>
        <CardContent sx={{ p: { xs: 2, md: 4 } }}>
          {/* Header */}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
            <Avatar
              sx={{
                bgcolor: "primary.main",
                width: { xs: 44, md: 56 },
                height: { xs: 44, md: 56 },
              }}
            >
              <Payment sx={{ fontSize: 28 }} />
            </Avatar>
            <Box>
              <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>
                دفع قسط
              </Typography>
              <Typography variant="body2" color="text.secondary">
                إدارة دفعة قسط للعميل
              </Typography>
            </Box>
          </Stack>
          <Divider sx={{ mb: 3 }} /> {/* Customer and Status Info */}
          <Grid2 container spacing={{ xs: 2, md: 3 }} sx={{ mb: 3 }}>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Paper
                variant="outlined"
                sx={{ p: { xs: 2, md: 3 }, height: "100%" }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  sx={{ mb: 2 }}
                >
                  <Person color="primary" />
                  <Typography variant="h6">معلومات العميل</Typography>
                </Stack>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>الاسم:</strong>{" "}
                  {selectedInstallment.party_name || "عميل غير معروف"}
                </Typography>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  <strong>رقم القسط:</strong> #{selectedInstallment.id}
                </Typography>
                <Typography variant="body1" component="div">
                  <strong>الحالة:</strong>{" "}
                  {status === "completed" && (
                    <Chip
                      icon={<CheckCircle />}
                      label="مكتمل"
                      color="success"
                      size="small"
                    />
                  )}
                  {status === "overdue" && (
                    <Chip
                      icon={<Warning />}
                      label="متأخر"
                      color="error"
                      size="small"
                    />
                  )}
                  {status === "active" && (
                    <Chip
                      icon={<Schedule />}
                      label="نشط"
                      color="primary"
                      size="small"
                    />
                  )}
                </Typography>
              </Paper>
            </Grid2>

            <Grid2 size={{ xs: 12, md: 6 }}>
              <Paper
                variant="outlined"
                sx={{ p: { xs: 2, md: 3 }, height: "100%" }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  sx={{ mb: 2 }}
                >
                  <AttachMoney color="primary" />
                  <Typography variant="h6">الملخص المالي</Typography>
                </Stack>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      إجمالي الفاتورة:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {fmtMoney(totalBill)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      المقدم:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {fmtMoney(selectedInstallment.paid)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      إجمالي المدفوع:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {fmtMoney(totalPaidIncludingDeposit)}
                    </Typography>
                  </Stack>
                  <Divider />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body1" color="text.secondary">
                      المتبقي:
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        color:
                          remainingAmount > 0 ? "warning.main" : "success.main",
                      }}
                    >
                      {fmtMoney(Math.max(0, remainingAmount))}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid2>
          </Grid2>
          {/* Payment Form */}
          {!selectedInstallment.ended && remainingAmount > 0 && (
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
              <Typography
                variant="h6"
                sx={{ mb: 3, display: "flex", alignItems: "center", gap: 1 }}
              >
                <Payment />
                تفاصيل الدفع
              </Typography>{" "}
              <Grid2 container spacing={3}>
                <Grid2 size={{ xs: 12, md: 6 }}>
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>عدد الأقساط المتبقية:</strong>{" "}
                      {remainingInstallmentsCount}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>قيمة القسط المقترحة:</strong>{" "}
                      {fmtMoney(installmentSize)}
                    </Typography>
                    <Typography
                      variant="body2"
                      color={isOverdue ? "error.main" : "text.secondary"}
                      sx={{ fontWeight: isOverdue ? 600 : 400 }}
                    >
                      <strong>موعد القسط القادم:</strong>{" "}
                      {nextDueDate.toLocaleDateString("ar-EG")}
                      {isOverdue && " (متأخر)"}
                    </Typography>
                  </Stack>
                </Grid2>

                <Grid2 size={{ xs: 12, md: 6 }}>
                  <NumberField
                    label="مبلغ الدفع"
                    value={amount}
                    onValueChange={setAmount}
                    error={!!amountError}
                    helperText={amountError || "أدخل المبلغ المراد دفعه"}
                    fullWidth
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">ج.م</InputAdornment>
                        ),
                      },
                    }}
                    sx={{ mb: 2 }}
                  />

                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mb: 2, "& .MuiButton-root": { minHeight: 40 } }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        setAmount(
                          round2(Math.min(installmentSize, remainingAmount)),
                        )
                      }
                      disabled={remainingAmount <= 0}
                      fullWidth
                    >
                      قيمة القسط
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setAmount(round2(remainingAmount))}
                      disabled={remainingAmount <= 0}
                      fullWidth
                    >
                      المبلغ المتبقي كاملاً
                    </Button>
                  </Stack>

                  {isOverdue && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      هذا القسط متأخر عن موعده المحدد
                    </Alert>
                  )}
                </Grid2>
              </Grid2>
            </Paper>
          )}
          {/* Completed Status */}
          {(selectedInstallment.ended || remainingAmount <= 0) && (
            <Alert severity="success" sx={{ mb: 3 }}>
              <Typography variant="body1">
                تم سداد هذا القسط بالكامل. لا توجد مبالغ متبقية.
              </Typography>
            </Alert>
          )}
        </CardContent>{" "}
        <CardActions sx={{ px: { xs: 2, md: 4 }, pb: 3, pt: 0 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ width: "100%" }}
          >
            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={() => setSelectedInstallment(null)}
              sx={{ minWidth: 120, minHeight: 44 }}
              fullWidth
            >
              رجوع
            </Button>

            {!selectedInstallment.ended && remainingAmount > 0 && (
              <Button
                variant="contained"
                color={isOverdue ? "error" : "primary"}
                startIcon={<Payment />}
                onClick={handlePayment}
                disabled={!!amountError || amount <= 0 || isSubmitting}
                sx={{ minWidth: 120, minHeight: 44 }}
                fullWidth
              >
                {isSubmitting
                  ? "جاري الدفع..."
                  : isOverdue
                    ? "دفع متأخر"
                    : "دفع"}
              </Button>
            )}
          </Stack>
        </CardActions>
      </Card>
    </Grid2>
  );
};

export default PayInstallment;

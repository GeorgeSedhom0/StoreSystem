import {
  Button,
  Card,
  CardActions,
  CardContent,
  Grid2,
  TextField,
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
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useState, useEffect } from "react";
import { AlertMsg } from "../../Shared/AlertMessage";
import FormatedNumber from "../../Shared/FormatedNumber";

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
        time: new Date().toISOString(),
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
  if (!selectedInstallment) {
    setSelectedInstallment(null);
    return null;
  }

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
    Math.min(installmentSize, remainingAmount),
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
        `المبلغ لا يمكن أن يزيد عن المتبقي (${remainingAmount.toFixed(2)} جنيه)`,
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
        text: "حدث خطأ أثناء الدفع. يرجى المحاولة مرة أخرى",
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
      <Card elevation={3} sx={{ maxWidth: 800, mx: "auto" }}>
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
            <Avatar sx={{ bgcolor: "primary.main", width: 56, height: 56 }}>
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
          <Grid2 container spacing={3} sx={{ mb: 3 }}>
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 3, height: "100%" }}>
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
                <Typography variant="body1">
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
              <Paper variant="outlined" sx={{ p: 3, height: "100%" }}>
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
                      <FormatedNumber money>{totalBill}</FormatedNumber>
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      المقدم:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      <FormatedNumber money>
                        {selectedInstallment.paid}
                      </FormatedNumber>
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      إجمالي المدفوع:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      <FormatedNumber money>
                        {totalPaidIncludingDeposit}
                      </FormatedNumber>
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
                      <FormatedNumber money>
                        {Math.max(0, remainingAmount)}
                      </FormatedNumber>
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            </Grid2>
          </Grid2>
          {/* Payment Form */}
          {!selectedInstallment.ended && remainingAmount > 0 && (
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
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
                      <FormatedNumber money>{installmentSize}</FormatedNumber>
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
                  <TextField
                    label="مبلغ الدفع"
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      setAmount(value);
                    }}
                    error={!!amountError}
                    helperText={amountError || "أدخل المبلغ المراد دفعه"}
                    fullWidth
                    inputProps={{
                      inputMode: "decimal",
                      min: 0,
                      max: remainingAmount,
                      step: 0.01,
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">ج.م</InputAdornment>
                      ),
                    }}
                    sx={{ mb: 2 }}
                  />

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ mb: 2 }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        setAmount(Math.min(installmentSize, remainingAmount))
                      }
                      disabled={remainingAmount <= 0}
                      fullWidth
                    >
                      قيمة القسط
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setAmount(remainingAmount)}
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
        <CardActions sx={{ px: 4, pb: 3, pt: 0 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ width: "100%" }}
          >
            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={() => setSelectedInstallment(null)}
              sx={{ minWidth: 120 }}
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
                sx={{ minWidth: 120 }}
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

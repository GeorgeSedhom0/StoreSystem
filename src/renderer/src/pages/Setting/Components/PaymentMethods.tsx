import {
  Box,
  Chip,
  Divider,
  Grid2,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import {
  Payments as PaymentsIcon,
  Add as AddIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import usePaymentMethods from "../../Shared/hooks/usePaymentMethods";

const PaymentMethods = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [newName, setNewName] = useState("");
  // Local edit buffer for renaming, keyed by method id
  const [editNames, setEditNames] = useState<Record<number, string>>({});

  const {
    paymentMethods,
    isPaymentMethodsLoading,
    addPaymentMethodMutation,
    addPaymentMethodLoading,
    updatePaymentMethodMutation,
    updatePaymentMethodLoading,
    deletePaymentMethodMutation,
    deletePaymentMethodLoading,
  } = usePaymentMethods(setMsg);

  // Keep the edit buffer in sync with the fetched list
  useEffect(() => {
    setEditNames((prev) => {
      const next: Record<number, string> = {};
      for (const m of paymentMethods) {
        next[m.id] = prev[m.id] !== undefined ? prev[m.id] : m.name;
      }
      return next;
    });
  }, [paymentMethods]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) {
      setMsg({ type: "error", text: "الاسم مطلوب" });
      return;
    }
    addPaymentMethodMutation(name, {
      onSuccess: () => setNewName(""),
    });
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <PaymentsIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "primary.main" }}
          >
            إدارة طرق الدفع
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          يمكنك إضافة طرق دفع جديدة أو تعديل أسمائها أو حذفها. تُستخدم طرق الدفع
          عند البيع والمرتجع لتقسيم قيمة الفاتورة بين أكثر من طريقة.
        </Typography>
      </Paper>

      {/* Add new method */}
      <Paper
        elevation={1}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          إضافة طريقة دفع جديدة
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <TextField
            fullWidth
            size="small"
            label="اسم طريقة الدفع"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <LoadingButton
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            loading={addPaymentMethodLoading}
            sx={{ whiteSpace: "nowrap", px: 3 }}
          >
            إضافة
          </LoadingButton>
        </Box>
      </Paper>

      {/* Existing methods */}
      <Paper
        elevation={1}
        sx={{
          p: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          طرق الدفع الحالية
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {paymentMethods.length === 0 && !isPaymentMethodsLoading && (
          <Typography color="text.secondary">لا توجد طرق دفع بعد</Typography>
        )}

        <Grid2 container spacing={2}>
          {paymentMethods.map((method) => {
            const buffer = editNames[method.id] ?? method.name;
            const changed = buffer.trim() !== method.name && buffer.trim() !== "";
            return (
              <Grid2 size={12} key={method.id}>
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    alignItems: "center",
                    p: 1.5,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <TextField
                    size="small"
                    value={buffer}
                    onChange={(e) =>
                      setEditNames((prev) => ({
                        ...prev,
                        [method.id]: e.target.value,
                      }))
                    }
                    sx={{ flex: 1 }}
                  />
                  {method.is_default && (
                    <Chip label="افتراضي" size="small" color="primary" />
                  )}
                  <Tooltip title="حفظ الاسم">
                    <span>
                      <IconButton
                        color="primary"
                        disabled={!changed || updatePaymentMethodLoading}
                        onClick={() =>
                          updatePaymentMethodMutation({
                            id: method.id,
                            name: buffer.trim(),
                          })
                        }
                      >
                        <SaveIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="حذف">
                    <span>
                      <IconButton
                        color="error"
                        disabled={
                          deletePaymentMethodLoading ||
                          paymentMethods.length <= 1
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              `هل أنت متأكد من حذف طريقة الدفع "${method.name}"؟`,
                            )
                          ) {
                            deletePaymentMethodMutation(method.id);
                          }
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Grid2>
            );
          })}
        </Grid2>
      </Paper>
    </Box>
  );
};

export default PaymentMethods;

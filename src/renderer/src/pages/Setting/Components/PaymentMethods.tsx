import {
  Box,
  Chip,
  Divider,
  FormControl,
  Grid2,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import {
  Payments as PaymentsIcon,
  Add as AddIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import usePaymentMethods from "../../Shared/hooks/usePaymentMethods";

interface StoreInfo {
  id: number;
  name: string;
}

const getStores = async () => {
  const { data } = await axios.get<StoreInfo[]>("/admin/stores-data");
  return data;
};

const PaymentMethods = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [newName, setNewName] = useState("");
  // Local edit buffers, keyed by method id
  const [editNames, setEditNames] = useState<Record<number, string>>({});
  const [editHome, setEditHome] = useState<Record<number, number | "">>({});

  const {
    paymentMethods,
    isPaymentMethodsLoading,
    addPaymentMethodMutation,
    addPaymentMethodLoading,
    updatePaymentMethodMutation,
    updatePaymentMethodLoading,
  } = usePaymentMethods(setMsg);

  const { data: stores = [] } = useQuery({
    queryKey: ["stores-data"],
    queryFn: getStores,
    initialData: [],
  });

  const storeName = (id: number) =>
    stores.find((s) => s.id === id)?.name || `متجر ${id}`;

  // Keep the edit buffers in sync with the fetched list
  useEffect(() => {
    setEditNames((prev) => {
      const next: Record<number, string> = {};
      for (const m of paymentMethods) {
        next[m.id] = prev[m.id] !== undefined ? prev[m.id] : m.name;
      }
      return next;
    });
    setEditHome((prev) => {
      const next: Record<number, number | ""> = {};
      for (const m of paymentMethods) {
        next[m.id] =
          prev[m.id] !== undefined ? prev[m.id] : (m.home_store_id ?? "");
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
          يمكنك إضافة طرق دفع جديدة أو تعديل أسمائها. يمكنك أيضًا تحديد المتجر
          الذي يملك حساب طريقة الدفع فعليًا (مثل محفظة إلكترونية لمتجر معيّن) — عند
          استخدامها من متجر آخر يتم تحويل المبلغ تلقائيًا إلى المتجر المالك.
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
            const homeBuffer = editHome[method.id] ?? "";
            const currentHome = method.home_store_id ?? "";
            const nameChanged =
              buffer.trim() !== method.name && buffer.trim() !== "";
            const homeChanged = homeBuffer !== currentHome;
            const changed = (nameChanged || homeChanged) && buffer.trim() !== "";
            return (
              <Grid2 size={12} key={method.id}>
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    alignItems: "center",
                    flexWrap: "wrap",
                    p: 1.5,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <TextField
                    size="small"
                    label="الاسم"
                    value={buffer}
                    onChange={(e) =>
                      setEditNames((prev) => ({
                        ...prev,
                        [method.id]: e.target.value,
                      }))
                    }
                    sx={{ flex: 1, minWidth: 160 }}
                  />
                  {method.is_default ? (
                    <Chip label="نقدي / افتراضي" size="small" color="primary" />
                  ) : (
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                      <InputLabel>المتجر المالك للحساب</InputLabel>
                      <Select
                        label="المتجر المالك للحساب"
                        value={homeBuffer}
                        onChange={(e) =>
                          setEditHome((prev) => ({
                            ...prev,
                            [method.id]:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          }))
                        }
                      >
                        <MenuItem value="">
                          <em>مستقل لكل متجر</em>
                        </MenuItem>
                        {stores.map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {s.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <Tooltip title="حفظ">
                    <span>
                      <IconButton
                        color="primary"
                        disabled={!changed || updatePaymentMethodLoading}
                        onClick={() =>
                          updatePaymentMethodMutation({
                            id: method.id,
                            name: buffer.trim(),
                            homeStoreId: homeBuffer === "" ? null : homeBuffer,
                          })
                        }
                      >
                        <SaveIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
                {!method.is_default && method.home_store_id != null && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    الحساب يخص: {storeName(method.home_store_id)}
                  </Typography>
                )}
              </Grid2>
            );
          })}
        </Grid2>
      </Paper>
    </Box>
  );
};

export default PaymentMethods;

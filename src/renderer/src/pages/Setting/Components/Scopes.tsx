import {
  FormControl,
  FormControlLabel,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
  Paper,
  Box,
  Chip,
  Divider,
} from "@mui/material";
import { PAGE_LABELS } from "@renderer/pageLabels";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import useConfirm from "../../Shared/useConfirm";
import { apiError } from "../../utils/errors";
import { Scope } from "../../utils/types";
import { LoadingButton } from "@mui/lab";
import {
  Security as SecurityIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Web as PageIcon,
} from "@mui/icons-material";

const getScopes = async () => {
  const { data } = await axios.get<Scope[]>("/scopes");
  return data;
};

const getPages = async () => {
  const { data } =
    await axios.get<{ name: string; path: string; id: number }[]>("/pages");
  return data;
};

const updateScope = async ({
  name,
  pages,
  id,
  newScope,
}: {
  name: string;
  pages: string[];
  id?: number;
  newScope?: boolean;
}) => {
  if (newScope) {
    await axios.post("/scope", pages, {
      params: { name },
    });
  } else {
    await axios.put("/scope", pages, {
      params: { name, id },
    });
  }
};

const getUsers = async () => {
  const { data } =
    await axios.get<{ id: number; username: string; scope_id: number }[]>(
      "/users",
    );
  return data;
};

/** Server errors here are raw DB messages; translate the common ones. */
const scopeError = (e: unknown, fallback: string) => {
  const raw = String((e as any)?.response?.data?.detail ?? "");
  if (raw.includes("scopes_name_key")) return "يوجد صلاحية بنفس الاسم بالفعل";
  if (raw.includes("foreign key") || raw.includes("violates"))
    return "لا يمكن حذف صلاحية مستخدمة من قبل مستخدمين. غيّر صلاحية هؤلاء المستخدمين أولاً";
  return apiError(e, fallback);
};

const deleteScope = async (id: number) => {
  await axios.delete("/scope", {
    params: { id },
  });
};

const Scopes = () => {
  const [selectedScope, setSelectedScope] = useState<Scope>({
    id: -1,
    name: "",
    pages: [],
  });
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [confirm, confirmDialog] = useConfirm();

  const {
    data: scopes,
    isLoading: isScopesLoading,
    refetch: refetchScopes,
  } = useQuery({
    queryKey: ["scopes"],
    queryFn: getScopes,
    initialData: [],
  });

  const { data: pages } = useQuery({
    queryKey: ["pages"],
    queryFn: getPages,
    initialData: [],
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    initialData: [],
  });

  const { mutate: addScope, isPending: isAddingScope } = useMutation({
    mutationFn: updateScope,
    onSuccess: (_data, vars) => {
      setMsg({
        type: "success",
        text: vars.newScope
          ? "تمت إضافة الصلاحية بنجاح"
          : "تم حفظ تعديلات الصلاحية بنجاح",
      });
      refetchScopes();
      setSelectedScope({ id: -1, name: "", pages: [] });
    },
    onError: (e) => {
      setMsg({ type: "error", text: scopeError(e, "تعذر حفظ الصلاحية") });
    },
  });

  const { mutate: removeScope, isPending: isRemovingScope } = useMutation({
    mutationFn: deleteScope,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم حذف الصلاحية بنجاح" });
      refetchScopes();
      setSelectedScope({ id: -1, name: "", pages: [] });
    },
    onError: (e) => {
      setMsg({ type: "error", text: scopeError(e, "تعذر حذف الصلاحية") });
    },
  });

  const handleDelete = async () => {
    const usersWithScope = users.filter((u) => u.scope_id === selectedScope.id);
    const ok = await confirm({
      title: `حذف الصلاحية «${selectedScope.name}»؟`,
      message:
        usersWithScope.length > 0
          ? `هذه الصلاحية مستخدمة من ${usersWithScope.length} مستخدم (${usersWithScope
              .map((u) => u.username)
              .join("، ")}). غيّر صلاحيتهم أولاً، وإلا سيفشل الحذف.`
          : "لن يمكن التراجع عن الحذف.",
      confirmText: "حذف",
      danger: true,
    });
    if (ok) removeScope(selectedScope.id);
  };

  const handleSave = () => {
    const name = selectedScope.name.trim();
    if (!name) {
      setMsg({ type: "error", text: "اكتب اسم الصلاحية" });
      return;
    }
    if (selectedScope.pages.length === 0) {
      setMsg({ type: "error", text: "اختر صفحة واحدة على الأقل" });
      return;
    }
    addScope({
      name,
      pages: selectedScope.pages.map((page) => page.toString()),
      id: selectedScope.id !== -1 ? selectedScope.id : undefined,
      newScope: selectedScope.id === -1,
    });
  };
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      {confirmDialog}

      {/* Header */}
      <Paper
        elevation={2}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.05) 100%)",
          border: "1px solid",
          borderColor: "primary.light",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <SecurityIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: "primary.main",
              fontSize: { xs: "1.4rem", sm: "2.125rem" },
            }}
          >
            إدارة الصلاحيات
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          يمكن اختيار أي صلاحية لتعديلها أو حذفها أما لإضافة صلاحية جديدة يمكنك
          اختيار "إضافة صلاحية جديدة"
        </Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "warning.main",
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            ⚠️ يرجى العلم أنه إن تم حذف الصلاحيات التي يملكها أحد المستخدمين فلن
            يتمكن من الوصول إلى الصفحات المعنية بعد ذلك
          </Typography>
        </Box>
      </Paper>

      <Grid2 container spacing={3}>
        {/* Scope Selection Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: { xs: 2, sm: 3 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              اختيار الصلاحية
            </Typography>
            <FormControl fullWidth>
              <InputLabel>الصلاحية</InputLabel>
              <Select
                value={selectedScope?.id ?? -1}
                label="الصلاحية"
                onChange={(e) => {
                  if (!e.target.value) return;
                  if (e.target.value === -1) {
                    setSelectedScope({ id: -1, name: "", pages: [] });
                    return;
                  }
                  setSelectedScope(
                    scopes.find((scope) => scope.id === e.target.value)!,
                  );
                }}
                disabled={isScopesLoading}
              >
                {scopes.map((scope) => (
                  <MenuItem key={scope.id} value={scope.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <SecurityIcon sx={{ fontSize: "1.2rem" }} />
                      {scope.name}
                      <Chip
                        label={scope.pages.length}
                        size="small"
                        color="primary"
                        sx={{ ml: "auto" }}
                      />
                    </Box>
                  </MenuItem>
                ))}
                <MenuItem value={-1}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <AddIcon
                      sx={{ fontSize: "1.2rem", color: "success.main" }}
                    />
                    <Typography color="success.main">
                      إضافة صلاحية جديدة
                    </Typography>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Paper>
        </Grid2>

        {/* Scope Configuration Section */}
        {selectedScope && (
          <Grid2 size={12}>
            <Paper
              elevation={1}
              sx={{
                p: { xs: 2, sm: 3 },
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                {selectedScope.id === -1
                  ? "إضافة صلاحية جديدة"
                  : "تعديل الصلاحية"}
              </Typography>
              {selectedScope.id !== -1 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: -2, mb: 2 }}
                >
                  مستخدمة من{" "}
                  {users.filter((u) => u.scope_id === selectedScope.id).length}{" "}
                  مستخدم
                </Typography>
              )}

              <Box sx={{ mb: 3 }}>
                <TextField
                  fullWidth
                  label="اسم الصلاحية"
                  value={selectedScope.name}
                  onChange={(e) =>
                    setSelectedScope({ ...selectedScope, name: e.target.value })
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <SecurityIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                    },
                  }}
                />
              </Box>

              <Divider sx={{ my: 3 }} />

              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <PageIcon sx={{ color: "primary.main" }} />
                الصفحات المتاحة ({selectedScope.pages.length}/{pages.length})
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(auto-fill, minmax(250px, 1fr))",
                  },
                  gap: 2,
                  mb: 3,
                }}
              >
                {pages &&
                  pages.map((page) => (
                    <Box
                      key={page.id}
                      sx={{
                        p: 2,
                        border: "1px solid",
                        borderColor: selectedScope.pages.includes(page.id)
                          ? "primary.main"
                          : "divider",
                        borderRadius: 2,
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Switch
                            checked={selectedScope.pages.includes(page.id)}
                            onChange={(e) => {
                              if (!selectedScope) return;
                              if (e.target.checked) {
                                setSelectedScope({
                                  ...selectedScope,
                                  pages: [...selectedScope.pages, page.id],
                                });
                              } else {
                                setSelectedScope({
                                  ...selectedScope,
                                  pages: selectedScope.pages.filter(
                                    (selectedPage) => selectedPage !== page.id,
                                  ),
                                });
                              }
                            }}
                            color="primary"
                          />
                        }
                        label={
                          <Box>
                            <Typography
                              variant="subtitle2"
                              sx={{ fontWeight: 600 }}
                            >
                              {PAGE_LABELS[page.path] ?? page.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {page.path}
                            </Typography>
                          </Box>
                        }
                        sx={{ width: "100%", margin: 0 }}
                      />
                    </Box>
                  ))}
              </Box>

              <Divider sx={{ my: 3 }} />

              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  justifyContent: "flex-end",
                  flexDirection: { xs: "column-reverse", sm: "row" },
                }}
              >
                <LoadingButton
                  variant="contained"
                  startIcon={
                    selectedScope.id === -1 ? <AddIcon /> : <EditIcon />
                  }
                  onClick={handleSave}
                  loading={isAddingScope || isScopesLoading}
                  size="large"
                  sx={{
                    borderRadius: 2,
                    fontWeight: 600,
                    px: 3,
                  }}
                >
                  {selectedScope.id === -1
                    ? "إضافة الصلاحية"
                    : "تحديث الصلاحية"}
                </LoadingButton>

                {selectedScope.id !== -1 && (
                  <LoadingButton
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDelete}
                    loading={isRemovingScope || isScopesLoading}
                    size="large"
                    sx={{
                      borderRadius: 2,
                      fontWeight: 600,
                      px: 3,
                    }}
                  >
                    حذف الصلاحية
                  </LoadingButton>
                )}
              </Box>
            </Paper>
          </Grid2>
        )}
      </Grid2>
    </Box>
  );
};

export default Scopes;

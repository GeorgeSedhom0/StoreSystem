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
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
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

  const { mutate: addScope, isPending: isAddingScope } = useMutation({
    mutationFn: updateScope,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم اضافة الصلاحية بنجاح" });
      refetchScopes();
      setSelectedScope({ id: -1, name: "", pages: [] });
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ ما" });
    },
  });

  const { mutate: removeScope, isPending: isRemovingScope } = useMutation({
    mutationFn: deleteScope,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم حذف الصلاحية بنجاح" });
      refetchScopes();
      setSelectedScope({ id: -1, name: "", pages: [] });
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ ما" });
    },
  });
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
          <SecurityIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "primary.main" }}
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
              p: 3,
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
                value={selectedScope?.id || null}
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
                p: 3,
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
                الصفحات المتاحة
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
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
                              {page.name}
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

              <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                <LoadingButton
                  variant="contained"
                  startIcon={
                    selectedScope.id === -1 ? <AddIcon /> : <EditIcon />
                  }
                  onClick={() => {
                    addScope({
                      name: selectedScope.name,
                      pages: selectedScope.pages.map((page) => page.toString()),
                      id:
                        selectedScope.id !== -1 ? selectedScope.id : undefined,
                      newScope: selectedScope.id === -1,
                    });
                  }}
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
                    onClick={() => removeScope(selectedScope.id)}
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

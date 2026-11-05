import {
  FormControl,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Box,
  Divider,
  Avatar,
  Chip,
} from "@mui/material";
import { useEffect, useState } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { apiError } from "../../utils/errors";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoadingButton } from "@mui/lab";
import { Scope } from "../../utils/types";
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Security as SecurityIcon,
  Save as SaveIcon,
} from "@mui/icons-material";

interface DBUser {
  id: number;
  username: string;
  email: string;
  phone: string;
  scope_id: number;
}

const editUser = async ({
  id,
  username,
  password,
  email,
  phone,
  scope,
}: {
  id: number;
  username: string;
  password: string;
  email: string;
  phone: string;
  scope: number;
}) => {
  const formdata = new FormData();
  formdata.append("id", id.toString());
  formdata.append("username", username.trim());
  // Empty = keep the current password.
  if (password) formdata.append("password", password);
  formdata.append("email", email);
  formdata.append("phone", phone);
  formdata.append("scope_id", scope.toString());

  await axios.put("/user", formdata);
};

const getScopes = async () => {
  const { data } = await axios.get<Scope[]>("/scopes");
  return data;
};

const getUsers = async () => {
  const { data } = await axios.get<DBUser[]>("/users");
  return data;
};

const UpdateUser = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [scope, setScope] = useState<number | null>(1);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [selectedUser, setSelectedUser] = useState<DBUser | null>(null);

  const { mutate: updateUser, isPending: isUpdatingUser } = useMutation({
    mutationFn: editUser,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم حفظ بيانات المستخدم بنجاح" });
      setPassword("");
      refetch();
    },
    onError: (error) => {
      setMsg({
        type: "error",
        text: apiError(error, "تعذر حفظ بيانات المستخدم"),
      });
    },
  });

  const { data: scopes, isLoading: isScopesLoading } = useQuery({
    queryKey: ["scopes"],
    queryFn: getScopes,
    initialData: [],
  });

  const {
    data: users,
    isLoading: isUsersLoading,
    refetch,
  } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    initialData: [],
  });

  // After a save, re-point the selection at the fresh row (same id), so the
  // form shows the saved values (e.g. a new username).
  useEffect(() => {
    if (!selectedUser) return;
    const fresh = users.find((u) => u.id === selectedUser.id);
    if (
      fresh &&
      fresh !== selectedUser &&
      fresh.username !== selectedUser.username
    ) {
      setSelectedUser(fresh);
    }
  }, [users, selectedUser]);

  useEffect(() => {
    if (selectedUser) {
      setUsername(selectedUser.username);
      setEmail(selectedUser.email || "");
      setPhone(selectedUser.phone || "");
      setScope(selectedUser.scope_id);
      setPassword("");
    }
  }, [selectedUser]);
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

      <Grid2 container spacing={3}>
        {/* User Selection Section */}
        <Grid2 size={12}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              اختر مستخدمًا لتعديل بياناته
            </Typography>
            <FormControl fullWidth>
              <InputLabel>المستخدم</InputLabel>
              <Select
                label="المستخدم"
                value={selectedUser?.id.toString() || ""}
                onChange={(e) =>
                  setSelectedUser(
                    users.find((u) => u.id.toString() === e.target.value) ||
                      null,
                  )
                }
                disabled={isUsersLoading}
              >
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id.toString()}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Avatar
                        sx={{ width: 32, height: 32, fontSize: "0.9rem" }}
                      >
                        {user.username.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2">
                          {user.username}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {user.email}
                        </Typography>
                      </Box>
                      <Chip
                        label={
                          scopes.find((s) => s.id === user.scope_id)?.name ||
                          "غير محدد"
                        }
                        size="small"
                        color="primary"
                        sx={{ ml: "auto" }}
                      />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Grid2>

        {/* Edit Form Section */}
        {selectedUser && (
          <Grid2 size={12}>
            <Box>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                بيانات {selectedUser.username}
              </Typography>

              <Grid2 container spacing={3}>
                <Grid2 size={12}>
                  <TextField
                    fullWidth
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    label="اسم المستخدم"
                    autoComplete="off"
                    helperText={
                      selectedUser && username.trim() !== selectedUser.username
                        ? "سيتم تغيير اسم الدخول؛ يدخل المستخدم بالاسم الجديد من الآن"
                        : undefined
                    }
                    slotProps={{
                      input: {
                        startAdornment: (
                          <PersonIcon sx={{ mr: 1, color: "text.secondary" }} />
                        ),
                      },
                    }}
                  />
                </Grid2>

                <Grid2 size={12}>
                  <TextField
                    fullWidth
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    label="كلمة مرور جديدة (اختياري)"
                    type="password"
                    autoComplete="new-password"
                    helperText="اتركها فارغة للإبقاء على كلمة المرور الحالية"
                    slotProps={{
                      input: {
                        startAdornment: (
                          <LockIcon sx={{ mr: 1, color: "text.secondary" }} />
                        ),
                      },
                    }}
                  />
                </Grid2>

                <Grid2 size={12}>
                  <TextField
                    fullWidth
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    label="البريد الإلكتروني"
                    type="email"
                    slotProps={{
                      htmlInput: { dir: "ltr", inputMode: "email" },
                      input: {
                        startAdornment: (
                          <EmailIcon sx={{ mr: 1, color: "text.secondary" }} />
                        ),
                      },
                    }}
                  />
                </Grid2>

                <Grid2 size={12}>
                  <TextField
                    fullWidth
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    label="رقم الهاتف"
                    slotProps={{
                      htmlInput: { dir: "ltr", inputMode: "tel" },
                      input: {
                        startAdornment: (
                          <PhoneIcon sx={{ mr: 1, color: "text.secondary" }} />
                        ),
                      },
                    }}
                  />
                </Grid2>

                <Grid2 size={12}>
                  <FormControl fullWidth>
                    <InputLabel>الصلاحيات</InputLabel>
                    <Select
                      label="الصلاحيات"
                      value={scope ?? ""}
                      onChange={(e) => setScope(e.target.value as number)}
                      disabled={isScopesLoading}
                      startAdornment={
                        <SecurityIcon sx={{ mr: 1, color: "text.secondary" }} />
                      }
                    >
                      {scopes.map((scope) => (
                        <MenuItem key={scope.id} value={scope.id}>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
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
                    </Select>
                  </FormControl>
                </Grid2>

                <Grid2 size={12}>
                  <Divider sx={{ my: 2 }} />
                  <LoadingButton
                    fullWidth
                    variant="contained"
                    size="large"
                    startIcon={<SaveIcon />}
                    onClick={() =>
                      updateUser({
                        id: selectedUser!.id,
                        username,
                        password,
                        email,
                        phone,
                        scope: scope!,
                      })
                    }
                    loading={isScopesLoading || isUpdatingUser}
                    disabled={!selectedUser || !username.trim() || !scope}
                    sx={{
                      py: 1.5,
                      borderRadius: 2,
                      fontWeight: 600,
                    }}
                  >
                    حفظ التعديلات
                  </LoadingButton>
                </Grid2>
              </Grid2>
            </Box>
          </Grid2>
        )}
      </Grid2>
    </Box>
  );
};

export default UpdateUser;

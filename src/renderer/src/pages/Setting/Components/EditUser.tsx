import {
  FormControl,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Paper,
  Box,
  Divider,
  Avatar,
  Chip,
} from "@mui/material";
import { useEffect, useState } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoadingButton } from "@mui/lab";
import { Scope } from "../../utils/types";
import {
  Edit as EditIcon,
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
  username,
  password,
  email,
  phone,
  scope,
}: {
  username: string;
  password: string;
  email: string;
  phone: string;
  scope: number;
}) => {
  const formdata = new FormData();
  formdata.append("username", username);
  formdata.append("password", password);
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
      setMsg({ type: "success", text: "تم تسجيل المستخدم بنجاح" });
      setUsername("");
      setPassword("");
      setEmail("");
      setPhone("");
      setScope(null);
      refetch();
    },
    onError: (error) => {
      setMsg({ type: "error", text: "حدث خطأ ما" });
      console.error(error);
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

  useEffect(() => {
    if (selectedUser) {
      setUsername(selectedUser.username);
      setEmail(selectedUser.email);
      setPhone(selectedUser.phone);
      setScope(selectedUser.scope_id);
    }
  }, [selectedUser]);
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
          <EditIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "primary.main" }}
          >
            تعديل بيانات المستخدم
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          {selectedUser
            ? `تعديل بيانات المستخدم: ${selectedUser.username}`
            : "اختر مستخدم لتعديل بياناته"}
        </Typography>
      </Paper>

      <Grid2 container spacing={3}>
        {/* User Selection Section */}
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
              اختيار المستخدم
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
          </Paper>
        </Grid2>

        {/* Edit Form Section */}
        {selectedUser && (
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
                تعديل البيانات
              </Typography>

              <Grid2 container spacing={3}>
                <Grid2 size={12}>
                  <TextField
                    fullWidth
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    label="اسم المستخدم"
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
                    label="كلمة المرور"
                    type="password"
                    placeholder="اتركه فارغاً إذا كنت لا تريد تغيير كلمة المرور"
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
                      value={scope}
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
                        username,
                        password,
                        email,
                        phone,
                        scope: scope!,
                      })
                    }
                    loading={isScopesLoading || isUpdatingUser}
                    disabled={!username || !email || !phone || !scope}
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
            </Paper>
          </Grid2>
        )}
      </Grid2>
    </Box>
  );
};

export default UpdateUser;

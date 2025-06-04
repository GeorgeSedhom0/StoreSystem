import {
  FormControl,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoadingButton } from "@mui/lab";
import { Scope } from "../../utils/types";
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Security as SecurityIcon,
} from "@mui/icons-material";

const signup = async ({
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

  await axios.post("/signup", formdata);
};

const getScopes = async () => {
  const { data } = await axios.get<Scope[]>("/scopes");
  return data;
};

const SignUp = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [scope, setScope] = useState<number | null>(1);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const { mutate: addUser, isPending: isAddingUser } = useMutation({
    mutationFn: signup,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم تسجيل المستخدم بنجاح" });
      setUsername("");
      setPassword("");
      setEmail("");
      setPhone("");
      setScope(null);
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
  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            قم بإدخال بيانات المستخدم الجديد
          </Typography>
        </Grid2>

        <Grid2 size={12}>
          <TextField
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            label="اسم المستخدم"
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <PersonIcon sx={{ mr: 1, color: "text.secondary" }} />
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
        </Grid2>

        <Grid2 size={12}>
          <TextField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            label="كلمة المرور"
            type="password"
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <LockIcon sx={{ mr: 1, color: "text.secondary" }} />
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
        </Grid2>

        <Grid2 size={12}>
          <TextField
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            label="البريد الإلكتروني"
            type="email"
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <EmailIcon sx={{ mr: 1, color: "text.secondary" }} />
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
        </Grid2>

        <Grid2 size={12}>
          <TextField
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            label="رقم الهاتف"
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <PhoneIcon sx={{ mr: 1, color: "text.secondary" }} />
                ),
              },
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
        </Grid2>

        <Grid2 size={12}>
          <FormControl fullWidth>
            <InputLabel>الصلاحيات</InputLabel>
            <Select
              fullWidth
              label="الصلاحيات"
              value={scope}
              onChange={(e) => setScope(e.target.value as number)}
              disabled={isScopesLoading}
              startAdornment={
                <SecurityIcon sx={{ mr: 1, color: "text.secondary" }} />
              }
              sx={{
                borderRadius: 2,
              }}
            >
              {scopes.map((scope) => (
                <MenuItem key={scope.id} value={scope.id}>
                  {scope.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid2>

        <Grid2 size={12}>
          <LoadingButton
            variant="contained"
            onClick={() =>
              addUser({
                username,
                password,
                email,
                phone,
                scope: scope!,
              })
            }
            loading={isScopesLoading || isAddingUser}
            disabled={!username || !password || !email || !phone || !scope}
            fullWidth
            size="large"
            sx={{
              borderRadius: 2,
              py: 1.5,
              textTransform: "none",
              fontWeight: 600,
              fontSize: "1.1rem",
            }}
          >
            إضافة المستخدم
          </LoadingButton>
        </Grid2>
      </Grid2>
    </>
  );
};

export default SignUp;

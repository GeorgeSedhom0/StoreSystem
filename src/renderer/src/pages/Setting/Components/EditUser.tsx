import {
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoadingButton } from "@mui/lab";
import { Scope } from "../../../utils/types";

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

  await axios.put(import.meta.env.VITE_SERVER_URL + "/user", formdata);
};

const getScopes = async () => {
  const { data } = await axios.get<Scope[]>(
    import.meta.env.VITE_SERVER_URL + "/scopes",
  );
  return data;
};

const getUsers = async () => {
  const { data } = await axios.get<DBUser[]>(
    import.meta.env.VITE_SERVER_URL + "/users",
  );
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
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Typography variant="h6">
            تعديل بيانات المستخدم {selectedUser?.username}
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth>
            <InputLabel>المستخدم</InputLabel>
            <Select
              fullWidth
              label="المستخدم"
              value={selectedUser?.id.toString() || ""}
              onChange={(e) =>
                setSelectedUser(
                  users.find((u) => u.id.toString() === e.target.value) || null,
                )
              }
              disabled={isUsersLoading}
            >
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id.toString()}>
                  {user.username}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {selectedUser && (
          <>
            <Grid item container gap={3}>
              <TextField
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                label="اسم المستخدم"
                fullWidth
              />
              <TextField
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                label="كلمة المرور"
                fullWidth
              />
              <TextField
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                label="البريد الالكتروني"
                fullWidth
              />
              <TextField
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                label="رقم الهاتف"
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>الصلاحيات</InputLabel>
                <Select
                  fullWidth
                  label="الصلاحيات"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as number)}
                  disabled={isScopesLoading}
                >
                  {scopes.map((scope) => (
                    <MenuItem key={scope.id} value={scope.id}>
                      {scope.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <LoadingButton
                variant="contained"
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
                disabled={!username || !password || !email || !phone || !scope}
              >
                حفظ التعديلات
              </LoadingButton>
            </Grid>
          </>
        )}
      </Grid>
    </>
  );
};

export default UpdateUser;

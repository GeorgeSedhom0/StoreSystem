import { Button, Card, Grid2, TextField, Typography } from "@mui/material";
import { ViewContainer } from "../Shared/Utils";
import { useCallback, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const navigate = useNavigate();

  const login = useCallback(async () => {
    try {
      const formdata = new FormData();
      formdata.append("username", username);
      formdata.append("password", password);

      await axios.post("/login", formdata);
      navigate("/sell");
    } catch (e) {
      setMsg({ type: "error", text: "حدث خطأ ما" });
      console.error(e);
    }
  }, [username, password]);

  return (
    <ViewContainer>
      <Grid2
        container
        justifyContent="center"
        alignItems="center"
        sx={{
          width: "100%",
          height: "100vh",
        }}
      >
        <AlertMessage message={msg} setMessage={setMsg} />
        <Card elevation={3} sx={{ px: 3, py: 2 }}>
          <Grid2 container spacing={3}>
            <Grid2 size={12}>
              <Typography variant="h4" align="center">
                مرحبا مرة اخرى! يرجى تسجيل الدخول للمتابعة
              </Typography>
            </Grid2>
            <Grid2 container gap={3} size={12}>
              <TextField
                id="loginUserName"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                label="اسم المستخدم"
                fullWidth
              />
              <TextField
                id="loginPassword"
                value={password}
                type="password"
                onChange={(e) => setPassword(e.target.value)}
                label="كلمة المرور"
                fullWidth
              />
            </Grid2>
            <Grid2 size={12}>
              <Button onClick={login} variant="contained" id="loginBtn">
                تسجيل الدخول
              </Button>
            </Grid2>
          </Grid2>
        </Card>
      </Grid2>
    </ViewContainer>
  );
};

export default Login;

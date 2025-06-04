import {
  Card,
  Grid2,
  TextField,
  Typography,
  Box,
  InputAdornment,
  Fade,
} from "@mui/material";
import { Person, Lock } from "@mui/icons-material";
import { ViewContainer } from "../Shared/Utils";
import { useCallback, useState, useContext } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import { StoreContext } from "../../StoreDataProvider";
import { LoadingButton } from "@mui/lab";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [loggingIn, setLoggingIn] = useState(false);

  const navigate = useNavigate();
  const { refreshProfile, storeId } = useContext(StoreContext);

  const login = useCallback(async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    try {
      const formdata = new FormData();
      formdata.append("username", username);
      formdata.append("password", password);

      await axios.post("/login", formdata, {
        params: {
          store_id: storeId,
        },
      });

      await refreshProfile();
      navigate("/sell");
    } catch (e) {
      setMsg({ type: "error", text: "حدث خطأ ما" });
      console.error(e);
    }
    setLoggingIn(false);
  }, [username, password, navigate, loggingIn, refreshProfile, storeId]);

  const handleKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        login();
      }
    },
    [login],
  );

  return (
    <ViewContainer>
      <Box
        sx={{
          width: "100%",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: (theme) =>
              theme.palette.mode === "light"
                ? "radial-gradient(circle at 30% 70%, rgba(25, 118, 210, 0.1) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(124, 77, 255, 0.1) 0%, transparent 50%)"
                : "radial-gradient(circle at 30% 70%, rgba(144, 202, 249, 0.1) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(206, 147, 216, 0.1) 0%, transparent 50%)",
            zIndex: -1,
          },
        }}
      >
        <AlertMessage message={msg} setMessage={setMsg} />
        <Fade in timeout={800}>
          <Card
            elevation={12}
            sx={{
              px: { xs: 3, sm: 5 },
              py: { xs: 3, sm: 4 },
              maxWidth: 450,
              width: "100%",
              mx: 2,
              background: (theme) =>
                theme.palette.mode === "light"
                  ? "linear-gradient(145deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 255, 0.95) 100%)"
                  : "linear-gradient(145deg, rgba(13, 27, 42, 0.95) 0%, rgba(10, 25, 41, 0.98) 100%)",
              backdropFilter: "blur(10px)",
              borderRadius: 3,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              position: "relative",
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "4px",
                background: (theme) =>
                  `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                borderRadius: "12px 12px 0 0",
              },
            }}
          >
            <Grid2 container spacing={4}>
              <Grid2 size={12}>
                <Box sx={{ textAlign: "center", mb: 2 }}>
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      background: (theme) =>
                        `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                      boxShadow: (theme) =>
                        theme.palette.mode === "light"
                          ? "0 8px 32px rgba(25, 118, 210, 0.3)"
                          : "0 8px 32px rgba(144, 202, 249, 0.2)",
                    }}
                  >
                    <Person sx={{ fontSize: 40, color: "white" }} />
                  </Box>
                  <Typography
                    variant="h4"
                    align="center"
                    sx={{
                      fontWeight: 600,
                      background: (theme) =>
                        `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                      backgroundClip: "text",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      mb: 1,
                    }}
                  >
                    مرحبا بك مرة أخرى!
                  </Typography>
                  <Typography
                    variant="body1"
                    align="center"
                    color="text.secondary"
                    sx={{ fontWeight: 400 }}
                  >
                    يرجى تسجيل الدخول للمتابعة
                  </Typography>
                </Box>
              </Grid2>
              <Grid2 container spacing={3} size={12}>
                <Grid2 size={12}>
                  <TextField
                    id="loginUserName"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={handleKeyPress}
                    label="اسم المستخدم"
                    fullWidth
                    variant="outlined"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Person color="action" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        transition: "all 0.3s ease",
                        "&:hover": {
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "primary.main",
                          },
                        },
                        "&.Mui-focused": {
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderWidth: 2,
                          },
                        },
                      },
                    }}
                  />
                </Grid2>
                <Grid2 size={12}>
                  <TextField
                    id="loginPassword"
                    value={password}
                    type="password"
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyPress}
                    label="كلمة المرور"
                    fullWidth
                    variant="outlined"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock color="action" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        transition: "all 0.3s ease",
                        "&:hover": {
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "primary.main",
                          },
                        },
                        "&.Mui-focused": {
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderWidth: 2,
                          },
                        },
                      },
                    }}
                  />
                </Grid2>
              </Grid2>
              <Grid2 size={12}>
                <LoadingButton
                  loading={loggingIn}
                  onClick={login}
                  variant="contained"
                  id="loginBtn"
                  fullWidth
                  size="large"
                  sx={{
                    py: 1.5,
                    borderRadius: 2,
                    fontWeight: 600,
                    fontSize: "1.1rem",
                    transition: "all 0.3s ease",
                  }}
                >
                  تسجيل الدخول
                </LoadingButton>
              </Grid2>
            </Grid2>
          </Card>
        </Fade>
      </Box>
    </ViewContainer>
  );
};

export default Login;

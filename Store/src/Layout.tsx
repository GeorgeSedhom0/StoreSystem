import { AppBar, Button, Toolbar, Grid, IconButton } from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { ViewContainer } from "./pages/Shared/Utils";
import { useNavigate } from "react-router-dom";
import { useCallback, useState } from "react";
import AlertMessage, { AlertMsg } from "./pages/Shared/AlertMessage";
import SettingsIcon from "@mui/icons-material/Settings";
import axios from "axios";
import { NavLink } from "react-router-dom";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import BrightnessHighIcon from "@mui/icons-material/BrightnessHigh";

const Layout = ({
  children,
  themeMode,
  setThemeMode,
}: {
  children: React.ReactNode;
  themeMode: "dark" | "light";
  setThemeMode: React.Dispatch<React.SetStateAction<"dark" | "light">>;
}) => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.post("http://localhost:8000/send-sync");
      console.log(data);
      setMsg({ type: "success", text: "تمت المزامنة بنجاح" });
    } catch (e) {
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  return (
    <>
      <AppBar
        position="sticky"
        sx={{
          bgcolor: "background.paper",
        }}
      >
        <Toolbar>
          <Grid
            container
            gap={5}
            sx={{
              flexGrow: 1,
              ".active > Button": {
                borderBottom: 1,
                borderColor: "primary.dark",
              },
              Button: {
                color: "text.primary",
              },
            }}
          >
            <NavLink to="/sell">
              <Button>بيع</Button>
            </NavLink>
            <NavLink to="/buy">
              <Button>شراء</Button>
            </NavLink>
            <NavLink to="/add-to-storage">
              <Button>اضافة منتجات</Button>
            </NavLink>
            <NavLink to="/bills">
              <Button>الفواتير</Button>
            </NavLink>
            <NavLink to="/products">
              <Button>المنتجات</Button>
            </NavLink>
            <NavLink to="/cash">
              <Button>الحركات المالية</Button>
            </NavLink>
            <LoadingButton loading={loading} onClick={sync}>
              مزامنة
            </LoadingButton>
          </Grid>
          <IconButton
            onClick={() => {
              setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));
              localStorage.setItem(
                "mode",
                themeMode === "dark" ? "light" : "dark"
              );
            }}
          >
            {themeMode === "dark" ? <BrightnessHighIcon /> : <DarkModeIcon />}
          </IconButton>
          <IconButton
            onClick={() => {
              navigate("/settings");
            }}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <ViewContainer>
        <AlertMessage message={msg} setMessage={setMsg} />
        {children}
      </ViewContainer>
    </>
  );
};

export default Layout;

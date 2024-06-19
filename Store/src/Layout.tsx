import { AppBar, Button, Toolbar, Grid, IconButton } from "@mui/material";
import { ViewContainer } from "./pages/Shared/Utils";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AlertMessage, { AlertMsg } from "./pages/Shared/AlertMessage";
import SettingsIcon from "@mui/icons-material/Settings";
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

  const navigate = useNavigate();
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

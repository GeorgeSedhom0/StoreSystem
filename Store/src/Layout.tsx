import { AppBar, Button, Toolbar, Grid, IconButton } from "@mui/material";
import { Profile, ViewContainer } from "./pages/Shared/Utils";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
} from "react";
import { NavLink } from "react-router-dom";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import BrightnessHighIcon from "@mui/icons-material/BrightnessHigh";
import { StoreContext } from "./StoreDataProvider";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";

const logoutWihtoutEndingShift = async () => {
  await axios.get(import.meta.env.VITE_SERVER_URL + "/switch", {
    withCredentials: true,
  });
};

const Layout = ({
  children,
  themeMode,
  setThemeMode,
}: {
  children: ReactNode;
  themeMode: "dark" | "light";
  setThemeMode: Dispatch<SetStateAction<"dark" | "light">>;
}) => {
  const location = useLocation();
  if (location.pathname === "/login") {
    return <>{children}</>;
  }

  const profile = useContext(StoreContext) as Profile;
  const navigate = useNavigate();

  // useEffect(() => {
  //   if (
  //     profile && !profile.user.paths.some((path) => location.pathname.startsWith(path))
  //   ) {
  //     navigate("/sell");
  //   }
  // }, [location.pathname, profile, navigate]);

  const { mutate: switchAccount } = useMutation({
    mutationFn: logoutWihtoutEndingShift,
    onSuccess: () => {
      navigate("/login");
    },
    onError: (error) => {
      window.location.reload();
      console.log(error);
    },
  });

  return (
    <>
      <AppBar
        position="sticky"
        sx={{
          bgcolor: "background.paper",
          display: location.pathname === "/login" ? "none" : "block",
        }}
      >
        <Toolbar>
          <Grid container justifyContent="space-between">
            <Grid
              item
              container
              gap={5}
              sx={{
                ".active > Button": {
                  borderBottom: 1,
                  borderColor: "primary.dark",
                },
                Button: {
                  color: "text.primary",
                },
                width: "fit-content",
              }}
            >
              {profile && profile.user.pages.map((page, index) => (
                <NavLink key={index} to={profile.user.paths[index]}>
                  <Button>{page}</Button>
                </NavLink>
              ))}
            </Grid>
            <Grid
              item
              container
              gap={5}
              sx={{
                width: "fit-content",
              }}
            >
              <Button variant="contained" onClick={() => switchAccount()}>
                تبديل المستخدم
              </Button>
              <IconButton
                onClick={() => {
                  setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));
                  localStorage.setItem(
                    "mode",
                    themeMode === "dark" ? "light" : "dark"
                  );
                }}
              >
                {themeMode === "dark" ? (
                  <BrightnessHighIcon />
                ) : (
                  <DarkModeIcon />
                )}
              </IconButton>
            </Grid>
          </Grid>
        </Toolbar>
      </AppBar>
      <ViewContainer>{children}</ViewContainer>
    </>
  );
};

export default Layout;

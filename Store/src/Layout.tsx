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

const Layout = ({
  children,
  themeMode,
  setThemeMode,
}: {
  children: ReactNode;
  themeMode: "dark" | "light";
  setThemeMode: Dispatch<SetStateAction<"dark" | "light">>;
}) => {
  const profile = useContext(StoreContext) as Profile;
  const location = useLocation();

  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/login") return;

    if (!profile.user.paths.includes(location.pathname)) {
      navigate("/sell");
    }
  }, [location.pathname, profile, navigate]);

  if (location.pathname === "/login") {
    return <>{children}</>;
  }

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
            {profile.user.pages.map((page, index) => (
              <NavLink key={index} to={profile.user.paths[index]}>
                <Button>{page}</Button>
              </NavLink>
            ))}
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
        </Toolbar>
      </AppBar>
      <ViewContainer>{children}</ViewContainer>
    </>
  );
};

export default Layout;

import {
  AppBar,
  Button,
  Toolbar,
  Grid,
  IconButton,
  CircularProgress,
} from "@mui/material";
import { ViewContainer } from "./pages/Shared/Utils";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Dispatch,
  ReactNode,
  SetStateAction,
  useEffect,
  useState,
} from "react";
import AlertMessage, { AlertMsg } from "./pages/Shared/AlertMessage";
import { NavLink } from "react-router-dom";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import BrightnessHighIcon from "@mui/icons-material/BrightnessHigh";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";

interface profile {
  name: string;
  pages: string[];
  paths: string[];
}

const getProfile = async () => {
  const { data } = await axios.get<profile>(
    import.meta.env.VITE_SERVER_URL + "/profile",
    { withCredentials: true }
  );

  return data;
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
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const location = useLocation();

  const navigate = useNavigate();

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: location.pathname !== "/login",
  });

  useEffect(() => {
    if (isLoading || isError) return;
    if (!profile) return;

    if (!profile.paths.includes(location.pathname)) {
      navigate("/sell");
    }
  }, [isLoading, isError, profile]);

  if (isError) {
    navigate("/login");
  }
  if (isLoading) {
    return (
      <Grid
        container
        justifyContent="center"
        alignItems="center"
        height="100vh"
      >
        <CircularProgress />
      </Grid>
    );
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
            {profile?.pages.map((page, index) => (
              <NavLink key={index} to={profile.paths[index]}>
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
      <ViewContainer>
        <AlertMessage message={msg} setMessage={setMsg} />
        {children}
      </ViewContainer>
    </>
  );
};

export default Layout;

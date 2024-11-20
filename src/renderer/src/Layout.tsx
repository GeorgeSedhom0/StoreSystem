import { AppBar, Button, Toolbar, Grid2 } from "@mui/material";
import { Profile, ViewContainer } from "./pages/Shared/Utils";
import { useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useContext, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { StoreContext } from "./StoreDataProvider";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import SetBaseUrl from "./SetBaseUrl";

const logoutWihtoutEndingShift = async () => {
  await axios.get("/switch", {
    withCredentials: true,
  });
};

const Layout = ({
  isBaseUrlSet,
  children,
}: {
  isBaseUrlSet: boolean;
  children: ReactNode;
}) => {
  if (!isBaseUrlSet) {
    return <SetBaseUrl />;
  }

  const location = useLocation();
  if (location.pathname === "/login") {
    return <>{children}</>;
  }

  const profile = useContext(StoreContext) as Profile;
  const navigate = useNavigate();

  useEffect(() => {
    if (
      profile &&
      !profile.user.paths.some((path) => location.pathname.startsWith(path))
    ) {
      navigate("/sell");
    }
  }, [location.pathname, profile, navigate]);

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
          width: "100vw",
          overflowX: "auto",
          height: 64,
        }}
      >
        <Toolbar>
          <Grid2 container justifyContent="space-between" width="100%">
            <Grid2
              container
              gap={3}
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
              {profile &&
                profile.user.pages.map((page, index) => (
                  <NavLink key={index} to={profile.user.paths[index]}>
                    <Button>{page}</Button>
                  </NavLink>
                ))}
            </Grid2>
            <Grid2
              container
              gap={2}
              sx={{
                width: "fit-content",
              }}
            >
              <Button variant="contained" onClick={() => switchAccount()}>
                تبديل المستخدم
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  window.electron.ipcRenderer.invoke("open-new-window");
                }}
              >
                +
              </Button>
            </Grid2>
          </Grid2>
        </Toolbar>
      </AppBar>
      <ViewContainer
        sx={{
          height: "calc(100vh - 205px)",
        }}
      >
        {children}
      </ViewContainer>
    </>
  );
};

export default Layout;

import {
  AppBar,
  Button,
  Toolbar,
  Grid2,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  IconButton,
  Badge,
} from "@mui/material";
import { ViewContainer } from "./pages/Shared/Utils";
import { useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { StoreContext } from "./StoreDataProvider";
import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import SetBaseUrl from "./SetBaseUrl";
import { StoreData } from "./pages/utils/types";
import LoadingScreen from "./pages/Shared/LoadingScreen";
import AddIcon from "@mui/icons-material/Add";

const logoutWihtoutEndingShift = async () => {
  await axios.get("/switch", {
    withCredentials: true,
  });
};

const getStoresData = async () => {
  const { data } = await axios.get<StoreData[]>("/admin/stores-data");
  return data;
};

const getCurrentShift = async (storeId: number) => {
  const { data } = await axios.get(`/current-shift?store_id=${storeId}`);
  return data;
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

  const { profile, storeId, setGlobalStoreId } = useContext(StoreContext);
  const navigate = useNavigate();
  const [currentStoreId, setCurrentStoreId] = useState<number>(storeId);
  const [isCheckingShift, setIsCheckingShift] = useState(true);
  const topNavRef = useRef<HTMLDivElement>(null);

  // Check for current shift
  const { data: shiftData, isLoading: isShiftLoading } = useQuery({
    queryKey: ["currentShift", storeId],
    queryFn: () => getCurrentShift(storeId),
    enabled: !!storeId && location.pathname !== "/login",
  });

  const { data: requests } = useQuery({
    queryKey: ['product-requests', storeId],
    queryFn: async () => {
        if (!storeId) return [];
        const { data } = await axios.get(`/product-requests?store_id=${storeId}`);
        return data;
    },
    enabled: !!storeId,
    refetchInterval: 5000, // Refetch every 5 seconds to keep it updated
});

const pendingRequestsCount = useMemo(() => {
    if (!requests) return 0;
    const incomingPending = requests.filter(
        (req) => req.requested_store_id === storeId && req.status === 'pending'
    );
    return incomingPending.length;
}, [requests, storeId]);

  // Effect to check if user has a valid shift and redirect if not
  useEffect(() => {
    if (
      !isShiftLoading &&
      shiftData &&
      !shiftData.start_date_time &&
      location.pathname !== "/login"
    ) {
      navigate("/login");
    }

    if (!isShiftLoading) {
      setIsCheckingShift(false);
    }
  }, [shiftData, isShiftLoading, navigate, location.pathname]);

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

  const { data: storesData } = useQuery({
    queryKey: ["storesData"],
    queryFn: getStoresData,
  });

  // If we're still checking for shift data, don't render the full layout yet
  if (isCheckingShift) {
    <LoadingScreen loading={true} />;
  }

  return (
    <>
      <AppBar
        position="sticky"
        sx={{
          bgcolor: "background.paper",
          display: location.pathname === "/login" ? "none" : "block",
          width: "100vw",
        }}
        ref={topNavRef}
      >
        <Toolbar sx={{ width: "100%" }}>
          <Grid2 container spacing={2} py={2} px={1} width="100%">
            <Grid2
              container
              size={9.5}
              gap={2}
              sx={{
                ".active > Button": {
                  borderBottom: 1,
                  borderColor: "primary.dark",
                },
                Button: {
                  color: "text.primary",
                },
              }}
            >
              {profile &&
                profile.user.pages
                  .filter((page) => page !== "admin")
                  .map((page, index) => {
                    const pageName = page;
                    const pagePath = profile.user.paths[index];
                    const isRequestProductsPage = pageName === 'طلبات المنتجات';

                    return (
                        <NavLink key={index} to={pagePath}>
                            <Button>
                                {isRequestProductsPage ? (
                                    <Badge badgeContent={pendingRequestsCount} color="error">
                                        {pageName}
                                    </Badge>
                                ) : (
                                    pageName
                                )}
                            </Button>
                        </NavLink>
                    );
                })}
            </Grid2>
            <Grid2
              container
              size={2.5}
              gap={2}
              justifyContent="flex-end"
              alignItems="flex-start"
            >
              {profile?.user.paths.includes("/admin") && (
                <FormControl>
                  <InputLabel size="small">المتجر</InputLabel>
                  <Select
                    size="small"
                    value={currentStoreId}
                    label="المتجر"
                    onChange={async (e) => {
                      await setGlobalStoreId(e.target.value as number);
                      setCurrentStoreId(e.target.value as number);
                      window.location.reload();
                    }}
                  >
                    {storesData &&
                      storesData.map((store) => (
                        <MenuItem key={store.id} value={store.id}>
                          {store.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              )}
              <Button
                variant="contained"
                onClick={() => switchAccount()}
                color="error"
              >
                تبديل المستخدم
              </Button>
              <IconButton
                onClick={() => {
                  window.electron.ipcRenderer.invoke("open-new-window");
                }}
                color="primary"
              >
                <AddIcon />
              </IconButton>
            </Grid2>
          </Grid2>
        </Toolbar>
      </AppBar>
      <ViewContainer
        sx={{
          height: `calc(100vh - ${(topNavRef.current?.clientHeight || 0) + 140}px)`,
        }}
      >
        {children}
      </ViewContainer>
    </>
  );
};

export default Layout;

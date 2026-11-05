import {
  AppBar,
  Button,
  Toolbar,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  IconButton,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AddIcon from "@mui/icons-material/Add";
import LogoutIcon from "@mui/icons-material/SwapHoriz";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import AddBoxIcon from "@mui/icons-material/AddBox";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import GroupsIcon from "@mui/icons-material/Groups";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import PaymentsIcon from "@mui/icons-material/Payments";
import InsightsIcon from "@mui/icons-material/Insights";
import SettingsIcon from "@mui/icons-material/Settings";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import BadgeIcon from "@mui/icons-material/Badge";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import BuildIcon from "@mui/icons-material/Build";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AssignmentReturnedIcon from "@mui/icons-material/AssignmentReturned";
import { ViewContainer } from "./pages/Shared/Utils";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavLink } from "react-router-dom";
import { StoreContext } from "./StoreDataProvider";
import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import SetBaseUrl from "./SetBaseUrl";
import { StoreData } from "./pages/utils/types";
import NotificationBell from "./pages/Shared/NotificationBell";
import { PAGE_LABELS } from "./pageLabels";

const IS_WEB = Boolean((window as any).__IS_WEB__);

const PAGE_ICONS: Record<string, ReactNode> = {
  "/sell": <PointOfSaleIcon />,
  "/admin/sell": <AdminPanelSettingsIcon />,
  "/buy": <ShoppingCartIcon />,
  "/add-to-storage": <AddBoxIcon />,
  "/admin/move-products": <LocalShippingIcon />,
  "/bills": <ReceiptLongIcon />,
  "/parties-bills": <GroupsIcon />,
  "/admin/bills": <ReceiptLongIcon />,
  "/products": <Inventory2Icon />,
  "/admin/products": <Inventory2Icon />,
  "/cash": <PaymentsIcon />,
  "/analytics": <InsightsIcon />,
  "/settings": <SettingsIcon />,
  "/installments": <CalendarMonthIcon />,
  "/employees": <BadgeIcon />,
  "/accounts": <AccountBalanceWalletIcon />,
  "/bill-corrections": <BuildIcon />,
  "/restock-requests": <AssignmentReturnedIcon />,
};

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
  return <Shell>{children}</Shell>;
};

// All hooks live here and always run in the same order (the login page used
// to return early before them, which breaks React's hook order on navigation).
const Shell = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const isLogin = location.pathname === "/login";
  const { profile, storeId, store, setGlobalStoreId } =
    useContext(StoreContext);
  const navigate = useNavigate();
  const [currentStoreId, setCurrentStoreId] = useState<number>(storeId);
  const topNavRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Check for current shift
  const { data: shiftData, isLoading: isShiftLoading } = useQuery({
    queryKey: ["currentShift", storeId],
    queryFn: () => getCurrentShift(storeId),
    enabled: !!storeId && !isLogin,
  });

  // A user without an open shift goes to the login page.
  useEffect(() => {
    if (
      !isShiftLoading &&
      shiftData &&
      !shiftData.start_date_time &&
      !isLogin
    ) {
      navigate("/login");
    }
  }, [shiftData, isShiftLoading, navigate, isLogin]);

  useEffect(() => {
    if (
      !isLogin &&
      profile &&
      !profile.user.paths.some((path) => location.pathname.startsWith(path))
    ) {
      navigate("/sell");
    }
  }, [location.pathname, profile, navigate, isLogin]);

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
    enabled: !isLogin,
  });

  const navItems = useMemo(
    () =>
      profile?.user.pages
        .map((page, index) => ({ page, path: profile.user.paths[index] }))
        .filter(({ page }) => page !== "admin" && page !== "الإشعارات")
        .map(({ page, path }) => ({ page: PAGE_LABELS[path] ?? page, path })) ||
      [],
    [profile],
  );

  // Longest matching path = the current page (so /admin/bills beats /bills).
  const currentPage = useMemo(
    () =>
      [...navItems]
        .sort((a, b) => b.path.length - a.path.length)
        .find(({ path }) => location.pathname.startsWith(path)),
    [navItems, location.pathname],
  );

  // Pages outside the menu (notifications) still get a title.
  const pageTitle =
    currentPage?.page ??
    Object.entries(PAGE_LABELS).find(([path]) =>
      location.pathname.startsWith(path),
    )?.[1] ??
    "OpenStore";

  useEffect(() => {
    document.title =
      pageTitle === "OpenStore" ? "OpenStore" : `${pageTitle} — OpenStore`;
  }, [pageTitle]);

  if (isLogin) {
    return <>{children}</>;
  }

  const storeSelector = profile?.user.paths.includes("/admin") && (
    <FormControl size="small" fullWidth={isMobile} sx={{ minWidth: 140 }}>
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
  );

  return (
    <>
      <AppBar
        position="sticky"
        elevation={isMobile ? 1 : 4}
        sx={{
          bgcolor: "background.paper",
          color: "text.primary",
          width: "100%",
          pt: "env(safe-area-inset-top)",
        }}
        ref={topNavRef}
      >
        <Toolbar sx={{ width: "100%", px: { xs: 1, md: 2 } }}>
          {isMobile ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                gap: 1,
              }}
            >
              <IconButton
                color="primary"
                edge="start"
                onClick={() => setDrawerOpen(true)}
                aria-label="القائمة"
              >
                <MenuIcon />
              </IconButton>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {pageTitle}
                </Typography>
                {store?.name && (
                  <Typography
                    noWrap
                    variant="caption"
                    color="text.secondary"
                    component="div"
                  >
                    {store.name}
                  </Typography>
                )}
              </Box>
              {profile?.user.paths.includes("/notifications") && (
                <NotificationBell />
              )}
            </Box>
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 2,
                py: 2,
                px: 1,
                width: "100%",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                  flex: 1,
                  ".active > Button": {
                    borderBottom: 2,
                    borderColor: "primary.main",
                    borderRadius: 0,
                    color: "primary.main",
                  },
                  Button: {
                    color: "text.primary",
                  },
                }}
              >
                {navItems.map(({ page, path }) => (
                  <NavLink key={path} to={path}>
                    <Button>{page}</Button>
                  </NavLink>
                ))}
              </Box>
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  alignItems: "flex-start",
                  flexShrink: 0,
                }}
              >
                {storeSelector}
                <Button
                  variant="contained"
                  onClick={() => switchAccount()}
                  color="error"
                >
                  تبديل المستخدم
                </Button>
                {profile?.user.paths.includes("/notifications") && (
                  <NotificationBell />
                )}
                {!IS_WEB && (
                  <IconButton
                    onClick={() => {
                      window.electron.ipcRenderer.invoke("open-new-window");
                    }}
                    color="primary"
                    aria-label="نافذة جديدة"
                  >
                    <AddIcon />
                  </IconButton>
                )}
              </Box>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 290, maxWidth: "85vw" } }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            pt: "env(safe-area-inset-top)",
            pb: "env(safe-area-inset-bottom)",
          }}
        >
          <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
            <StorefrontIcon color="primary" />
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 700 }}>
                {store?.name || "OpenStore"}
              </Typography>
              {profile?.user.name && (
                <Typography
                  noWrap
                  variant="caption"
                  color="text.secondary"
                  component="div"
                >
                  {profile.user.name}
                </Typography>
              )}
            </Box>
          </Box>
          <Divider />
          <List
            sx={{
              flex: 1,
              overflowY: "auto",
              ".active > .MuiButtonBase-root": {
                bgcolor: "action.selected",
                color: "primary.main",
                "& .MuiListItemIcon-root": { color: "primary.main" },
              },
            }}
          >
            {navItems.map(({ page, path }) => (
              <NavLink
                key={path}
                to={path}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <ListItemButton
                  onClick={() => setDrawerOpen(false)}
                  sx={{ minHeight: 48 }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {PAGE_ICONS[path] ?? <ReceiptLongIcon />}
                  </ListItemIcon>
                  <ListItemText primary={page} />
                </ListItemButton>
              </NavLink>
            ))}
          </List>
          <Divider />
          <Box
            sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}
          >
            {storeSelector}
            <Button
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={() => {
                setDrawerOpen(false);
                switchAccount();
              }}
            >
              تبديل المستخدم
            </Button>
            {!IS_WEB && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => {
                  setDrawerOpen(false);
                  window.electron.ipcRenderer.invoke("open-new-window");
                }}
              >
                نافذة جديدة
              </Button>
            )}
          </Box>
        </Box>
      </Drawer>

      <ViewContainer>{children}</ViewContainer>
    </>
  );
};

export default Layout;

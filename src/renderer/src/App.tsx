import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
} from "react-router-dom";
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import Rtl from "./RTL";
import Sell from "./pages/Sell/Sell";
import Layout from "./Layout";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import Login from "./pages/Login/Login";
import { StoreDataProvider } from "./StoreDataProvider";
import axios from "axios";
import { AUTO_THEME, THEME_EVENT, themes } from "./themes";
import { lazy, Suspense, useEffect, useState } from "react";
import LoadingScreen from "./pages/Shared/LoadingScreen";
import Setup from "./pages/Setup/Setup";

// Pages other than the first screens load on demand (much smaller first
// download, which matters on phones).
const Storage = lazy(() => import("./pages/AddToStorage/AddToStorage"));
const Buy = lazy(() => import("./pages/Buy/Buy"));
const Products = lazy(() => import("./pages/Products/Productds"));
const Bills = lazy(() => import("./pages/Bills/Bills"));
const Cash = lazy(() => import("./pages/Cash/Cash"));
const Settings = lazy(() => import("./pages/Setting/Setting"));
const Analytics = lazy(() => import("./pages/Analytics/Analytics"));
const Installments = lazy(() => import("./pages/Installments/Installments"));
const Employee = lazy(() => import("./pages/Employee/Employee"));
const BillsAdmin = lazy(() => import("./pages/BillsAdmin/BillsAdmin"));
const ProductsAdmin = lazy(
  () => import("./pages/ProductsAdmin/ProductdsAdmin"),
);
const MoveProducts = lazy(() => import("./pages/MoveProducts/MoveProducts"));
const PartiesBills = lazy(() => import("./pages/PartiesBills/PartiesBills"));
const AdminSell = lazy(() => import("./pages/AdminSell/AdminSell"));
const Notifications = lazy(() => import("./pages/Notifications/Notifications"));
const Accounts = lazy(() => import("./pages/Accounts/Accounts"));
const BillCorrections = lazy(
  () => import("./pages/BillCorrections/BillCorrections"),
);
const Restock = lazy(() => import("./pages/Restock/Restock"));

axios.defaults.withCredentials = true;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isBaseURLSet, setIsBaseURLSet] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [theme, setTheme] = useState(createTheme({}));

  useEffect(() => {
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    // `forced` comes from the theme picker (applied live, no reload).
    const getTheme = async (forced?: string) => {
      const themeName =
        forced ??
        (await window.electron.ipcRenderer.invoke("get", "themeName"));

      if (!themeName) {
        await window.electron.ipcRenderer.invoke(
          "set",
          "themeName",
          themes[0].name,
        );
      }

      // "Auto" follows the device's light/dark setting.
      const resolved =
        themeName === AUTO_THEME
          ? darkQuery.matches
            ? "Dark Blue"
            : "Light Blue"
          : themeName;
      const themeSettings =
        themes.find((t) => t.name === resolved) || themes[0];

      // The phone status bar / PWA chrome follows the theme.
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          "content",
          themeSettings.mode === "dark"
            ? themeSettings.paper
            : themeSettings.primary,
        );

      const selectedTheme = createTheme({
        direction: "rtl",
        // Native fonts with good Arabic shaping on every platform (Segoe UI on
        // Windows, SF on Apple, Noto on Android); Roboto stays for Latin.
        typography: {
          fontFamily: [
            "-apple-system",
            "BlinkMacSystemFont",
            '"Segoe UI"',
            '"Noto Sans Arabic"',
            "Tahoma",
            "Roboto",
            "Arial",
            "sans-serif",
          ].join(","),
          button: { fontWeight: 600 },
        },
        shape: { borderRadius: 10 },
        palette: {
          mode: themeSettings.mode,
          primary: {
            main: themeSettings.primary,
            contrastText:
              themeSettings.mode === "light" ? "#ffffff" : "#000000",
          },
          secondary: {
            main: themeSettings.secondary,
            contrastText:
              themeSettings.mode === "light" ? "#ffffff" : "#000000",
          },
          background: {
            default: themeSettings.background,
            paper: themeSettings.paper,
          },
          text: themeSettings.text,
          divider: themeSettings.divider,
          error: {
            main: themeSettings.error,
          },
          warning: {
            main: themeSettings.warning,
          },
          info: {
            main: themeSettings.info,
          },
          success: {
            main: themeSettings.success,
          },
          action: themeSettings.action,
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                backgroundImage: themeSettings.backgroundImage,
                backgroundAttachment: "fixed",
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                minHeight: "100vh",
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundColor: themeSettings.surface.main,
                borderColor: themeSettings.surface.border,
              },
            },
          },
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
              root: {
                textTransform: "none",
                borderRadius: 10,
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: { borderRadius: 14 },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: ({ ownerState }) =>
                ownerState.fullScreen ? {} : { borderRadius: 16 },
            },
          },
          MuiDialogTitle: {
            styleOverrides: {
              root: { fontWeight: 700 },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: { fontWeight: 500 },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              head: { fontWeight: 700 },
            },
          },
          MuiTooltip: {
            defaultProps: { enterTouchDelay: 300 },
          },
          MuiDivider: {
            styleOverrides: {
              root: {
                borderColor: themeSettings.divider,
              },
            },
          },
        },
      });

      setTheme(selectedTheme);
    };
    getTheme();
    const onPick = (e: Event) => getTheme((e as CustomEvent<string>).detail);
    const onScheme = () => getTheme();
    window.addEventListener(THEME_EVENT, onPick);
    darkQuery.addEventListener("change", onScheme);
    return () => {
      window.removeEventListener(THEME_EVENT, onPick);
      darkQuery.removeEventListener("change", onScheme);
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      // Check if mode has been configured (first-run wizard)
      const mode = await window.electron.ipcRenderer.invoke("get-mode");

      if (!mode) {
        // No mode set — show first-run wizard
        setNeedsSetup(true);
        setIsLoading(false);
        return;
      }

      // Mode is set, proceed with baseUrl connection
      const baseUrl = await window.electron.ipcRenderer.invoke(
        "get",
        "baseUrl",
      );

      if (!baseUrl) {
        setIsBaseURLSet(false);
        setIsLoading(false);
        return;
      }

      // Loop until connection is successful
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const { data } = await axios.get(baseUrl + "/test", {
            timeout: 5000,
          });
          if (data === "Hello, World!") {
            axios.defaults.baseURL = baseUrl;
            setIsBaseURLSet(true);
            setIsLoading(false);
            console.log("Base URL set successfully:", baseUrl);
            break;
          } else {
            console.log("Received unexpected data from /test endpoint:", data);
          }
        } catch (e) {
          console.error("Failed to connect to server, retrying...");
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    };

    initialize();
  }, []);

  if (isLoading || !theme) {
    return <LoadingScreen loading={true} />;
  }

  if (needsSetup) {
    return (
      <Setup
        onComplete={() => {
          // Reload the app to go through the normal flow
          window.location.reload();
        }}
      />
    );
  }

  return (
    <Rtl>
      <QueryClientProvider client={queryClient}>
        <Router>
          <StoreDataProvider>
            <ThemeProvider theme={theme}>
              <CssBaseline />
              <Layout isBaseUrlSet={isBaseURLSet}>
                <Suspense fallback={<LoadingScreen loading={true} />}>
                  <Routes>
                    {/* Admin routes should be defined first for proper precedence */}
                    <Route path="/admin/products" element={<ProductsAdmin />} />
                    <Route path="/admin/bills" element={<BillsAdmin />} />
                    <Route
                      path="/admin/move-products"
                      element={<MoveProducts />}
                    />
                    <Route path="/admin/sell" element={<AdminSell />} />

                    {/* Regular routes */}
                    <Route path="/sell" element={<Sell />} />
                    <Route path="/add-to-storage" element={<Storage />} />
                    <Route path="/buy" element={<Buy />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/bills" element={<Bills />} />
                    <Route path="/bills/:partyId" element={<Bills />} />
                    <Route path="/cash" element={<Cash />} />
                    <Route path="/cash/:partyId" element={<Cash />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/accounts" element={<Accounts />} />
                    <Route
                      path="/bill-corrections"
                      element={<BillCorrections />}
                    />
                    <Route path="/restock-requests" element={<Restock />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/installments" element={<Installments />} />
                    <Route path="/employees" element={<Employee />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/parties-bills" element={<PartiesBills />} />
                    <Route path="/notifications" element={<Notifications />} />

                    {/* if any route other than the defined go to /sell */}
                    <Route path="*" element={<Navigate to="/sell" />} />
                  </Routes>
                </Suspense>
              </Layout>
            </ThemeProvider>
          </StoreDataProvider>
        </Router>
      </QueryClientProvider>
    </Rtl>
  );
};

export default App;

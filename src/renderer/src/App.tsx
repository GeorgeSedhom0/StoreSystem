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
import Storage from "./pages/AddToStorage/AddToStorage";
import Buy from "./pages/Buy/Buy";
import Products from "./pages/Products/Productds";
import Bills from "./pages/Bills/Bills";
import Cash from "./pages/Cash/Cash";
import Settings from "./pages/Setting/Setting";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import Login from "./pages/Login/Login";
import Analytics from "./pages/Analytics/Analytics";
import { StoreDataProvider } from "./StoreDataProvider";
import axios from "axios";
import Installments from "./pages/Installments/Installments";
import Employee from "./pages/Employee/Employee";
import { Theme, themes } from "./themes";
import { useEffect, useState } from "react";
import LoadingScreen from "./pages/Shared/LoadingScreen";

axios.defaults.withCredentials = true;

const localTheme = localStorage.getItem("themeName");
let themeSettings: Theme =
  themes.find((t) => t.name === localTheme) || themes[0];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isBaseURLSet, setIsBaseURLSet] = useState(true);

  const theme = createTheme({
    direction: "rtl",
    palette: {
      mode: themeSettings.mode,
      primary: {
        main: themeSettings.primary,
        contrastText: themeSettings.mode === "light" ? "#ffffff" : "#000000",
      },
      secondary: {
        main: themeSettings.secondary,
        contrastText: themeSettings.mode === "light" ? "#ffffff" : "#000000",
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
        styleOverrides: {
          root: {
            textTransform: "none",
          },
        },
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

  useEffect(() => {
    const setBaseUrl = async () => {
      try {
        const baseUrl = await window.electron.ipcRenderer.invoke(
          "get",
          "baseUrl",
        );
        if (baseUrl) {
          const { data } = await axios.get(baseUrl + "/test");
          if (data === "Hello, World!") {
            axios.defaults.baseURL = baseUrl;
          } else {
            setIsBaseURLSet(false);
          }
        } else {
          setIsBaseURLSet(false);
        }
      } catch (e) {
        console.log(e);
      }
      setIsLoading(false);
    };

    setBaseUrl();
  }, []);

  if (isLoading) {
    return <LoadingScreen loading={true} />;
  }

  return (
    <Rtl>
      <QueryClientProvider client={queryClient}>
        <Router>
          <StoreDataProvider>
            <ThemeProvider theme={theme}>
              <CssBaseline />
              <Layout isBaseUrlSet={isBaseURLSet}>
                <Routes>
                  <Route path="/sell" element={<Sell />} />
                  <Route path="/add-to-storage" element={<Storage />} />
                  <Route path="/buy" element={<Buy />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/bills" element={<Bills />} />
                  <Route path="/bills/:partyId" element={<Bills />} />
                  <Route path="/cash" element={<Cash />} />
                  <Route path="/cash/:partyId" element={<Cash />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/installments" element={<Installments />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/employees" element={<Employee />} />
                  <Route path="/login" element={<Login />} />
                  {/* if any route other than the defined go to /sell */}
                  <Route path="*" element={<Navigate to="/sell" />} />
                </Routes>
              </Layout>
            </ThemeProvider>
          </StoreDataProvider>
        </Router>
      </QueryClientProvider>
    </Rtl>
  );
};

export default App;

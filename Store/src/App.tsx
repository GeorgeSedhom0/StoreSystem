import {
  Navigate,
  Route,
  BrowserRouter as Router,
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
import { useState } from "react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import Login from "./pages/Login/Login";
import Analytics from "./pages/Analytics/Analytics";
import { StoreDataProvider } from "./StoreDataProvider";
import axios from "axios";
import Installments from "./pages/Installments/Installments";
import Employee from "./pages/Employee/Employee";

axios.defaults.withCredentials = true;

const localTheme = localStorage.getItem("selectedTheme");
let themeSettings;

if (!localTheme) {
  themeSettings = {
    mode: "dark",
    primary: "#1976d2",
    secondary: "#ff4081",
    background: "#e3f2fd",
  };
  localStorage.setItem("selectedTheme", JSON.stringify(themeSettings));
} else {
  themeSettings = JSON.parse(localTheme);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const App = () => {
  const [themeMode, setThemeMode] = useState(themeSettings.mode);
  const theme = createTheme({
    direction: "rtl",
    palette: {
      mode: themeMode,
      primary: {
        main: themeSettings.primary,
      },
      secondary: {
        main: themeSettings.secondary,
      },
      background: {
        default: themeSettings.background,
        paper: themeMode === "dark" ? "#293649" : "#c1d9ff",
      },
      divider: themeMode === "dark" ? "#3d4d64" : "#94b6ff",
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage:
              themeMode === "dark"
                ? "radial-gradient(circle at center, #3d4d64 0%, #263245 100%);"
                : "radial-gradient(circle at center, #8cb2ed 0%, #aabbff 7  0%);",
            backgroundAttachment: "fixed",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            minHeight: "100vh",
          },
        },
      },
    },
  });

  return (
    <Rtl>
      <QueryClientProvider client={queryClient}>
        <Router>
          <StoreDataProvider>
            <ThemeProvider theme={theme}>
              <CssBaseline />
              <Layout themeMode={themeMode} setThemeMode={setThemeMode}>
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

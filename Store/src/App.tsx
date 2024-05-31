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

const localMode = localStorage.getItem("mode");
let mode: "dark" | "light";

if (!localMode || (localMode !== "dark" && localMode !== "light")) {
  localStorage.setItem("mode", "dark");
  mode = "dark";
} else {
  mode = localMode;
}

const App = () => {
  const [themeMode, setThemeMode] = useState<"dark" | "light">(mode);
  const theme = createTheme({
    direction: "rtl",
    palette: {
      mode: themeMode,
    },
  });

  return (
    <Rtl>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Layout themeMode={themeMode} setThemeMode={setThemeMode}>
            <Routes>
              {/* if any route other than the defined go to /sell */}
              <Route path="*" element={<Navigate to="/sell" />} />
              <Route path="/sell" element={<Sell />} />
              <Route path="/add-to-storage" element={<Storage />} />
              <Route path="/buy" element={<Buy />} />
              <Route path="/products" element={<Products />} />
              <Route path="/bills" element={<Bills />} />
              <Route path="/cash" element={<Cash />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    </Rtl>
  );
};

export default App;

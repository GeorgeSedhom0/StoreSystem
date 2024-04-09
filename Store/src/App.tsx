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

const theme = createTheme({
  direction: "rtl",
  palette: {
    mode: "dark",
  },
});

const App = () => {
  return (
    <Rtl>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Layout>
            <Routes>
              {/* if any route other than the defined go to /sell */}
              <Route path="*" element={<Navigate to="/sell" />} />
              <Route path="/sell" element={<Sell />} />
              <Route path="/add-to-storage" element={<Storage />} />
              <Route path="/buy" element={<Buy />} />
              <Route path="/products" element={<Products />} />
              <Route path="/bills" element={<Bills />} />
            </Routes>
          </Layout>
        </Router>
      </ThemeProvider>
    </Rtl>
  );
};

export default App;

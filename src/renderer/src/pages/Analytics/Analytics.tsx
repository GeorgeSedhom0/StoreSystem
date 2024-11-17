import { Card, Grid2, Typography } from "@mui/material";
import ShiftsAnalytics from "./Components/ShiftsAnalytics";
import TopProductsAnalytics from "./Components/TopProductsAnalytics";
import AlertsAnalytics from "./Components/AlertsAnalytics";
import ProductsAnalytics from "./Components/ProductsAnalytics";
import SalesAnalytics from "./Components/SalesAnalytics";

const Analytics = () => {
  return (
    <>
      <Grid2 container spacing={2}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ px: 3, py: 2 }}>
            <Typography variant="h4">الاحصائيات</Typography>
            <Typography variant="body1">
              قم بالتحليل والاطلاع على الاحصائيات الخاصة بالمتجر
            </Typography>
          </Card>
        </Grid2>
        <ShiftsAnalytics />
        <SalesAnalytics />
        <TopProductsAnalytics />
        <ProductsAnalytics />
        <AlertsAnalytics />
      </Grid2>
    </>
  );
};

export default Analytics;

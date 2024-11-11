import { Card, Grid, Typography } from "@mui/material";
import ShiftsAnalytics from "./Components/ShiftsAnalytics";
import TopProductsAnalytics from "./Components/TopProductsAnalytics";
import AlertsAnalytics from "./Components/AlertsAnalytics";
import ProductsAnalytics from "./Components/ProductsAnalytics";
import SalesAnalytics from "./Components/SalesAnalytics";

const Analytics = () => {
  return (
    <>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card elevation={3} sx={{ px: 3, py: 2 }}>
            <Typography variant="h4">الاحصائيات</Typography>
            <Typography variant="body1">
              قم بالتحليل والاطلاع على الاحصائيات الخاصة بالمتجر
            </Typography>
          </Card>
        </Grid>
        <ShiftsAnalytics />
        <SalesAnalytics />
        <TopProductsAnalytics />
        <ProductsAnalytics />
        <AlertsAnalytics />
      </Grid>
    </>
  );
};

export default Analytics;

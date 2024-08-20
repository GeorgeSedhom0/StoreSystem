import { Card, Grid, Typography } from "@mui/material";
import { ViewContainer } from "../Shared/Utils";
import ShiftsAnalytics from "./Components/ShiftsAnalytics";
import TopProductsAnalytics from "./Components/TopProductsAnalytics";
import AlertsAnalytics from "./Components/AlertsAnalytics";
import ProductsAnalytics from "./Components/ProductsAnalytics";

const Analytics = () => {
  return (
    <ViewContainer>
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
        <TopProductsAnalytics />
        <ProductsAnalytics />
        <AlertsAnalytics />
      </Grid>
    </ViewContainer>
  );
};

export default Analytics;

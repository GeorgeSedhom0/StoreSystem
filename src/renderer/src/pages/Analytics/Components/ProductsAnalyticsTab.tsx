import { Grid2 } from "@mui/material";
import ProductsAnalytics from "./ProductsAnalytics";
import AlertsAnalytics from "./AlertsAnalytics";
import TopProductsAnalytics from "./TopProductsAnalytics";

const ProductsAnalyticsTab = () => {
  return (
    <Grid2 container spacing={2}>
      <TopProductsAnalytics />
      <ProductsAnalytics />
      <AlertsAnalytics />
    </Grid2>
  );
};

export default ProductsAnalyticsTab;

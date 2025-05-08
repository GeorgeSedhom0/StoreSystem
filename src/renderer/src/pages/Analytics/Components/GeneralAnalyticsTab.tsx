import { Grid2 } from "@mui/material";
import ShiftsAnalytics from "./ShiftsAnalytics";
import SalesAnalytics from "./SalesAnalytics";

const GeneralAnalyticsTab = () => {
  return (
    <Grid2 container spacing={2}>
      <ShiftsAnalytics />
      <SalesAnalytics />
    </Grid2>
  );
};

export default GeneralAnalyticsTab;

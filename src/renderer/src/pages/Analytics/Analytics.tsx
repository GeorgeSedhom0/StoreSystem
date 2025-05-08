import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Card, Divider, Tab } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import autoAnimate from "@formkit/auto-animate";
import GeneralAnalyticsTab from "./Components/GeneralAnalyticsTab";
import ProductsAnalyticsTab from "./Components/ProductsAnalyticsTab";
import IncomeAnalyticsTab from "./Components/IncomeAnalyticsTab";

const Analytics = () => {
  const [tab, setTab] = useState("1");
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parent.current) return;
    autoAnimate(parent.current);
  }, []);

  return (
    <Card elevation={3} sx={{ px: 3, py: 2 }} ref={parent}>
      <TabContext value={tab}>
        <TabList onChange={(_, value) => setTab(value)}>
          <Tab label="عام" value="1" />
          <Tab label="المنتجات" value="2" />
          <Tab label="التقرير المالى" value="3" />
        </TabList>
        <Divider />
        <TabPanel value="1">
          <GeneralAnalyticsTab />
        </TabPanel>
        <TabPanel value="2">
          <ProductsAnalyticsTab />
        </TabPanel>
        <TabPanel value="3">
          <IncomeAnalyticsTab />
        </TabPanel>
      </TabContext>
    </Card>
  );
};

export default Analytics;

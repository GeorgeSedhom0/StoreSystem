import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Card, Divider, Tab, Box, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import autoAnimate from "@formkit/auto-animate";
import GeneralAnalyticsTab from "./Components/GeneralAnalyticsTab";
import ProductsAnalyticsTab from "./Components/ProductsAnalyticsTab";
import IncomeAnalyticsTab from "./Components/IncomeAnalyticsTab";
import DetailedAnalyticsTab from "./Components/DetailedAnalyticsTab";
import {
  Analytics as AnalyticsIcon,
  Dashboard as DashboardIcon,
  Inventory as InventoryIcon,
  AccountBalance as AccountBalanceIcon,
} from "@mui/icons-material";

const Analytics = () => {
  const [tab, setTab] = useState(sessionStorage.getItem("analyticsTab") || "1");
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parent.current) return;
    autoAnimate(parent.current);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("analyticsTab", tab);
  }, [tab]);
  return (
    <Card
      elevation={3}
      sx={{
        px: 0,
        py: 0,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          background:
            "linear-gradient(45deg, secondary.main 30%, secondary.light 90%)",
          color: "white",
          px: 4,
          py: 3,
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(10px)",
          },
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: 600,
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <AnalyticsIcon sx={{ fontSize: "2rem" }} />
          التحليلات والتقارير
        </Typography>
        <Typography
          variant="body1"
          sx={{
            opacity: 0.9,
            mt: 1,
            position: "relative",
            zIndex: 1,
          }}
        >
          عرض وتحليل بيانات المبيعات والأرباح والمخزون
        </Typography>
      </Box>

      <TabContext value={tab}>
        <TabList
          onChange={(_, value) => setTab(value)}
          sx={{
            px: 2,
            py: 1,
            "& .MuiTab-root": {
              minHeight: 64,
              textTransform: "none",
              fontSize: "1rem",
              fontWeight: 500,
              borderRadius: 2,
              mx: 0.5,
              transition: "all 0.3s ease",
              "&:hover": {
                backgroundColor: "action.hover",
              },
            },
          }}
        >
          <Tab
            icon={<DashboardIcon />}
            iconPosition="start"
            label="عام"
            value="1"
          />
          <Tab
            icon={<InventoryIcon />}
            iconPosition="start"
            label="المنتجات"
            value="2"
          />
          <Tab
            icon={<AccountBalanceIcon />}
            iconPosition="start"
            label="التقرير المالى"
            value="3"
          />
          <Tab
            icon={<AnalyticsIcon />}
            iconPosition="start"
            label="تفصيلى"
            value="4"
          />
        </TabList>

        <Divider sx={{ opacity: 0.3 }} />

        <Box ref={parent} sx={{ p: 4 }}>
          <TabPanel value="1" sx={{ p: 0 }}>
            <GeneralAnalyticsTab />
          </TabPanel>
          <TabPanel value="2" sx={{ p: 0 }}>
            <ProductsAnalyticsTab />
          </TabPanel>
          <TabPanel value="3" sx={{ p: 0 }}>
            <IncomeAnalyticsTab />
          </TabPanel>
          <TabPanel value="4" sx={{ p: 0 }}>
            <DetailedAnalyticsTab />
          </TabPanel>
        </Box>
      </TabContext>
    </Card>
  );
};

export default Analytics;

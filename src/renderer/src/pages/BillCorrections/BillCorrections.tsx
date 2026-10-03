import { Box, Card, Divider, Tab, Typography } from "@mui/material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { History as HistoryIcon, Build as BuildIcon } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import CorrectBill from "./Components/CorrectBill";
import CorrectionsLog from "./Components/CorrectionsLog";

const TAB_KEY = "billCorrectionsTab";

const BillCorrections = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(() => {
    try {
      return sessionStorage.getItem(TAB_KEY) || "1";
    } catch {
      return "1";
    }
  });

  const changeTab = (_: unknown, value: string) => {
    setTab(value);
    try {
      sessionStorage.setItem(TAB_KEY, value);
    } catch {
      // ignore
    }
  };

  return (
    <Card elevation={3} sx={{ px: 0, py: 0, borderRadius: 3, overflow: "hidden" }}>
      <Box sx={{ px: 4, py: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
          <BuildIcon sx={{ fontSize: "2rem" }} />
          تصحيح الفواتير
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9, mt: 1 }}>
          تصحيح أخطاء الإدخال في الفواتير بأثر رجعي، كأنها سُجّلت صحيحة من البداية
        </Typography>
      </Box>

      <TabContext value={tab}>
        <TabList
          onChange={changeTab}
          sx={{
            px: 2,
            py: 1,
            "& .MuiTab-root": { minHeight: 64, fontSize: "1rem", fontWeight: 500, borderRadius: 2, mx: 0.5 },
          }}
        >
          <Tab icon={<BuildIcon />} iconPosition="start" label="تصحيح فاتورة" value="1" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="سجل التصحيحات" value="2" />
        </TabList>
        <Divider sx={{ opacity: 0.3 }} />
        <Box sx={{ p: { xs: 2, md: 4 } }}>
          <TabPanel value="1" sx={{ p: 0 }}>
            <CorrectBill
              onApplied={() => {
                queryClient.invalidateQueries({ queryKey: ["bill-corrections", "log"] });
                queryClient.invalidateQueries({ queryKey: ["bills"] });
                queryClient.invalidateQueries({ queryKey: ["products"] });
              }}
            />
          </TabPanel>
          <TabPanel value="2" sx={{ p: 0 }}>
            <CorrectionsLog />
          </TabPanel>
        </Box>
      </TabContext>
    </Card>
  );
};

export default BillCorrections;

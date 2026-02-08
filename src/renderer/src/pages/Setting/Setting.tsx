import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Card, Divider, Tab, Box, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import Basics from "./Components/Basics";
import Scopes from "./Components/Scopes";
import Parties from "./Components/Parties";
import autoAnimate from "@formkit/auto-animate";
import Users from "./Components/Users";
import Themes from "./Components/Themes";
import PrinterSettings from "./Components/PrinterSettings";
import Telegram from "./Components/Telegram";
import {
  Settings as SettingsIcon,
  People as PeopleIcon,
  Security as SecurityIcon,
  Groups as GroupsIcon,
  Palette as PaletteIcon,
  Print as PrintIcon,
  Telegram as TelegramIcon,
} from "@mui/icons-material";

const Settings = () => {
  const [tab, setTab] = useState(sessionStorage.getItem("settingsTab") || "1");
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parent.current) return;
    autoAnimate(parent.current);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("settingsTab", tab);
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
            "linear-gradient(45deg, primary.main 30%, primary.light 90%)",
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
          <SettingsIcon sx={{ fontSize: "2rem" }} />
          الإعدادات
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
          إدارة وتخصيص إعدادات النظام
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
            icon={<SettingsIcon />}
            iconPosition="start"
            label="الاساسيات"
            value="1"
          />
          <Tab
            icon={<PeopleIcon />}
            iconPosition="start"
            label="المستخدمين"
            value="2"
          />
          <Tab
            icon={<SecurityIcon />}
            iconPosition="start"
            label="الصلاحيات"
            value="3"
          />
          <Tab
            icon={<GroupsIcon />}
            iconPosition="start"
            label="العملاء و الموردين"
            value="4"
          />
          <Tab
            icon={<PaletteIcon />}
            iconPosition="start"
            label="الثيمات"
            value="5"
          />{" "}
          <Tab
            icon={<PrintIcon />}
            iconPosition="start"
            label="إعدادات الطابعة"
            value="6"
          />
          <Tab
            icon={<TelegramIcon />}
            iconPosition="start"
            label="تليجرام"
            value="7"
          />
        </TabList>

        <Divider sx={{ opacity: 0.3 }} />

        <Box ref={parent} sx={{ p: 4 }}>
          <TabPanel value="1" sx={{ p: 0 }}>
            <Basics />
          </TabPanel>
          <TabPanel value="2" sx={{ p: 0 }}>
            <Users />
          </TabPanel>
          <TabPanel value="3" sx={{ p: 0 }}>
            <Scopes />
          </TabPanel>
          <TabPanel value="4" sx={{ p: 0 }}>
            <Parties />
          </TabPanel>
          <TabPanel value="5" sx={{ p: 0 }}>
            <Themes />
          </TabPanel>{" "}
          <TabPanel value="6" sx={{ p: 0 }}>
            <PrinterSettings />
          </TabPanel>
          <TabPanel value="7" sx={{ p: 0 }}>
            <Telegram />
          </TabPanel>
        </Box>
      </TabContext>
    </Card>
  );
};

export default Settings;

import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Card, Divider, Tab } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import Users from "./Components/Users";
import Basics from "./Components/Basics";
import Scopes from "./Components/Scopes";
import Parties from "./Components/Parties";
import autoAnimate from "@formkit/auto-animate";

const Settings = () => {
  const [tab, setTab] = useState("1");
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parent.current) return;
    autoAnimate(parent.current);
  }, []);

  return (
    <Card elevation={3} sx={{ px: 3, py: 2 }}>
      <TabContext value={tab}>
        <TabList onChange={(_, value) => setTab(value)}>
          <Tab label="الاساسيات" value="1" />
          <Tab label="المستخدمين" value="2" />
          <Tab label="الصلاحيات" value="3" />
          <Tab label="العملاء و الموردين" value="4" />
        </TabList>
        <Divider />
        <TabPanel value="1">
          <Basics />
        </TabPanel>
        <TabPanel value="2">
          <Users />
        </TabPanel>
        <TabPanel value="3">
          <Scopes />
        </TabPanel>
        <TabPanel value="4">
          <Parties />
        </TabPanel>
      </TabContext>
    </Card>
  );
};

export default Settings;

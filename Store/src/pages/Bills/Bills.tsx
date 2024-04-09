import { Card, Grid, Typography } from "@mui/material";
import { ViewContainer } from "../Shared/Utils";
import React, { useCallback, useEffect, useState } from "react";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/ar-sa";
import axios from "axios";
import LoadingScreen from "../Shared/LoadingScreen";
import { Bill as BillType } from "../../utils/types";
import { GridComponents, VirtuosoGrid } from "react-virtuoso";
import Bill from "./Components/Bill";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";

const gridComponents: GridComponents = {
  Item: React.forwardRef<HTMLDivElement>((props, ref) => (
    <Grid item xs={6} {...props} ref={ref} />
  )),
  List: React.forwardRef<HTMLDivElement>((props, ref) => (
    <Grid container spacing={3} {...props} ref={ref} sx={{ p: 3 }} />
  )),
};

const Bills = () => {
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("day"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs().endOf("day"));
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<BillType[]>([]);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const getBills = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<BillType[]>(
        "http://localhost:8000/bills",
        {
          params: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          },
        }
      );
      setBills(data);
    } catch (error) {
      console.log(error);
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    getBills();
  }, [startDate, endDate]);

  return (
    <ViewContainer>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h4">الفواتير</Typography>
                <Typography variant="body1">
                  قم بتحديد الفترة لعرض الفواتير
                </Typography>
              </Grid>
              <Grid item container gap={3} xs={12}>
                <LocalizationProvider
                  dateAdapter={AdapterDayjs}
                  adapterLocale="ar-sa"
                >
                  <DateTimePicker
                    label="من"
                    value={startDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setStartDate(newValue);
                    }}
                    disableFuture
                  />
                </LocalizationProvider>

                <LocalizationProvider
                  dateAdapter={AdapterDayjs}
                  adapterLocale="ar-sa"
                >
                  <DateTimePicker
                    label="الى"
                    value={endDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setEndDate(newValue);
                    }}
                  />
                </LocalizationProvider>
              </Grid>
            </Grid>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card
            elevation={3}
            sx={{
              position: "relative",
              py: 2,
            }}
          >
            <LoadingScreen loading={loading} />
            <VirtuosoGrid
              style={{ height: 600 }}
              data={bills}
              itemContent={(_, bill) => (
                <Bill bill={bill} setMsg={setMsg} getBills={getBills} />
              )}
              components={gridComponents}
            />
          </Card>
        </Grid>
      </Grid>
    </ViewContainer>
  );
};

export default Bills;

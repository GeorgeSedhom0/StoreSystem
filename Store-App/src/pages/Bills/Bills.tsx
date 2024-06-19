import {
  Card,
  Grid,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/ar-sa";
import axios from "axios";
import LoadingScreen from "../Shared/LoadingScreen";
import { Bill as BillType } from "../../utils/types";
import { TableVirtuoso } from "react-virtuoso";
import Bill from "./Components/Bill";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";

const Bills = () => {
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("day"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs().endOf("day"));
  const [loading, setLoading] = useState(false);
  const [bills, setBills] = useState<BillType[]>([]);
  const [filteredBills, setFilteredBills] = useState<BillType[]>([]);
  const [filters, setFilters] = useState<string[]>([
    "cash",
    "BNPL",
    "buy",
    "return",
  ]);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [printer, setPrinter] = useState<any | null>(null);

  const getBills = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<BillType[]>(
        import.meta.env.VITE_SERVER_URL + "/bills",
        {
          params: {
            start_date: startDate.format("YYYY-MM-DDTHH:mm:ss"),
            end_date: endDate.format("YYYY-MM-DDTHH:mm:ss"),
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

  const total = filteredBills.reduce((acc, bill) => acc + bill.total, 0);

  return (
    <>
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

                <FormControl>
                  <InputLabel>نوع الفانورة</InputLabel>
                  <Select
                    value={filters}
                    onChange={(e) => setFilters(e.target.value)}
                    multiple
                  >
                    <MenuItem value="cash">نقدي</MenuItem>
                    <MenuItem value="BNPL">آجل</MenuItem>
                    <MenuItem value="buy">شراء</MenuItem>
                    <MenuItem value="return">مرتجع</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2">المجموع: {total}</Typography>
              </Grid>
            </Grid>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card
            elevation={3}
            sx={{
              position: "relative",
              height: 600,
            }}
          >
            <LoadingScreen loading={loading} />
            <TableVirtuoso
              fixedHeaderContent={fixedHeaderContent}
              components={VirtuosoTableComponents}
              data={filteredBills}
              itemContent={(_, bill) => (
                <Bill
                  bill={bill}
                  setMsg={setMsg}
                  printer={printer}
                  setPrinter={setPrinter}
                />
              )}
            />
          </Card>
        </Grid>
      </Grid>
    </>
  );
};

export default Bills;

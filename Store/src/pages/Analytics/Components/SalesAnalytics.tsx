import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Card,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  useTheme,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import EChartsReact from "echarts-for-react";
import tableIcon from "/table.png";
import { exportToExcel } from "../utils";

type SalesAnalyticsType = [string, number][];
const getAnalytics = async (
  startDate: string,
  endDate: string,
  types: string[]
) => {
  const { data } = await axios.post<SalesAnalyticsType>(
    import.meta.env.VITE_SERVER_URL + "/analytics/sales",
    types,
    {
      params: {
        start_date: startDate,
        end_date: endDate,
      },
    }
  );
  return data;
};

const SalesAnalytics = () => {
  const [startDate, setStartDate] = useState<Dayjs>(
    dayjs().subtract(1, "month")
  );
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const [types, setTypes] = useState<string[]>(["sell", "return"]);

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching } = useQuery({
    queryKey: ["analytics", "sales", startDate, endDate, types],
    queryFn: () =>
      getAnalytics(startDate.toISOString(), endDate.toISOString(), types),
    initialData: [],
  });

  const setRange = useCallback((range: "day" | "week" | "month") => {
    switch (range) {
      case "day":
        setStartDate(dayjs().startOf("day"));
        setEndDate(dayjs().endOf("day"));
        break;
      case "week":
        setStartDate(dayjs().startOf("week"));
        setEndDate(dayjs().endOf("week"));
        break;
      case "month":
        setStartDate(dayjs().startOf("month"));
        setEndDate(dayjs().endOf("month"));
        break;
      default:
        break;
    }
  }, []);

  const options = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
      },
      legend: {},
      toolbox: {
        feature: {
          magicType: {
            type: ["line", "bar"],
          },
          saveAsImage: {},
          myTool: {
            show: true,
            title: "Export to Excel",
            icon: `image://${tableIcon}`,
            onclick: () => {
              const exportData = [["التاريخ", "الاجمالى"], ...data];

              exportToExcel(exportData);
            },
          },
        },
        show: true,
      },
      xAxis: {
        type: "time",
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          name: "الاجمالى",
          type: "bar",
          smooth: true,
          data: data,
        },
      ],
    }),
    [data]
  );

  return (
    <Grid item xs={12}>
      <Card elevation={3} sx={{ px: 3, py: 2, position: "relative" }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h4">احصائيات المبيعات</Typography>
            <Typography variant="body1">
              قم بتحديد الفترة لعرض الاحصائيات
            </Typography>
          </Grid>

          <Grid item container gap={3} xs={12}>
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                label="من"
                value={startDate}
                onChange={(newValue) => {
                  if (!newValue) return;
                  setStartDate(newValue);
                }}
                disableFuture
                disabled={isFetching}
              />
            </LocalizationProvider>

            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                label="الى"
                value={endDate}
                onChange={(newValue) => {
                  if (!newValue) return;
                  setEndDate(newValue);
                }}
                disabled={isFetching}
              />
            </LocalizationProvider>

            <FormControl>
              <InputLabel>نوع الفاتورة</InputLabel>
              <Select
                multiple
                label="نوع الفاتورة"
                value={types}
                onChange={(e) => setTypes(e.target.value as string[])}
                sx={{
                  width: 200,
                }}
              >
                <MenuItem value="sell">نقدي</MenuItem>
                <MenuItem value="BNPL">آجل</MenuItem>
                <MenuItem value="buy">شراء</MenuItem>
                <MenuItem value="return">مرتجع</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <ButtonGroup>
              <Button onClick={() => setRange("day")}>اليوم</Button>
              <Button onClick={() => setRange("week")}>هذا الاسبوع</Button>
              <Button onClick={() => setRange("month")}>هذا الشهر</Button>
            </ButtonGroup>
          </Grid>
          <Grid item xs={12}>
            الاجمالى: {data.reduce((acc, [_, v]) => acc + v, 0)}
          </Grid>
          <Grid item xs={12}>
            <EChartsReact
              option={options}
              style={{ height: 500 }}
              theme={mode}
              notMerge={true}
            />
          </Grid>
        </Grid>
      </Card>
    </Grid>
  );
};

export default SalesAnalytics;

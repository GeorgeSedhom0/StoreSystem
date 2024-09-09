import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useMemo, useState } from "react";
import { Button, ButtonGroup, Card, Grid, Typography } from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import EChartsReact from "echarts-for-react";
import tableIcon from "/table.png";
import { exportToExcel } from "../utils";

export interface ProductsAnalyticsType {
  [key: string]: [string, number][];
}
const getAnalytics = async (startDate: string, endDate: string) => {
  const { data } = await axios.get<ProductsAnalyticsType>(
    import.meta.env.VITE_SERVER_URL + "/analytics/top-products",
    {
      params: {
        start_date: startDate,
        end_date: endDate,
      },
    }
  );
  return data;
};

const TopProductsAnalytics = () => {
  const [startDate, setStartDate] = useState<Dayjs>(
    dayjs().subtract(1, "month")
  );
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());

  const { data, isFetching } = useQuery({
    queryKey: ["analytics", "top-products", startDate, endDate],
    queryFn: () => getAnalytics(startDate.toISOString(), endDate.toISOString()),
    initialData: {},
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
              const groupedByDate = new Map<string, Map<string, number>>();
              const allDates = new Set<string>();
              const allProducts = new Set<string>();

              // Collect all unique dates and products
              Object.entries(data).forEach(([name, values]) => {
                allProducts.add(name);
                values.forEach(([date, value]) => {
                  allDates.add(date);
                });
              });

              // Initialize each product's data for all dates with 0
              allDates.forEach((date) => {
                if (!groupedByDate.has(date)) {
                  groupedByDate.set(date, new Map<string, number>());
                }
                allProducts.forEach((product) => {
                  groupedByDate.get(date)!.set(product, 0);
                });
              });

              // Populate the actual values
              Object.entries(data).forEach(([name, values]) => {
                values.forEach(([date, value]) => {
                  groupedByDate.get(date)!.set(name, value);
                });
              });

              const exportData = [
                ["التاريخ", "المنتج", "الكمية المباعة"],
                ...Array.from(groupedByDate.entries()).flatMap(
                  ([date, products]) =>
                    Array.from(products.entries()).map(([name, value]) => [
                      date,
                      name,
                      value,
                    ])
                ),
              ];

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
      series: Object.entries(data).map(([name, values]) => ({
        name,
        type: "line",
        smooth: true,
        data: values,
      })),
    }),
    [data]
  );

  return (
    <Grid item xs={12}>
      <Card elevation={3} sx={{ px: 3, py: 2, position: "relative" }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h4">المنتجات الاكثر مبيعا</Typography>
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
          </Grid>
          <Grid item xs={12}>
            <ButtonGroup>
              <Button onClick={() => setRange("day")}>اليوم</Button>
              <Button onClick={() => setRange("week")}>هذا الاسبوع</Button>
              <Button onClick={() => setRange("month")}>هذا الشهر</Button>
            </ButtonGroup>
          </Grid>
          <Grid item xs={12}>
            <EChartsReact
              option={options}
              style={{ height: 500 }}
              theme="dark"
              notMerge={true}
            />
          </Grid>
        </Grid>
      </Card>
    </Grid>
  );
};

export default TopProductsAnalytics;

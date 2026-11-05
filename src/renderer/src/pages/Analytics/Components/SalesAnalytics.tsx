import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useContext, useMemo, useState } from "react";
import {
  Card,
  FormControl,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  useTheme,
} from "@mui/material";
import EChartsReact from "echarts-for-react";
import { exportToExcel } from "../utils";
import { StoreContext } from "@renderer/StoreDataProvider";
import { localTimestamp } from "../../utils/functions";
import {
  ChartHeader,
  DateRangeFilter,
  ExportExcelButton,
  chartGrid,
  chartToolbox,
  formatMoney,
  useChartHeight,
  useIsPhone,
} from "./ChartTools";

type SalesAnalyticsType = [string, number, boolean?][];
const getAnalytics = async (
  startDate: string,
  endDate: string,
  types: string[],
  storeId: number,
) => {
  const { data } = await axios.post<SalesAnalyticsType>(
    "/analytics/sales",
    types,
    {
      params: {
        start_date: startDate,
        end_date: endDate,
        store_id: storeId,
      },
    },
  );
  return data;
};

const SalesAnalytics = () => {
  const [startDate, setStartDate] = useState<Dayjs>(
    dayjs().subtract(1, "month"),
  );
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const [types, setTypes] = useState<string[]>(["sell", "return"]);
  const { storeId } = useContext(StoreContext);
  const isPhone = useIsPhone();
  const chartHeight = useChartHeight(500, 320);

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching, isError } = useQuery({
    queryKey: ["analytics", "sales", startDate, endDate, types, storeId],
    queryFn: () =>
      getAnalytics(
        localTimestamp(startDate.startOf("day")),
        localTimestamp(endDate.endOf("day")),
        types,
        storeId,
      ),
    initialData: [],
  });

  const handleExport = () =>
    exportToExcel(
      [
        ["التاريخ", "الإجمالي", "نوع البيانات"],
        ...data.map(([date, value, is_prediction]) => [
          date,
          value,
          is_prediction ? "توقع" : "فعلي",
        ]),
      ],
      "إحصائيات المبيعات",
    );

  const options: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        confine: true,
        valueFormatter: (v) => formatMoney(Number(v)),
      },
      legend: {},
      toolbox: chartToolbox(),
      grid: chartGrid(isPhone),
      xAxis: {
        type: "time",
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          name: "الإجمالي",
          type: "bar",
          data: data.map(([date, value, is_prediction]) => ({
            value: [date, value],
            itemStyle: is_prediction
              ? {
                  color: "rgba(255, 165, 0, 0.6)",
                  borderColor: "#FFA500",
                  borderWidth: 2,
                  borderType: "dashed",
                }
              : undefined,
          })),
        },
      ],
    }),
    [data, isPhone],
  );

  return (
    <Grid2 size={12}>
      <Card
        elevation={3}
        sx={{ px: { xs: 1.5, sm: 3 }, py: 2, position: "relative" }}
      >
        <Grid2 container spacing={2}>
          <Grid2 size={12}>
            <ChartHeader
              title="إحصائيات المبيعات"
              subtitle="حدد الفترة لعرض الإحصائيات"
              actions={
                <ExportExcelButton
                  onClick={handleExport}
                  disabled={data.length === 0}
                />
              }
            />
          </Grid2>

          <Grid2 size={12}>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
              disabled={isFetching}
            >
              <FormControl fullWidth>
                <InputLabel>نوع الفاتورة</InputLabel>
                <Select
                  multiple
                  label="نوع الفاتورة"
                  value={types}
                  onChange={(e) => setTypes(e.target.value as string[])}
                >
                  <MenuItem value="sell">نقدي</MenuItem>
                  <MenuItem value="BNPL">آجل</MenuItem>
                  <MenuItem value="buy">شراء</MenuItem>
                  <MenuItem value="return">مرتجع</MenuItem>
                </Select>
              </FormControl>
            </DateRangeFilter>
          </Grid2>
          <Grid2 size={12}>
            <Typography sx={{ fontWeight: 600 }}>
              الإجمالي: {formatMoney(data.reduce((acc, [, v]) => acc + v, 0))}
            </Typography>
          </Grid2>
          <Grid2 size={12}>
            {isError ? (
              <Typography color="error" sx={{ py: 4, textAlign: "center" }}>
                تعذر تحميل البيانات
              </Typography>
            ) : !isFetching && data.length === 0 ? (
              <Typography
                color="text.secondary"
                sx={{ py: 4, textAlign: "center" }}
              >
                لا توجد مبيعات في هذه الفترة
              </Typography>
            ) : (
              <EChartsReact
                option={options}
                style={{ height: chartHeight }}
                theme={mode}
                notMerge={true}
                loadingOption={{
                  text: "جار التحميل...",
                  color: "#1890ff",
                  textColor: "#fff",
                  maskColor: "rgba(0, 0, 0, 0.45)",
                }}
                showLoading={isFetching}
              />
            )}
          </Grid2>
        </Grid2>
      </Card>
    </Grid2>
  );
};

export default SalesAnalytics;

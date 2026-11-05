import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useMemo, useState, useContext } from "react";
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

interface ShiftsAnalytics {
  start_date_time: string;
  end_date_time: string;
  total: number;
  is_prediction?: boolean;
}
const getAnalytics = async (
  startDate: string,
  endDate: string,
  types: string[],
  storeId: number,
) => {
  const { data } = await axios.post<ShiftsAnalytics[]>(
    "/shifts-analytics",
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

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("ar-eg", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

const ShiftsAnalytics = () => {
  const [startDate, setStartDate] = useState<Dayjs>(
    dayjs().subtract(1, "month"),
  );
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const [requiredTypes, setRequiredTypes] = useState<string[]>([
    "sell",
    "return",
  ]);
  const { storeId } = useContext(StoreContext);
  const isPhone = useIsPhone();
  const chartHeight = useChartHeight(500, 320);

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching, isError } = useQuery({
    queryKey: ["analytics", startDate, endDate, requiredTypes, storeId],
    queryFn: () =>
      getAnalytics(
        localTimestamp(startDate.startOf("day")),
        localTimestamp(endDate.endOf("day")),
        requiredTypes,
        storeId,
      ),
    initialData: [],
  });

  const handleExport = () =>
    exportToExcel(
      [
        ["بداية الشفت", "نهاية الشفت", "الإجمالي", "نوع البيانات"],
        ...data.map(
          ({ start_date_time, end_date_time, total, is_prediction }) => [
            fmtDateTime(start_date_time),
            fmtDateTime(end_date_time),
            total,
            is_prediction ? "توقع" : "فعلي",
          ],
        ),
      ],
      "إحصائيات الشفتات",
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
        type: "category",
        axisLabel: { hideOverlap: true, rotate: isPhone ? 30 : 0 },
        data: data.map(({ start_date_time, end_date_time, is_prediction }) => {
          const label = isPhone
            ? fmtDateTime(start_date_time)
            : fmtDateTime(start_date_time) + " - " + fmtDateTime(end_date_time);
          return is_prediction ? `🔮 ${label}` : label;
        }),
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          name: "الإجمالي",
          type: "bar",
          data: data.map(({ total, is_prediction }) => ({
            value: total,
            itemStyle: is_prediction
              ? {
                  color: "rgba(255, 165, 0, 0.6)",
                  borderColor: "#FFA500",
                  borderWidth: 2,
                  borderType: "dashed",
                }
              : undefined,
            is_prediction,
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
              title="إحصائيات الشفتات"
              subtitle={
                <>
                  حدد الفترة لعرض الإحصائيات. الشفت الحالي لا يدخل في التقرير
                  حتى إغلاقه.
                </>
              }
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
                  value={requiredTypes}
                  onChange={(e) =>
                    setRequiredTypes(
                      Array.isArray(e.target.value)
                        ? e.target.value
                        : [e.target.value],
                    )
                  }
                  label="نوع الفاتورة"
                  multiple
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
              الإجمالي:{" "}
              {formatMoney(data.reduce((acc, { total }) => acc + total, 0))}
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
                لا توجد شفتات مغلقة في هذه الفترة
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

export default ShiftsAnalytics;

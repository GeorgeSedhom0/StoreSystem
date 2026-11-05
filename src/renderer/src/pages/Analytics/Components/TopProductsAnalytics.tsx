import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useMemo, useState, useContext } from "react";
import { Card, Grid2, Typography, useTheme } from "@mui/material";
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
  useChartHeight,
  useIsPhone,
} from "./ChartTools";

export interface ProductsAnalyticsType {
  [key: string]: [string, number, boolean?][];
}

const getAnalytics = async (
  startDate: string,
  endDate: string,
  storeId: number,
) => {
  const { data } = await axios.get<ProductsAnalyticsType>(
    "/analytics/top-products",
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

const TopProductsAnalytics = () => {
  const [startDate, setStartDate] = useState<Dayjs>(
    dayjs().subtract(1, "month"),
  );
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const { storeId } = useContext(StoreContext);
  const isPhone = useIsPhone();
  const chartHeight = useChartHeight(500, 340);

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching, isError } = useQuery({
    queryKey: ["analytics", "top-products", startDate, endDate, storeId],
    queryFn: () =>
      getAnalytics(
        localTimestamp(startDate.startOf("day")),
        localTimestamp(endDate.endOf("day")),
        storeId,
      ),
    initialData: {} as ProductsAnalyticsType,
  });

  const isEmpty = Object.keys(data).length === 0;

  const handleExport = () =>
    exportToExcel(
      [
        ["التاريخ", "المنتج", "الكمية المباعة", "نوع البيانات"],
        ...Object.entries(data).flatMap(([name, values]) =>
          values.map(([date, value, is_prediction]) => [
            date,
            name,
            value,
            is_prediction ? "توقع" : "فعلي",
          ]),
        ),
      ],
      "المنتجات الأكثر مبيعا",
    );

  const options: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        confine: true,
      },
      legend: { type: "scroll" as const, top: isPhone ? 28 : 0 },
      toolbox: chartToolbox(),
      grid: chartGrid(isPhone, { top: isPhone ? 72 : 56 }),
      xAxis: {
        type: "time",
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: "value",
      },
      series: Object.entries(data).map(([name, values]) => ({
        name,
        type: "line",
        smooth: true,
        data: values.map(([date, value, is_prediction]) => ({
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
        lineStyle: {
          type: "solid",
        },
      })),
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
              title="المنتجات الأكثر مبيعا"
              subtitle={
                <>
                  حدد الفترة لعرض الإحصائيات
                  {Object.values(data).some((arr) =>
                    arr.some(([, , is_prediction]) => is_prediction),
                  ) && (
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ color: "orange", display: "block", mt: 0.5 }}
                    >
                      🔮 يتضمن التقرير توقعات للتواريخ المستقبلية
                    </Typography>
                  )}
                </>
              }
              actions={
                <ExportExcelButton onClick={handleExport} disabled={isEmpty} />
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
            />
          </Grid2>
          <Grid2 size={12}>
            {isError ? (
              <Typography color="error" sx={{ py: 4, textAlign: "center" }}>
                تعذر تحميل البيانات
              </Typography>
            ) : !isFetching && isEmpty ? (
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

export default TopProductsAnalytics;

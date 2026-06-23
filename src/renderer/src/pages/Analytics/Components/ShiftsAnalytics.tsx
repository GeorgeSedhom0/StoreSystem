import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useMemo, useState, useContext } from "react";
import {
  Button,
  ButtonGroup,
  Card,
  FormControl,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  useTheme,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import EChartsReact from "echarts-for-react";
import { exportToExcel } from "../utils";
import tableIcon from "./table.png";
import { StoreContext } from "@renderer/StoreDataProvider";

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

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching } = useQuery({
    queryKey: ["analytics", startDate, endDate, requiredTypes, storeId],
    queryFn: () =>
      getAnalytics(
        startDate.startOf("day").locale("en").format("M/D/YYYY, h:mm:ss A"),
        endDate.endOf("day").locale("en").format("M/D/YYYY, h:mm:ss A"),
        requiredTypes,
        storeId,
      ),
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

  const options: echarts.EChartsOption = useMemo(
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
          myTool1: {
            show: true,
            title: "Export to Excel",
            icon: `image://${tableIcon}`,
            onclick: () => {
              exportToExcel([
                ["بداية الشفت", "نهاية الشفت", "الإجمالي", "نوع البيانات"],
                ...data.map(
                  ({
                    start_date_time,
                    end_date_time,
                    total,
                    is_prediction,
                  }) => [
                    new Date(start_date_time).toLocaleString("ar-eg", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "numeric",
                    }),
                    new Date(end_date_time).toLocaleString("ar-eg", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "numeric",
                    }),
                    total,
                    is_prediction ? "توقع" : "فعلي",
                  ],
                ),
              ]);
            },
          },
        },
        show: true,
      },
      xAxis: {
        type: "category",
        data: data.map(({ start_date_time, end_date_time, is_prediction }) => {
          const label =
            new Date(start_date_time).toLocaleString("ar-eg", {
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            }) +
            " - " +
            new Date(end_date_time).toLocaleString("ar-eg", {
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            });

          return is_prediction ? `🔮 ${label}` : label;
        }),
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          type: "bar",
          smooth: true,
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
    [data],
  );

  return (
    <Grid2 size={12}>
      <Card elevation={3} sx={{ px: 3, py: 2, position: "relative" }}>
        <Grid2 container spacing={2}>
          <Grid2 size={12}>
            <Typography variant="h4">احصائيات الشفتات</Typography>
            <Typography variant="body1">
              قم بتحديد الفترة لعرض الاحصائيات
            </Typography>
            <Typography variant="body1">
              الشيفت الحالى غير مضمون فى التقرير حتى اغلاقة
            </Typography>
          </Grid2>

          <Grid2 container gap={3} size={12}>
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
              <InputLabel>نوع الفانورة</InputLabel>
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
          </Grid2>
          <Grid2 size={12}>
            <ButtonGroup>
              <Button onClick={() => setRange("day")}>اليوم</Button>
              <Button onClick={() => setRange("week")}>هذا الاسبوع</Button>
              <Button onClick={() => setRange("month")}>هذا الشهر</Button>
            </ButtonGroup>
          </Grid2>
          <Grid2 size={12}>
            الإجمالي: {data.reduce((acc, { total }) => acc + total, 0)}
          </Grid2>
          <Grid2 size={12}>
            <EChartsReact
              option={options}
              style={{ height: 500 }}
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
          </Grid2>
        </Grid2>
      </Card>
    </Grid2>
  );
};

export default ShiftsAnalytics;

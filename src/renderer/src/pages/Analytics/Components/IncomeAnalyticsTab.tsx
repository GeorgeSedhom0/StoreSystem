import {
  Grid2,
  Paper,
  Typography,
  Box,
  Card,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { Dayjs } from "dayjs";
import { useState, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import EChartsReact from "echarts-for-react";
import { useTheme } from "@mui/material";
import AnalyticsCard from "../../Shared/AnalyticsCard";
import { StoreContext } from "@renderer/StoreDataProvider";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import tableIcon from "./table.png";
import { exportToExcel } from "../utils";

interface CashFlowData {
  cash_in: number;
  cash_out: number;
  net_cash: number;
  profit: number;
  daily_cashflow: [string, number, number, number][];
  daily_profit: [string, number][];
}

const getIncomeAnalytics = async (
  startDate: string,
  endDate: string,
  storeId: number,
  method: string = "fifo",
) => {
  const { data } = await axios.get<CashFlowData>("/analytics/income", {
    params: {
      start_date: startDate,
      end_date: endDate,
      store_id: storeId,
      method: method,
    },
  });
  return data;
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
  }).format(value);
};

const IncomeAnalyticsTab = () => {
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("month"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const [method, setMethod] = useState<string>("simple");
  const { storeId } = useContext(StoreContext);

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching } = useQuery({
    queryKey: ["analytics", "income", startDate, endDate, storeId, method],
    queryFn: () =>
      getIncomeAnalytics(
        startDate.startOf("day").locale("en").format("M/D/YYYY, h:mm:ss A"),
        endDate.endOf("day").locale("en").format("M/D/YYYY, h:mm:ss A"),
        storeId,
        method,
      ),
    initialData: {
      cash_in: 0,
      cash_out: 0,
      net_cash: 0,
      profit: 0,
      daily_cashflow: [],
      daily_profit: [],
    },
  });

  const cashflowOptions: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
      },
      legend: {
        data: ["الإيرادات", "المصروفات", "صافي"],
      },
      toolbox: {
        feature: {
          magicType: {
            type: ["line", "bar", "stack"],
          },
          saveAsImage: {},
          myTool: {
            show: true,
            title: "تصدير إلى إكسل",
            icon: `image://${tableIcon}`,
            onclick: () => {
              const exportData = [
                ["التاريخ", "الإيرادات", "المصروفات", "صافي"],
                ...data.daily_cashflow.map(([date, cashIn, cashOut, net]) => [
                  date,
                  cashIn,
                  cashOut,
                  net,
                ]),
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
      series: [
        {
          name: "الإيرادات",
          type: "bar",
          data: data.daily_cashflow.map(([date, cashIn]) => [date, cashIn]),
        },
        {
          name: "المصروفات",
          type: "bar",
          data: data.daily_cashflow.map(([date, _, cashOut]) => [
            date,
            cashOut,
          ]),
        },
        {
          name: "صافي",
          type: "line",
          smooth: true,
          data: data.daily_cashflow.map(([date, _, __, net]) => [date, net]),
        },
      ],
    }),
    [data.daily_cashflow],
  );

  const profitOptions: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
      },
      toolbox: {
        feature: {
          magicType: {
            type: ["line", "bar"],
          },
          saveAsImage: {},
          myTool: {
            show: true,
            title: "تصدير إلى إكسل",
            icon: `image://${tableIcon}`,
            onclick: () => {
              const exportData = [["التاريخ", "الربح"], ...data.daily_profit];
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
          name: "الربح",
          type: "bar",
          color: "#4CAF50",
          data: data.daily_profit,
        },
      ],
    }),
    [data.daily_profit],
  );

  return (
    <Grid2 container spacing={2}>
      <Grid2 size={12}>
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            تحليل الدخل والمصروفات فى المدة المحددة
          </Typography>

          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                label="من"
                value={startDate}
                onChange={(newValue) => {
                  if (newValue) setStartDate(newValue);
                }}
                slotProps={{ textField: { fullWidth: true } }}
                disableFuture
                disabled={isFetching}
              />
            </LocalizationProvider>

            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                label="إلى"
                value={endDate}
                onChange={(newValue) => {
                  if (newValue) setEndDate(newValue);
                }}
                slotProps={{ textField: { fullWidth: true } }}
                disabled={isFetching}
              />
            </LocalizationProvider>

            <FormControl fullWidth disabled={isFetching}>
              <InputLabel>طريقة حساب الأرباح</InputLabel>
              <Select
                value={method}
                label="طريقة حساب الأرباح"
                onChange={(e) => setMethod(e.target.value)}
              >
                <MenuItem value="simple">السعر الثابت (البسيط)</MenuItem>
                <MenuItem value="fifo">FIFO (الوارد أولاً يصرف أولاً)</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Paper>
      </Grid2>

      <Grid2 container size={12} spacing={2}>
        <Grid2 size={3}>
          <AnalyticsCard
            title="إجمالي الإيرادات"
            value={formatCurrency(data.cash_in)}
            color="success.main"
            loading={isFetching}
            icon={<TrendingUpIcon fontSize="large" color="success" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="إجمالي المصروفات"
            value={formatCurrency(data.cash_out)}
            color="error.main"
            loading={isFetching}
            icon={<TrendingDownIcon fontSize="large" color="error" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="صافي النقد"
            value={formatCurrency(data.net_cash)}
            color={data.net_cash >= 0 ? "primary.main" : "error.main"}
            loading={isFetching}
            icon={<AccountBalanceIcon fontSize="large" color="primary" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="إجمالي الأرباح"
            value={formatCurrency(data.profit)}
            color="info.main"
            loading={isFetching}
            icon={<ShowChartIcon fontSize="large" color="info" />}
          />
        </Grid2>
      </Grid2>

      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            التدفق النقدي اليومي
          </Typography>
          <EChartsReact
            option={cashflowOptions}
            style={{ height: 400 }}
            theme={mode}
            notMerge={true}
          />
        </Card>
      </Grid2>

      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            الأرباح اليومية
          </Typography>
          <EChartsReact
            option={profitOptions}
            style={{ height: 400 }}
            theme={mode}
            notMerge={true}
          />
        </Card>
      </Grid2>
    </Grid2>
  );
};

export default IncomeAnalyticsTab;

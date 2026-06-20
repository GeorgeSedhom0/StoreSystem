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
  Button,
} from "@mui/material";
import { PictureAsPdf as PictureAsPdfIcon } from "@mui/icons-material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { Dayjs } from "dayjs";
import { useState, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import EChartsReact from "echarts-for-react";
import { useTheme } from "@mui/material";
import AnalyticsCard from "../../Shared/AnalyticsCard";
import usePaymentMethods from "../../Shared/hooks/usePaymentMethods";
import { StoreContext } from "@renderer/StoreDataProvider";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import PaymentsIcon from "@mui/icons-material/Payments";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import PercentIcon from "@mui/icons-material/Percent";
import tableIcon from "./table.png";
import { exportToExcel } from "../utils";
import { buildIncomeReportHtml, exportPdfDocument } from "../../utils/a4Reports";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";

interface PaymentMethodStat {
  method: string;
  total: number;
  bills_count: number;
}

interface CashFlowData {
  cash_in: number;
  cash_out: number;
  net_cash: number;
  profit: number;
  daily_cashflow: [string, number, number, number][];
  daily_profit: [string, number][];
  payment_method_breakdown: PaymentMethodStat[];
  payment_method_trend: {
    dates: string[];
    series: { name: string; data: number[] }[];
  };
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
  const { storeId, store } = useContext(StoreContext);
  const { paymentMethods } = usePaymentMethods();
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const handleExportToPdf = async () => {
    try {
      const html = buildIncomeReportHtml({
        store,
        startDate: startDate.format("YYYY/MM/DD"),
        endDate: endDate.format("YYYY/MM/DD"),
        methodLabel:
          method === "fifo" ? "FIFO (الوارد أولاً يصرف أولاً)" : "السعر الثابت (البسيط)",
        cashIn: data.cash_in,
        cashOut: data.cash_out,
        netCash: data.net_cash,
        profit: data.profit,
        dailyCashflow: data.daily_cashflow,
        dailyProfit: data.daily_profit,
        paymentBreakdown: data.payment_method_breakdown ?? [],
      });
      const result = await exportPdfDocument({
        fileName: `income-${startDate.format("YYYY-MM-DD")}-${endDate.format("YYYY-MM-DD")}.pdf`,
        html,
      });
      if (result?.cancelled) return;
      if (!result?.success) throw new Error(result?.error || "export failed");
      setMsg({ type: "success", text: "تم تصدير التقرير المالي PDF بنجاح" });
    } catch (error) {
      console.error("Income PDF export failed:", error);
      setMsg({ type: "error", text: "فشل تصدير التقرير المالي PDF" });
    }
  };

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
      payment_method_breakdown: [],
      payment_method_trend: { dates: [], series: [] },
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

  // --- Payment method composition (cash vs digital, share, trend) ---
  const cashName = paymentMethods[0]?.name;
  const paymentBreakdown = data.payment_method_breakdown ?? [];
  const paymentTotal = paymentBreakdown.reduce((acc, m) => acc + m.total, 0);
  const cashTotal = paymentBreakdown
    .filter((m) => m.method === cashName)
    .reduce((acc, m) => acc + m.total, 0);
  const digitalTotal = paymentTotal - cashTotal;
  const digitalShare =
    paymentTotal > 0 ? Math.round((digitalTotal / paymentTotal) * 100) : 0;

  const paymentDonut: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0 },
      toolbox: { feature: { saveAsImage: {} }, show: true },
      series: [
        {
          name: "حسب طريقة الدفع",
          type: "pie",
          radius: ["45%", "70%"],
          avoidLabelOverlap: true,
          label: { formatter: "{b}\n{d}%" },
          data: (data.payment_method_breakdown ?? [])
            .filter((m) => m.total > 0)
            .map((m) => ({ value: Number(m.total.toFixed(2)), name: m.method })),
        },
      ],
    }),
    [data.payment_method_breakdown],
  );

  const paymentTrendOptions: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { bottom: 0 },
      toolbox: {
        feature: {
          // Toggle absolute stack vs. 100% view via tiling/stack
          magicType: { type: ["bar", "line"] },
          saveAsImage: {},
        },
        show: true,
      },
      grid: { bottom: 60 },
      xAxis: {
        type: "category",
        data: (data.payment_method_trend ?? { dates: [] }).dates,
      },
      yAxis: { type: "value" },
      series: (data.payment_method_trend ?? { series: [] }).series.map((s) => ({
        name: s.name,
        type: "bar",
        stack: "total",
        emphasis: { focus: "series" },
        data: s.data,
      })),
    }),
    [data.payment_method_trend],
  );

  const hasPaymentData = paymentBreakdown.length > 0;

  return (
    <Grid2 container spacing={2}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 size={12}>
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
              mb: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="h6">
              تحليل الدخل والمصروفات فى المدة المحددة
            </Typography>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={handleExportToPdf}
              disabled={isFetching}
            >
              تصدير PDF
            </Button>
          </Box>

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
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
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

      {/* Payment methods: how sales revenue is collected */}
      {hasPaymentData && (
        <>
          <Grid2 size={12}>
            <Typography variant="h6" sx={{ mt: 1 }}>
              تحصيل المبيعات حسب طريقة الدفع
            </Typography>
          </Grid2>

          <Grid2 container size={12} spacing={2}>
            <Grid2 size={4}>
              <AnalyticsCard
                title={`مدفوعات نقدية${cashName ? ` (${cashName})` : ""}`}
                value={formatCurrency(cashTotal)}
                color="success.main"
                loading={isFetching}
                icon={<PaymentsIcon fontSize="large" color="success" />}
              />
            </Grid2>
            <Grid2 size={4}>
              <AnalyticsCard
                title="مدفوعات غير نقدية"
                value={formatCurrency(digitalTotal)}
                color="info.main"
                loading={isFetching}
                icon={<CreditCardIcon fontSize="large" color="info" />}
              />
            </Grid2>
            <Grid2 size={4}>
              <AnalyticsCard
                title="نسبة المدفوعات غير النقدية"
                value={`${digitalShare}%`}
                color={digitalShare >= 50 ? "info.main" : "text.primary"}
                loading={isFetching}
                icon={<PercentIcon fontSize="large" color="info" />}
              />
            </Grid2>
          </Grid2>

          <Grid2 size={5}>
            <Card elevation={3} sx={{ p: 2, height: 420 }}>
              <Typography variant="h6" gutterBottom>
                توزيع التحصيل حسب طريقة الدفع
              </Typography>
              <EChartsReact
                option={paymentDonut}
                style={{ height: 360 }}
                theme={mode}
                notMerge
              />
            </Card>
          </Grid2>
          <Grid2 size={7}>
            <Card elevation={3} sx={{ p: 2, height: 420 }}>
              <Typography variant="h6" gutterBottom>
                تطور طرق الدفع عبر الوقت
              </Typography>
              <EChartsReact
                option={paymentTrendOptions}
                style={{ height: 360 }}
                theme={mode}
                notMerge
              />
            </Card>
          </Grid2>
        </>
      )}
    </Grid2>
  );
};

export default IncomeAnalyticsTab;

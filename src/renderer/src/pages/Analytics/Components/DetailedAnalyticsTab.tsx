import {
  Grid2,
  Paper,
  Typography,
  Box,
  Card,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
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
import PaidIcon from "@mui/icons-material/Paid";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SummarizeIcon from "@mui/icons-material/Summarize";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import tableIcon from "./table.png";
import { exportToExcel } from "../utils";

type Series2 = [string, number][];
type Series3 = [string, number, number][];

interface DetailedAnalyticsResponse {
  period: { start_date: string; end_date: string };
  cards: {
    total_sales: number;
    total_profit_fifo: number;
    non_bill_cash_in: number;
    non_bill_cash_out: number;
    total_profit_net: number;
    bills_count: number;
    avg_bill_total: number;
    avg_discount: number;
  };
  overview: {
    cash_in_series: Series2;
    profit_series: [string, number][]; // [date, profit]
  };
  top_products: Array<{
    product_id: number;
    name: string;
    total_units_sold: number;
    total_sales_value: number;
    total_profit_fifo: number;
    realized_margin_pct: number;
    avg_cost_per_unit: number;
    current_price: number;
    current_price_margin_pct: number;
  }>;
  clients: {
    new: { count: number; total_sales: number };
    returning_lt5: { count: number; total_sales: number };
    loyal_gte5: { count: number; total_sales: number };
  };
  cash_flow_daily: Series3; // [date, cash_in, cash_out]
  inventory_net_value_3m: [string, number][]; // [date, net_value]
}

const getDetailedAnalytics = async (
  startDate: string,
  endDate: string,
  storeId: number,
) => {
  const { data } = await axios.get<DetailedAnalyticsResponse>(
    "/detailed-analytics",
    {
      params: {
        start_date: startDate, // YYYY-MM-DD
        end_date: endDate, // YYYY-MM-DD
        store_id: storeId,
      },
    },
  );
  return data;
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP" }).format(
    value || 0,
  );

const DetailedAnalyticsTab = () => {
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("month"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const { storeId } = useContext(StoreContext);

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching } = useQuery({
    queryKey: [
      "analytics",
      "detailed",
      startDate.format("YYYY-MM-DD"),
      endDate.format("YYYY-MM-DD"),
      storeId,
    ],
    queryFn: () =>
      getDetailedAnalytics(
        startDate.format("YYYY-MM-DD"),
        endDate.format("YYYY-MM-DD"),
        storeId,
      ),
    initialData: {
      period: { start_date: "", end_date: "" },
      cards: {
        total_sales: 0,
        total_profit_fifo: 0,
        non_bill_cash_in: 0,
        non_bill_cash_out: 0,
        total_profit_net: 0,
        bills_count: 0,
        avg_bill_total: 0,
        avg_discount: 0,
      },
      overview: { cash_in_series: [], profit_series: [] },
      top_products: [],
      clients: {
        new: { count: 0, total_sales: 0 },
        returning_lt5: { count: 0, total_sales: 0 },
        loyal_gte5: { count: 0, total_sales: 0 },
      },
      cash_flow_daily: [],
      inventory_net_value_3m: [],
    } as DetailedAnalyticsResponse,
  });

  // Overview: cash in vs profit series
  const overviewOptions: echarts.EChartsOption = useMemo(() => {
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["الإيرادات", "الربح FIFO"] },
      toolbox: {
        feature: {
          magicType: { type: ["line", "bar"] },
          saveAsImage: {},
          myTool: {
            show: true,
            title: "تصدير إلى إكسل",
            icon: `image://${tableIcon}`,
            onclick: () => {
              const exportData = [
                ["التاريخ", "الإيرادات", "الربح FIFO"],
                ...data.overview.cash_in_series.map(([d, cashIn], i) => [
                  d,
                  cashIn,
                  data.overview.profit_series[i]?.[1] ?? 0,
                ]),
              ];
              exportToExcel(exportData);
            },
          },
        },
        show: true,
      },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: [
        {
          name: "الإيرادات",
          type: "line",
          smooth: true,
          data: data.overview.cash_in_series,
        },
        {
          name: "الربح FIFO",
          type: "bar",
          data: data.overview.profit_series,
        },
      ],
    };
  }, [data.overview.cash_in_series, data.overview.profit_series]);

  // Cash flow daily: in vs out and net (computed)
  const cashflowOptions: echarts.EChartsOption = useMemo(() => {
    const net = data.cash_flow_daily.map(([d, cin, cout]) => [d, cin - cout]);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { data: ["الإيرادات", "المصروفات", "صافي"] },
      toolbox: {
        feature: {
          magicType: { type: ["line", "bar", "stack"] },
          saveAsImage: {},
          myTool: {
            show: true,
            title: "تصدير إلى إكسل",
            icon: `image://${tableIcon}`,
            onclick: () => {
              const exportData = [
                ["التاريخ", "الإيرادات", "المصروفات", "صافي"],
                ...data.cash_flow_daily.map(([d, cin, cout]) => [
                  d,
                  cin,
                  cout,
                  cin - cout,
                ]),
              ];
              exportToExcel(exportData);
            },
          },
        },
        show: true,
      },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: [
        {
          name: "الإيرادات",
          type: "bar",
          data: data.cash_flow_daily.map(([d, cin]) => [d, cin]),
        },
        {
          name: "المصروفات",
          type: "bar",
          data: data.cash_flow_daily.map(([d, _cin, cout]) => [d, cout]),
        },
        { name: "صافي", type: "line", smooth: true, data: net },
      ],
    };
  }, [data.cash_flow_daily]);

  // Inventory net value trend (3 months)
  const inventoryValueOptions: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      toolbox: { feature: { saveAsImage: {} }, show: true },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: [
        {
          name: "قيمة المخزون الصافية",
          type: "line",
          smooth: true,
          areaStyle: {},
          data: data.inventory_net_value_3m,
        },
      ],
    }),
    [data.inventory_net_value_3m],
  );

  // Cumulative profit (bonus insight)
  const cumulativeProfitOptions: echarts.EChartsOption = useMemo(() => {
    let cum = 0;
    const series = data.overview.profit_series.map(([d, v]) => {
      cum += v;
      return [d, cum] as [string, number];
    });
    return {
      tooltip: { trigger: "axis" },
      toolbox: { feature: { saveAsImage: {} }, show: true },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: [
        { name: "الأرباح التراكمية", type: "line", smooth: true, data: series },
      ],
    };
  }, [data.overview.profit_series]);

  const clientSalesPie: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "item" },
      legend: {},
      toolbox: { feature: { saveAsImage: {} }, show: true },
      series: [
        {
          name: "مبيعات حسب الفئة",
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: true,
          data: [
            { value: data.clients.new.total_sales, name: "عملاء جدد" },
            {
              value: data.clients.returning_lt5.total_sales,
              name: "عملاء عائدون (<5)",
            },
            {
              value: data.clients.loyal_gte5.total_sales,
              name: "عملاء أوفياء (≥5)",
            },
          ],
        },
      ],
    }),
    [data.clients],
  );

  const clientCountsBar: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      toolbox: { feature: { saveAsImage: {} }, show: true },
      xAxis: { type: "category", data: ["جدد", "عائدون (<5)", "أوفياء (≥5)"] },
      yAxis: { type: "value" },
      series: [
        {
          name: "عدد العملاء",
          type: "bar",
          data: [
            data.clients.new.count,
            data.clients.returning_lt5.count,
            data.clients.loyal_gte5.count,
          ],
        },
      ],
    }),
    [data.clients],
  );

  return (
    <Grid2 container spacing={2}>
      <Grid2 size={12}>
        <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            التحليلات التفصيلية للمدة المحددة
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                label="من"
                value={startDate}
                onChange={(val) => val && setStartDate(val)}
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
                onChange={(val) => val && setEndDate(val)}
                slotProps={{ textField: { fullWidth: true } }}
                disabled={isFetching}
              />
            </LocalizationProvider>
          </Box>
        </Paper>
      </Grid2>

      {/* Cards */}
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={3}>
          <AnalyticsCard
            title="إجمالي المبيعات"
            value={formatCurrency(data.cards.total_sales)}
            color="success.main"
            loading={isFetching}
            icon={<PaidIcon fontSize="large" color="success" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="إجمالي الربح FIFO"
            value={formatCurrency(data.cards.total_profit_fifo)}
            color="info.main"
            loading={isFetching}
            icon={<TrendingUpIcon fontSize="large" color="info" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="تحصيلات خارج الفواتير"
            value={formatCurrency(data.cards.non_bill_cash_in)}
            color="success.dark"
            loading={isFetching}
            icon={<PaidIcon fontSize="large" color="success" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="مصروفات خارج الفواتير"
            value={formatCurrency(data.cards.non_bill_cash_out)}
            color="error.main"
            loading={isFetching}
            icon={<PaidIcon fontSize="large" color="error" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="الربح الصافي (FIFO + خارج الفواتير)"
            value={formatCurrency(data.cards.total_profit_net)}
            color="warning.main"
            loading={isFetching}
            icon={<TrendingUpIcon fontSize="large" color="warning" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="عدد الفواتير"
            value={`${data.cards.bills_count}`}
            color="primary.main"
            loading={isFetching}
            icon={<ReceiptLongIcon fontSize="large" color="primary" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="متوسط قيمة الفاتورة"
            value={formatCurrency(data.cards.avg_bill_total)}
            color="secondary.main"
            loading={isFetching}
            icon={<SummarizeIcon fontSize="large" color="secondary" />}
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="متوسط الخصم"
            value={formatCurrency(data.cards.avg_discount)}
            color="secondary.dark"
            loading={isFetching}
            icon={<SummarizeIcon fontSize="large" color="secondary" />}
          />
        </Grid2>
      </Grid2>

      {/* Overview */}
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            نظرة عامة: الإيرادات مقابل ربح FIFO
          </Typography>
          <EChartsReact
            option={overviewOptions}
            style={{ height: 400 }}
            theme={mode}
            notMerge
          />
        </Card>
      </Grid2>

      {/* Top Products table */}
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="h6" gutterBottom>
              أفضل 5 منتجات
            </Typography>
            <IconButton
              onClick={() => {
                const exportData = [
                  [
                    "المنتج",
                    "الكمية المباعة",
                    "إجمالي المبيعات",
                    "إجمالي ربح FIFO",
                    "الهامش المحقق %",
                    "الهامش بسعر اليوم %",
                    "سعر حالي",
                    "متوسط التكلفة",
                  ],
                  ...data.top_products.map((p) => [
                    p.name,
                    p.total_units_sold,
                    p.total_sales_value,
                    p.total_profit_fifo,
                    p.realized_margin_pct,
                    p.current_price_margin_pct,
                    p.current_price,
                    p.avg_cost_per_unit,
                  ]),
                ];
                exportToExcel(exportData);
              }}
            >
              <img src={tableIcon} width={24} height={24} />
            </IconButton>
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>المنتج</TableCell>
                <TableCell align="right">الكمية المباعة</TableCell>
                <TableCell align="right">إجمالي المبيعات</TableCell>
                <TableCell align="right">إجمالي ربح FIFO</TableCell>
                <TableCell align="right">الهامش المحقق %</TableCell>
                <TableCell align="right">الهامش بسعر اليوم %</TableCell>
                <TableCell align="right">سعر حالي</TableCell>
                <TableCell align="right">متوسط التكلفة</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.top_products.map((p) => (
                <TableRow key={p.product_id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell align="right">{p.total_units_sold}</TableCell>
                  <TableCell align="right">
                    {formatCurrency(p.total_sales_value)}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(p.total_profit_fifo)}
                  </TableCell>
                  <TableCell align="right">
                    {p.realized_margin_pct.toFixed(1)}%
                  </TableCell>
                  <TableCell align="right">
                    {p.current_price_margin_pct.toFixed(1)}%
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(p.current_price)}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(p.avg_cost_per_unit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Grid2>

      {/* Clients analytics */}
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={6}>
          <Card elevation={3} sx={{ p: 2, height: 420 }}>
            <Typography variant="h6" gutterBottom>
              مبيعات حسب فئات العملاء
            </Typography>
            <EChartsReact
              option={clientSalesPie}
              style={{ height: 360 }}
              theme={mode}
              notMerge
            />
          </Card>
        </Grid2>
        <Grid2 size={6}>
          <Card elevation={3} sx={{ p: 2, height: 420 }}>
            <Typography variant="h6" gutterBottom>
              عدد العملاء حسب الفئة
            </Typography>
            <EChartsReact
              option={clientCountsBar}
              style={{ height: 360 }}
              theme={mode}
              notMerge
            />
          </Card>
        </Grid2>
      </Grid2>

      {/* Cash flow daily */}
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            التدفق النقدي اليومي
          </Typography>
          <EChartsReact
            option={cashflowOptions}
            style={{ height: 400 }}
            theme={mode}
            notMerge
          />
        </Card>
      </Grid2>

      {/* Inventory net value trend */}
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            قيمة المخزون الصافية (آخر 3 أشهر تقريبًا)
          </Typography>
          <EChartsReact
            option={inventoryValueOptions}
            style={{ height: 400 }}
            theme={mode}
            notMerge
          />
        </Card>
      </Grid2>

      {/* Bonus: cumulative profit */}
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            الأرباح التراكمية
          </Typography>
          <EChartsReact
            option={cumulativeProfitOptions}
            style={{ height: 400 }}
            theme={mode}
            notMerge
          />
        </Card>
      </Grid2>
    </Grid2>
  );
};

export default DetailedAnalyticsTab;

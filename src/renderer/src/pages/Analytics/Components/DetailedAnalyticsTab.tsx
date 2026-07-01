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
  ToggleButton,
  ToggleButtonGroup,
  TableContainer,
  TablePagination,
  Chip,
  Button,
  Autocomplete,
  TextField,
} from "@mui/material";
import { PictureAsPdf as PictureAsPdfIcon } from "@mui/icons-material";
import {
  buildDetailedReportHtml,
  exportPdfDocument,
} from "../../utils/a4Reports";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { Dayjs } from "dayjs";
import { useState, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import EChartsReact from "echarts-for-react";
import { useTheme } from "@mui/material";
import AnalyticsCard from "../../Shared/AnalyticsCard";
import useParties from "../../Shared/hooks/useParties";
import { StoreContext } from "@renderer/StoreDataProvider";
import { localDate } from "../../utils/functions";
import PaidIcon from "@mui/icons-material/Paid";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import SavingsIcon from "@mui/icons-material/Savings";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import RedeemIcon from "@mui/icons-material/Redeem";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import tableIcon from "./table.png";
import { exportToExcel } from "../utils";

type Series2 = [string, number][];
type Series3 = [string, number, number][];

interface DetailedAnalyticsResponse {
  period: { start_date: string; end_date: string };
  cards: {
    total_sales: number;
    purchases: number;
    operating_expenses: number;
    free_cash: number;
    total_profit_fifo: number;
    net_profit: number;
    bnpl_outstanding: number;
    bnpl_expected_profit: number;
    installment_principal: number;
    installment_collected: number;
    installment_remaining: number;
    installment_expected_profit: number;
    interstore_net: number;
    owner_in: number;
    owner_out: number;
    owner_net: number;
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
    categories: {
      new: { count: number; total_sales: number };
      returning_lt5: { count: number; total_sales: number };
      loyal_gte5: { count: number; total_sales: number };
    };
    all_clients: Array<{
      party_id: number;
      name: string;
      phone: string;
      total: number;
      bills_count: number;
      prior_count: number;
      category: string;
    }>;
  };
  payment_method_breakdown: Array<{
    method: string;
    total: number;
    bills_count: number;
  }>;
  cash_flow_daily: Series3; // [date, cash_in, cash_out]
  inventory_net_value_3m: [string, number][]; // [date, net_value]
  inventory_net_value_by_shift: [string, number][]; // [datetime, net_value] - shift end times
}

const getDetailedAnalytics = async (
  startDate: string,
  endDate: string,
  storeId: number,
  byShift: boolean,
  partyId: number | null,
) => {
  const { data } = await axios.get<DetailedAnalyticsResponse>(
    "/detailed-analytics",
    {
      params: {
        start_date: startDate, // YYYY-MM-DD
        end_date: endDate, // YYYY-MM-DD
        store_id: storeId,
        by_shift: byShift,
        ...(partyId != null ? { party_id: partyId } : {}),
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
  const [viewMode, setViewMode] = useState<"daily" | "shift">("daily");
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [clientsPage, setClientsPage] = useState(0);
  const [clientsRowsPerPage, setClientsRowsPerPage] = useState(10);
  const { storeId, store } = useContext(StoreContext);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const { parties } = useParties(setMsg);

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
      viewMode,
      selectedPartyId,
    ],
    queryFn: () =>
      getDetailedAnalytics(
        localDate(startDate),
        localDate(endDate),
        storeId,
        viewMode === "shift",
        selectedPartyId,
      ),
    initialData: {
      period: { start_date: "", end_date: "" },
      cards: {
        total_sales: 0,
        purchases: 0,
        operating_expenses: 0,
        free_cash: 0,
        total_profit_fifo: 0,
        net_profit: 0,
        bnpl_outstanding: 0,
        bnpl_expected_profit: 0,
        installment_principal: 0,
        installment_collected: 0,
        installment_remaining: 0,
        installment_expected_profit: 0,
        interstore_net: 0,
        owner_in: 0,
        owner_out: 0,
        owner_net: 0,
      },
      overview: { cash_in_series: [], profit_series: [] },
      top_products: [],
      clients: {
        categories: {
          new: { count: 0, total_sales: 0 },
          returning_lt5: { count: 0, total_sales: 0 },
          loyal_gte5: { count: 0, total_sales: 0 },
        },
        all_clients: [],
      },
      payment_method_breakdown: [],
      cash_flow_daily: [],
      inventory_net_value_3m: [],
      inventory_net_value_by_shift: [],
    } as DetailedAnalyticsResponse,
  });

  // Overview: cash in vs profit series
  const overviewOptions: echarts.EChartsOption = useMemo(() => {
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["النقد الوارد", "الربح FIFO"] },
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
                ["التاريخ", "النقد الوارد", "الربح FIFO"],
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
          name: "النقد الوارد",
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
      legend: { data: ["النقد الوارد", "النقد الصادر", "صافي"] },
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
                ["التاريخ", "النقد الوارد", "النقد الصادر", "صافي"],
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
          name: "النقد الوارد",
          type: "bar",
          data: data.cash_flow_daily.map(([d, cin]) => [d, cin]),
        },
        {
          name: "النقد الصادر",
          type: "bar",
          data: data.cash_flow_daily.map(([d, _cin, cout]) => [d, cout]),
        },
        { name: "صافي", type: "line", smooth: true, data: net },
      ],
    };
  }, [data.cash_flow_daily]);

  // Inventory net value trend
  const inventoryValueOptions: echarts.EChartsOption = useMemo(() => {
    const isShiftView = viewMode === "shift";
    const chartData = isShiftView
      ? data.inventory_net_value_by_shift
      : data.inventory_net_value_3m;

    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const p = Array.isArray(params) ? params[0] : params;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const point = p as any;
          if (!point || !point.data) return "";
          const [timeStr, value] = point.data;
          const formattedValue = new Intl.NumberFormat("en-EG", {
            style: "currency",
            currency: "EGP",
          }).format(value || 0);

          if (isShiftView) {
            // For shift view, show the full datetime
            const date = new Date(timeStr);
            const formattedDate = date.toLocaleDateString("ar-EG", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            const formattedTime = date.toLocaleTimeString("ar-EG", {
              hour: "2-digit",
              minute: "2-digit",
            });
            return `وقت إغلاق الشيفت: ${formattedDate} ${formattedTime}<br/>قيمة المخزون: ${formattedValue}`;
          } else {
            // For daily view, show just the date
            const date = new Date(timeStr);
            const formattedDate = date.toLocaleDateString("ar-EG", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            return `${formattedDate}<br/>قيمة المخزون: ${formattedValue}`;
          }
        },
      },
      toolbox: { feature: { saveAsImage: {} }, show: true },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
      series: [
        {
          name: "قيمة المخزون الصافية",
          type: "line",
          smooth: true,
          areaStyle: {},
          data: chartData,
        },
      ],
    };
  }, [data.inventory_net_value_3m, data.inventory_net_value_by_shift, viewMode]);

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
            { value: data.clients.categories.new.total_sales, name: "عملاء جدد" },
            {
              value: data.clients.categories.returning_lt5.total_sales,
              name: "عملاء عائدون (<5)",
            },
            {
              value: data.clients.categories.loyal_gte5.total_sales,
              name: "عملاء أوفياء (≥5)",
            },
          ],
        },
      ],
    }),
    [data.clients.categories],
  );

  const paymentMethodPie: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: {},
      toolbox: { feature: { saveAsImage: {} }, show: true },
      series: [
        {
          name: "المبيعات حسب طريقة الدفع",
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: true,
          data: (data.payment_method_breakdown || [])
            .filter((m) => m.total > 0)
            .map((m) => ({ value: Number(m.total.toFixed(2)), name: m.method })),
        },
      ],
    }),
    [data.payment_method_breakdown],
  );

  const paymentMethodAvgTicket: echarts.EChartsOption = useMemo(() => {
    const rows = (data.payment_method_breakdown || []).filter(
      (m) => m.bills_count > 0,
    );
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v) => formatCurrency(Number(v)),
      },
      toolbox: { feature: { saveAsImage: {} }, show: true },
      grid: { left: 90 },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: rows.map((m) => m.method) },
      series: [
        {
          name: "متوسط قيمة الفاتورة",
          type: "bar",
          data: rows.map((m) =>
            Number((m.total / Math.max(m.bills_count, 1)).toFixed(2)),
          ),
          label: {
            show: true,
            position: "right",
            formatter: (p: any) => formatCurrency(Number(p.value)),
          },
        },
      ],
    };
  }, [data.payment_method_breakdown]);

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
            data.clients.categories.new.count,
            data.clients.categories.returning_lt5.count,
            data.clients.categories.loyal_gte5.count,
          ],
        },
      ],
    }),
    [data.clients.categories],
  );

  const handleExportToPdf = async () => {
    try {
      const html = buildDetailedReportHtml({
        store,
        startDate: startDate.format("YYYY/MM/DD"),
        endDate: endDate.format("YYYY/MM/DD"),
        cards: data.cards,
        topProducts: data.top_products,
        clientCategories: data.clients.categories,
        clients: data.clients.all_clients,
        paymentBreakdown: data.payment_method_breakdown,
      });
      const result = await exportPdfDocument({
        fileName: `detailed-${startDate.format("YYYY-MM-DD")}-${endDate.format("YYYY-MM-DD")}.pdf`,
        html,
        landscape: true,
      });
      if (result?.cancelled) return;
      if (!result?.success) throw new Error(result?.error || "export failed");
      setMsg({ type: "success", text: "تم تصدير التقرير التفصيلي PDF بنجاح" });
    } catch (error) {
      console.error("Detailed PDF export failed:", error);
      setMsg({ type: "error", text: "فشل تصدير التقرير التفصيلي PDF" });
    }
  };

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
              التحليلات التفصيلية للمدة المحددة
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
          <Box sx={{ mb: 2 }}>
            <Autocomplete
              options={parties}
              value={
                parties.find((party) => party.id === selectedPartyId) || null
              }
              onChange={(_, value) => setSelectedPartyId(value?.id || null)}
              getOptionLabel={(option) =>
                option.name + " - " + option.phone + " - " + option.type
              }
              isOptionEqualToValue={(option, value) => option.id === value.id}
              filterOptions={(options, params) =>
                options.filter(
                  (option) =>
                    option.name
                      .toLowerCase()
                      .includes(params.inputValue.toLowerCase()) ||
                    option.phone.includes(params.inputValue),
                )
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="تصفية حسب طرف معيّن (كل الأطراف افتراضياً)"
                  variant="outlined"
                />
              )}
              disabled={isFetching}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              طريقة عرض الرسوم الزمنية
            </Typography>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_e, value) => value && setViewMode(value)}
              size="small"
              disabled={isFetching}
            >
              <ToggleButton value="daily">يومي</ToggleButton>
              <ToggleButton value="shift">حسب الشيفتات</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Paper>
      </Grid2>

      {/* Group 1: realized profit & loss */}
      <Grid2 size={12}>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
          المبيعات والأرباح المحقّقة
        </Typography>
      </Grid2>
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={3}>
          <AnalyticsCard
            title="إجمالي المبيعات"
            value={formatCurrency(data.cards.total_sales)}
            color="success.main"
            loading={isFetching}
            icon={<PaidIcon fontSize="large" color="success" />}
            info="صافي مبيعات الفواتير المدفوعة خلال الفترة: فواتير البيع ناقص المرتجعات. لا يشمل البيع الآجل أو التقسيط أو التحويلات بين الفروع. (البيع الآجل يُحتسب هنا تلقائياً بمجرد تحصيله لأنه يتحول إلى فاتورة بيع.)"
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="ربح FIFO"
            value={formatCurrency(data.cards.total_profit_fifo)}
            color="info.main"
            loading={isFetching}
            icon={<TrendingUpIcon fontSize="large" color="info" />}
            info="ربح البضاعة المباعة (سعر البيع ناقص تكلفة الشراء الفعلية بطريقة الوارد أولاً صادر أولاً). فواتير البيع فقط. أرباح الآجل والتقسيط لا تدخل هنا حتى تتحقق."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="المشتريات"
            value={formatCurrency(data.cards.purchases)}
            color="secondary.main"
            loading={isFetching}
            icon={<ShoppingCartIcon fontSize="large" color="secondary" />}
            info="صافي مشتريات البضاعة من المورّدين خلال الفترة (شراء ناقص مرتجع شراء). لا يشمل التحويلات بين الفروع. لا تُطرح من صافي الربح لأنها مدرجة أصلاً ضمن تكلفة البضاعة."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="مصروفات تشغيلية"
            value={formatCurrency(data.cards.operating_expenses)}
            color="error.main"
            loading={isFetching}
            icon={<TrendingDownIcon fontSize="large" color="error" />}
            info="المصروفات النقدية خلال الفترة (رواتب ومصاريف يدوية). لا تشمل شراء البضاعة ولا التحويلات بين الفروع ولا مسحوبات المالك."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="نقد فائض"
            value={formatCurrency(data.cards.free_cash)}
            color="success.main"
            loading={isFetching}
            icon={<RedeemIcon fontSize="large" color="success" />}
            info="نقد وارد يدوياً غير مرتبط بأي فاتورة، وليس من فرع آخر ولا من المالك (مثل مبلغ زائد يُوجد في الدرج). يُعتبر ربحاً صافياً ويُضاف إلى صافي الربح."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="صافي الربح"
            value={formatCurrency(data.cards.net_profit)}
            color="warning.main"
            loading={isFetching}
            icon={<SavingsIcon fontSize="large" color="warning" />}
            info="ربح FIFO ناقص المصروفات التشغيلية زائد النقد الفائض. لا تُطرح منه المشتريات (ضمن التكلفة أصلاً) ولا التحويلات بين الفروع ولا مسحوبات المالك. أرباح الآجل/التقسيط غير المحصّلة غير مشمولة."
          />
        </Grid2>
      </Grid2>

      {/* Group 2: BNPL (deferred, not yet collected) */}
      <Grid2 size={12}>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
          مبيعات آجلة (BNPL) — غير محصّلة
        </Typography>
      </Grid2>
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={3}>
          <AnalyticsCard
            title="آجل: مستحق التحصيل"
            value={formatCurrency(data.cards.bnpl_outstanding)}
            color="info.main"
            loading={isFetching}
            icon={<ReceiptLongIcon fontSize="large" color="info" />}
            info="قيمة فواتير البيع الآجل التي تمت في الفترة ولم تُحصَّل بعد (المال الذي سيدخل عند السداد). بمجرد التحصيل تتحول الفاتورة إلى بيع وتنتقل تلقائياً إلى إجمالي المبيعات وربح FIFO."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="آجل: ربح متوقع"
            value={formatCurrency(data.cards.bnpl_expected_profit)}
            color="info.main"
            loading={isFetching}
            icon={<TrendingUpIcon fontSize="large" color="info" />}
            info="الربح المتوقع من البيع الآجل غير المحصّل (سعر البيع ناقص تكلفة الشراء المسجّلة للبضاعة). يتحقق ويُحتسب ضمن ربح FIFO فور تحصيله."
          />
        </Grid2>
      </Grid2>

      {/* Group 3: installments */}
      <Grid2 size={12}>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
          التقسيط
        </Typography>
      </Grid2>
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={3}>
          <AnalyticsCard
            title="تقسيط: قيمة المبيعات"
            value={formatCurrency(data.cards.installment_principal)}
            color="info.main"
            loading={isFetching}
            icon={<ScheduleIcon fontSize="large" color="info" />}
            info="إجمالي قيمة البضاعة المباعة بالتقسيط في الفترة (المقدَّم + المتبقّي). محسوبة من أسعار المنتجات."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="تقسيط: محصّل"
            value={formatCurrency(data.cards.installment_collected)}
            color="success.main"
            loading={isFetching}
            icon={<PaidIcon fontSize="large" color="success" />}
            info="ما تم تحصيله حتى الآن من أقساط الفترة (المقدَّم + الأقساط المسددة)، حتى لو سُددت بعد انتهاء الفترة."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="تقسيط: متبقٍّ للتحصيل"
            value={formatCurrency(data.cards.installment_remaining)}
            color="info.main"
            loading={isFetching}
            icon={<HourglassBottomIcon fontSize="large" color="info" />}
            info="المال الذي سيدخل لاحقاً من أقساط الفترة = قيمة المبيعات ناقص المحصّل."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="تقسيط: ربح متوقع"
            value={formatCurrency(data.cards.installment_expected_profit)}
            color="info.main"
            loading={isFetching}
            icon={<TrendingUpIcon fontSize="large" color="info" />}
            info="إجمالي الربح المتوقع من مبيعات التقسيط في الفترة عند اكتمال السداد (سعر البيع ناقص تكلفة الشراء المسجّلة). لا يدخل حالياً في صافي الربح المحقّق."
          />
        </Grid2>
      </Grid2>

      {/* Group 4: set-apart movements that do NOT enter profit */}
      <Grid2 size={12}>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
          حركات مستقلة (لا تدخل في حساب الربح)
        </Typography>
      </Grid2>
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={3}>
          <AnalyticsCard
            title="تحويلات بين الفروع (صافي)"
            value={formatCurrency(data.cards.interstore_net)}
            color="text.secondary"
            loading={isFetching}
            icon={<SwapHorizIcon fontSize="large" color="disabled" />}
            info="صافي الأموال المتحركة بينك وبين الفروع الأخرى خلال الفترة (الوارد ناقص الصادر). مستقلة تماماً عن المبيعات والربح. القيمة السالبة تعني صافي مبالغ خرجت لفروع أخرى."
          />
        </Grid2>
      </Grid2>

      {/* Group 5: owner transactions with the store (in / out / net) */}
      <Grid2 size={12}>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1 }}>
          حركة المالك مع المحل
        </Typography>
      </Grid2>
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={3}>
          <AnalyticsCard
            title="إيداعات المالك"
            value={formatCurrency(data.cards.owner_in)}
            color="success.main"
            loading={isFetching}
            icon={<AccountBalanceWalletIcon fontSize="large" color="success" />}
            info="إجمالي ما أودعه المالك في المحل خلال الفترة. مستقل عن الربح."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="مسحوبات المالك"
            value={formatCurrency(data.cards.owner_out)}
            color="error.main"
            loading={isFetching}
            icon={<AccountBalanceWalletIcon fontSize="large" color="error" />}
            info="إجمالي ما سحبه المالك من المحل خلال الفترة. مستقل عن الربح."
          />
        </Grid2>
        <Grid2 size={3}>
          <AnalyticsCard
            title="صافي حركة المالك"
            value={formatCurrency(data.cards.owner_net)}
            color="text.secondary"
            loading={isFetching}
            icon={<AccountBalanceWalletIcon fontSize="large" color="disabled" />}
            info="الإيداعات ناقص المسحوبات. القيمة السالبة تعني أن المالك سحب أكثر مما أودع خلال الفترة."
          />
        </Grid2>
      </Grid2>

      {/* Overview */}
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            نظرة عامة: النقد الوارد مقابل ربح FIFO
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

      {/* Top Clients Table */}
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            ترتيب العملاء حسب المشتريات
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>اسم العميل</TableCell>
                  <TableCell>رقم الهاتف</TableCell>
                  <TableCell align="right">إجمالي المشتريات</TableCell>
                  <TableCell align="right">عدد الفواتير</TableCell>
                  <TableCell>الفئة</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.clients.all_clients
                  .slice(
                    clientsPage * clientsRowsPerPage,
                    clientsPage * clientsRowsPerPage + clientsRowsPerPage,
                  )
                  .map((client, index) => (
                    <TableRow key={client.party_id} hover>
                      <TableCell>
                        {clientsPage * clientsRowsPerPage + index + 1}
                      </TableCell>
                      <TableCell>{client.name}</TableCell>
                      <TableCell dir="ltr">{client.phone || "-"}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(client.total)}
                      </TableCell>
                      <TableCell align="right">{client.bills_count}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={
                            client.category === "new"
                              ? "جديد"
                              : client.category === "returning_lt5"
                                ? "عائد"
                                : "وفي"
                          }
                          color={
                            client.category === "new"
                              ? "info"
                              : client.category === "returning_lt5"
                                ? "warning"
                                : "success"
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                {data.clients.all_clients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      لا يوجد عملاء في هذه الفترة
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50]}
            component="div"
            count={data.clients.all_clients.length}
            rowsPerPage={clientsRowsPerPage}
            page={clientsPage}
            onPageChange={(_e, newPage) => setClientsPage(newPage)}
            onRowsPerPageChange={(e) => {
              setClientsRowsPerPage(parseInt(e.target.value, 10));
              setClientsPage(0);
            }}
            labelRowsPerPage="عدد الصفوف:"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} من ${count !== -1 ? count : `أكثر من ${to}`}`
            }
          />
        </Card>
      </Grid2>

      {/* Payment method breakdown */}
      {data.payment_method_breakdown &&
        data.payment_method_breakdown.length > 0 &&
        (() => {
          const paymentTotal = data.payment_method_breakdown.reduce(
            (acc, m) => acc + m.total,
            0,
          );
          return (
            <>
              <Grid2 size={12}>
                <Typography variant="h6" sx={{ mt: 1 }}>
                  تحليل طرق الدفع
                </Typography>
              </Grid2>

              <Grid2 container size={12} spacing={2}>
                <Grid2 size={5}>
                  <Card elevation={3} sx={{ p: 2, height: 420 }}>
                    <Typography variant="h6" gutterBottom>
                      المبيعات حسب طريقة الدفع
                    </Typography>
                    <EChartsReact
                      option={paymentMethodPie}
                      style={{ height: 360 }}
                      theme={mode}
                      notMerge
                    />
                  </Card>
                </Grid2>
                <Grid2 size={7}>
                  <Card elevation={3} sx={{ p: 2, height: 420 }}>
                    <Typography variant="h6" gutterBottom>
                      متوسط قيمة الفاتورة حسب طريقة الدفع
                    </Typography>
                    <EChartsReact
                      option={paymentMethodAvgTicket}
                      style={{ height: 360 }}
                      theme={mode}
                      notMerge
                    />
                  </Card>
                </Grid2>
              </Grid2>

              <Grid2 size={12}>
                <Card elevation={3} sx={{ p: 2, mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    تفاصيل طرق الدفع
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>طريقة الدفع</TableCell>
                          <TableCell align="right">الإجمالي</TableCell>
                          <TableCell align="right">النسبة</TableCell>
                          <TableCell align="right">عدد الفواتير</TableCell>
                          <TableCell align="right">متوسط الفاتورة</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.payment_method_breakdown.map((m) => (
                          <TableRow key={m.method} hover>
                            <TableCell>{m.method}</TableCell>
                            <TableCell align="right">
                              {formatCurrency(m.total)}
                            </TableCell>
                            <TableCell align="right">
                              {paymentTotal > 0
                                ? `${Math.round((m.total / paymentTotal) * 100)}%`
                                : "-"}
                            </TableCell>
                            <TableCell align="right">{m.bills_count}</TableCell>
                            <TableCell align="right">
                              {m.bills_count > 0
                                ? formatCurrency(m.total / m.bills_count)
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              </Grid2>
            </>
          );
        })()}

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
          <Typography variant="h6">قيمة المخزون الصافية</Typography>
          <Typography variant="caption" color="text.secondary" gutterBottom>
            قيمة على مستوى المتجر بالكامل ولا تتأثر بتصفية الطرف.
          </Typography>
          <EChartsReact
            key={`inventory-${viewMode}`}
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

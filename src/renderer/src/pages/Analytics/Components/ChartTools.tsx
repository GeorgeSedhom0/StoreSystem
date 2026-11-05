import {
  Box,
  Button,
  ButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Download } from "@mui/icons-material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { Dayjs } from "dayjs";
import { ReactNode } from "react";

/** Phones get shorter charts so the whole chart fits on screen. */
export const useChartHeight = (desktop = 450, phone = 300) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  return isPhone ? phone : desktop;
};

export const useIsPhone = () => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("sm"));
};

/** ECharts toolbox with Arabic tooltips. */
type MagicType = "line" | "bar" | "stack";
export const chartToolbox = (
  magic: MagicType[] | false = ["line", "bar"],
): echarts.EChartsOption["toolbox"] => ({
  show: true,
  feature: {
    ...(magic
      ? {
          magicType: {
            type: magic,
            title: {
              line: "خطي",
              bar: "أعمدة",
              stack: "تكديس",
              tiled: "منفصل",
            },
          },
        }
      : {}),
    saveAsImage: { title: "حفظ كصورة" },
  },
});

/** Keeps axis labels inside the chart on narrow screens. */
export const chartGrid = (isPhone: boolean, extra: object = {}) => ({
  containLabel: true,
  left: isPhone ? 4 : 16,
  right: isPhone ? 8 : 24,
  top: 56,
  bottom: 16,
  ...extra,
});

export const moneyFmt = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
});
export const formatMoney = (v: number) => moneyFmt.format(v || 0);
export const formatNumber = (v: number) =>
  (v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export const ExportExcelButton = ({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Button
    variant="outlined"
    size="small"
    startIcon={<Download />}
    onClick={onClick}
    disabled={disabled}
    sx={{ minHeight: 40, whiteSpace: "nowrap", flexShrink: 0 }}
  >
    تصدير Excel
  </Button>
);

/** Card title row: heading + subtitle on the start side, actions on the end. */
export const ChartHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) => (
  <Box
    sx={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 1.5,
      flexWrap: "wrap",
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="h5"
        sx={{ fontWeight: 600, fontSize: { xs: "1.2rem", sm: "1.5rem" } }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Box>
    {actions && (
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{actions}</Box>
    )}
  </Box>
);

type Range = "day" | "week" | "month";

/** From/to pickers + quick ranges. Stacks on phones. */
export const DateRangeFilter = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  disabled,
  quickRanges = true,
  children,
}: {
  startDate: Dayjs;
  endDate: Dayjs;
  setStartDate: (d: Dayjs) => void;
  setEndDate: (d: Dayjs) => void;
  disabled?: boolean;
  quickRanges?: boolean;
  /** Extra filters shown in the same row (e.g. bill-type select). */
  children?: ReactNode;
}) => {
  const setRange = (range: Range) => {
    setStartDate(dayjs().startOf(range));
    setEndDate(range === "day" ? dayjs().endOf("day") : dayjs().endOf(range));
  };
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr 1fr",
            md: children
              ? "repeat(3, minmax(0, 260px))"
              : "repeat(2, minmax(0, 260px))",
          },
          "& > :nth-of-type(3)": { gridColumn: { xs: "1 / -1", md: "auto" } },
        }}
      >
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ar-sa">
          <DatePicker
            label="من"
            value={startDate}
            onChange={(v) => v && v.isValid() && setStartDate(v)}
            disableFuture
            disabled={disabled}
            slotProps={{ textField: { fullWidth: true } }}
          />
          <DatePicker
            label="إلى"
            value={endDate}
            onChange={(v) => v && v.isValid() && setEndDate(v)}
            disabled={disabled}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </LocalizationProvider>
        {children}
      </Box>
      {quickRanges && (
        <ButtonGroup
          size="small"
          disabled={disabled}
          sx={{
            alignSelf: "flex-start",
            "& .MuiButton-root": { minHeight: 40 },
          }}
        >
          <Button onClick={() => setRange("day")}>اليوم</Button>
          <Button onClick={() => setRange("week")}>هذا الأسبوع</Button>
          <Button onClick={() => setRange("month")}>هذا الشهر</Button>
        </ButtonGroup>
      )}
    </Box>
  );
};

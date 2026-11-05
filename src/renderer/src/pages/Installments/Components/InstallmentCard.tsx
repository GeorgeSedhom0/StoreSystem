import {
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Collapse,
  Grid2,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AccountBalance,
  CalendarMonth,
  Call,
  CheckCircle,
  Delete,
  EventAvailable,
  ExpandLess,
  ExpandMore,
  Payment,
  Person,
  Schedule as ScheduleIcon,
  Warning,
  WhatsApp,
} from "@mui/icons-material";
import { ReactNode, memo, useState } from "react";
import { fmtMoney } from "../format";
import {
  RowState,
  Schedule,
  dayCount,
  daysAgo,
  fmtDate,
  fmtShortDate,
  inDays,
  intlPhone,
} from "../schedule";

export interface InstallmentLike {
  id: number;
  bill_id: number;
  paid: number;
  time: string;
  installments_count: number;
  installment_interval: number;
  party_name: string;
  party_phone?: string;
  flow: { id: number; amount: number; time: string }[];
  total: number;
  ended: boolean;
}

const ROW_STATE: Record<
  RowState,
  { label: string; color: "success" | "error" | "warning" | "info" | "default" }
> = {
  paid: { label: "مدفوع", color: "success" },
  partial: { label: "مدفوع جزئياً", color: "warning" },
  late: { label: "متأخر", color: "error" },
  due: { label: "القادم", color: "info" },
  upcoming: { label: "لاحقاً", color: "default" },
};

const StatusChip = ({ s }: { s: Schedule }) =>
  s.status === "completed" ? (
    <Chip icon={<CheckCircle />} label="مكتمل" color="success" size="small" />
  ) : s.status === "overdue" ? (
    <Chip
      icon={<Warning />}
      label={`متأخر ${dayCount(s.daysLate)}`}
      color="error"
      size="small"
    />
  ) : (
    <Chip icon={<ScheduleIcon />} label="نشط" color="primary" size="small" />
  );

/** The one line that matters most: what's due, when, and how much. */
const DueLine = ({ s, compact }: { s: Schedule; compact?: boolean }) => {
  if (s.status === "completed" || !s.nextDue) {
    return (
      <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
        تم السداد بالكامل
      </Typography>
    );
  }
  const late = s.status === "overdue";
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
        ...(compact
          ? {}
          : {
              px: 1.5,
              py: 1,
              borderRadius: 2,
              bgcolor: late ? "error.main" : "action.hover",
              color: late ? "error.contrastText" : "text.primary",
            }),
      }}
    >
      {late ? (
        <Warning fontSize="small" color={compact ? "error" : "inherit"} />
      ) : (
        <EventAvailable
          fontSize="small"
          color={compact ? "primary" : "inherit"}
        />
      )}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          color: compact && late ? "error.main" : undefined,
        }}
      >
        {late
          ? `قسط متأخر ${daysAgo(s.daysLate)}`
          : `القسط القادم ${inDays(s.daysUntil)}`}
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.9 }}>
        {fmtShortDate(s.nextDue)} · {fmtMoney(s.nextAmount)}
      </Typography>
    </Box>
  );
};

const ContactButtons = ({
  inst,
  s,
  storeName,
  size = "medium",
}: {
  inst: InstallmentLike;
  s: Schedule;
  storeName?: string;
  size?: "small" | "medium";
}) => {
  const phone = intlPhone(inst.party_phone);
  if (!phone) return null;
  const text =
    s.status === "completed"
      ? ""
      : `مرحباً ${inst.party_name || ""}،\n` +
        (s.status === "overdue"
          ? `نذكّركم بقسط متأخر بقيمة ${fmtMoney(s.nextAmount)} كان مستحقاً بتاريخ ${fmtDate(s.nextDue!)}.`
          : `نذكّركم بموعد القسط القادم بقيمة ${fmtMoney(s.nextAmount)} بتاريخ ${fmtDate(s.nextDue!)}.`) +
        `\nالمتبقي من الفاتورة رقم ${inst.bill_id}: ${fmtMoney(s.remaining)}.` +
        (storeName ? `\n${storeName}` : "") +
        "\nشكراً لكم.";
  return (
    <>
      <Tooltip title={`اتصال ${inst.party_phone}`}>
        <IconButton
          component="a"
          href={`tel:+${phone}`}
          color="primary"
          size={size}
          aria-label="اتصال بالعميل"
          sx={{ border: 1, borderColor: "divider" }}
        >
          <Call fontSize={size === "small" ? "small" : "medium"} />
        </IconButton>
      </Tooltip>
      {s.status !== "completed" && (
        <Tooltip title="إرسال تذكير على واتساب">
          <IconButton
            component="a"
            href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            size={size}
            aria-label="تذكير على واتساب"
            sx={{ border: 1, borderColor: "divider", color: "#25D366" }}
          >
            <WhatsApp fontSize={size === "small" ? "small" : "medium"} />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
};

const ScheduleTable = ({ s }: { s: Schedule }) => (
  <Box
    sx={{
      border: 1,
      borderColor: "divider",
      borderRadius: 2,
      overflow: "hidden",
    }}
  >
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>#</TableCell>
          <TableCell>الاستحقاق</TableCell>
          <TableCell>القيمة</TableCell>
          <TableCell>الحالة</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {s.rows.map((r) => (
          <TableRow
            key={r.n}
            sx={{ bgcolor: r.state === "late" ? "action.hover" : undefined }}
          >
            <TableCell>{r.n}</TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              {fmtShortDate(r.due)}
            </TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>
              {fmtMoney(r.amount)}
              {r.paid > 0.005 && r.paid < r.amount - 0.005 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                >
                  دُفع {fmtMoney(r.paid)}
                </Typography>
              )}
            </TableCell>
            <TableCell>
              <Chip
                size="small"
                variant={r.state === "upcoming" ? "outlined" : "filled"}
                color={ROW_STATE[r.state].color}
                label={ROW_STATE[r.state].label}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Box>
);

const moneyTile = (
  icon: ReactNode,
  label: string,
  value: number,
  color: string,
) => (
  <Box
    sx={{
      p: { xs: 1, md: 1.5 },
      borderRadius: 2,
      border: 1,
      borderColor: "divider",
      bgcolor: "action.hover",
      height: "100%",
    }}
  >
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        color,
        "& svg": { fontSize: 18 },
      }}
    >
      {icon}
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
    <Typography
      sx={{ fontWeight: 700, color, fontSize: { xs: "1rem", md: "1.15rem" } }}
    >
      {fmtMoney(value)}
    </Typography>
  </Box>
);

const progressColor = (p: number) =>
  p >= 100
    ? "success.main"
    : p >= 75
      ? "info.main"
      : p >= 50
        ? "warning.main"
        : "error.main";

interface Props {
  inst: InstallmentLike;
  s: Schedule;
  isMobile: boolean;
  storeName?: string;
  onPay: (id: number) => void;
  onDeletePayment: (flowId: number, amount: number, partyName: string) => void;
}

/** Full card: the due line up front, money tiles, progress, schedule and
 * payment history folding out, pay/call/WhatsApp along the bottom. */
export const InstallmentCard = memo(
  ({ inst, s, isMobile, storeName, onPay, onDeletePayment }: Props) => {
    const [open, setOpen] = useState<"" | "schedule" | "history">("");
    const progress = s.total > 0 ? (s.totalPaid / s.total) * 100 : 0;
    const late = s.status === "overdue";
    return (
      <Card
        elevation={2}
        sx={{
          border: late ? "2px solid" : "1px solid",
          borderColor: late ? "error.main" : "divider",
        }}
      >
        <CardContent sx={{ p: { xs: 1.5, md: 2 }, pb: 1 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            gap={1}
            sx={{ mb: 1.5 }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{ minWidth: 0 }}
            >
              <Avatar
                sx={{
                  bgcolor: "secondary.main",
                  display: { xs: "none", sm: "flex" },
                }}
              >
                <Person />
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700, lineHeight: 1.3 }}
                  noWrap
                >
                  {inst.party_name || "عميل غير معروف"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  قسط #{inst.id} · فاتورة #{inst.bill_id}
                  {inst.party_phone ? ` · ${inst.party_phone}` : ""}
                </Typography>
              </Box>
            </Stack>
            <StatusChip s={s} />
          </Stack>

          <Box sx={{ mb: 1.5 }}>
            <DueLine s={s} />
          </Box>

          <Grid2 container spacing={1} sx={{ mb: 1.5 }}>
            <Grid2 size={{ xs: 6, md: 3 }}>
              {moneyTile(
                <AccountBalance />,
                "إجمالي الفاتورة",
                s.total,
                "primary.main",
              )}
            </Grid2>
            <Grid2 size={{ xs: 6, md: 3 }}>
              {moneyTile(<Payment />, "المقدم", s.deposit, "success.main")}
            </Grid2>
            <Grid2 size={{ xs: 6, md: 3 }}>
              {moneyTile(
                <CheckCircle />,
                "إجمالي المدفوع",
                s.totalPaid,
                "info.main",
              )}
            </Grid2>
            <Grid2 size={{ xs: 6, md: 3 }}>
              {moneyTile(
                <Warning />,
                "المتبقي",
                s.remaining,
                s.remaining > 0 ? "warning.main" : "success.main",
              )}
            </Grid2>
          </Grid2>

          <Stack
            direction="row"
            justifyContent="space-between"
            sx={{ mb: 0.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              الأقساط المدفوعة {s.paidCount} من {s.count} · كل{" "}
              {fmtMoney(s.size)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progress.toFixed(0)}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(progress, 100)}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: "action.hover",
              "& .MuiLinearProgress-bar": { bgcolor: progressColor(progress) },
            }}
          />

          <Stack direction="row" gap={1} sx={{ mt: 1.5, flexWrap: "wrap" }}>
            <Button
              size="small"
              startIcon={<CalendarMonth />}
              endIcon={open === "schedule" ? <ExpandLess /> : <ExpandMore />}
              onClick={() => setOpen(open === "schedule" ? "" : "schedule")}
            >
              جدول الأقساط
            </Button>
            {inst.flow.length > 0 && (
              <Button
                size="small"
                startIcon={<Payment />}
                endIcon={open === "history" ? <ExpandLess /> : <ExpandMore />}
                onClick={() => setOpen(open === "history" ? "" : "history")}
              >
                المدفوعات ({inst.flow.length})
              </Button>
            )}
          </Stack>

          <Collapse in={open === "schedule"} unmountOnExit>
            <Box sx={{ mt: 1 }}>
              <ScheduleTable s={s} />
            </Box>
          </Collapse>

          <Collapse in={open === "history"} unmountOnExit>
            <Box
              sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 2 }}
            >
              {inst.flow.map((f, i) => (
                <Box
                  key={f.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    borderTop: i ? 1 : 0,
                    borderColor: "divider",
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {fmtMoney(f.amount)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(f.time).toLocaleString("ar-EG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </Typography>
                  </Box>
                  <IconButton
                    color="error"
                    aria-label="حذف الدفعة"
                    size={isMobile ? "medium" : "small"}
                    onClick={() =>
                      onDeletePayment(f.id, f.amount, inst.party_name)
                    }
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Collapse>
        </CardContent>

        <CardActions
          sx={{ px: { xs: 1.5, md: 2 }, pb: 2, gap: 1, flexWrap: "wrap" }}
        >
          <Button
            variant="contained"
            color={late ? "error" : "primary"}
            startIcon={<Payment />}
            onClick={() => onPay(inst.id)}
            disabled={s.status === "completed"}
            sx={{
              minHeight: 44,
              flex: { xs: 1, sm: "0 0 auto" },
              minWidth: 140,
            }}
          >
            {s.status === "completed"
              ? "تم السداد"
              : `دفع ${fmtMoney(s.nextAmount)}`}
          </Button>
          <ContactButtons inst={inst} s={s} storeName={storeName} />
        </CardActions>
      </Card>
    );
  },
);

/** Compact one-row layout for scanning many plans quickly. */
export const InstallmentRow = memo(({ inst, s, storeName, onPay }: Props) => {
  const late = s.status === "overdue";
  const progress = s.total > 0 ? (s.totalPaid / s.total) * 100 : 0;
  return (
    <Card
      variant="outlined"
      sx={{
        px: 1.5,
        py: 1,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flexWrap: { xs: "wrap", sm: "nowrap" },
        borderColor: late ? "error.main" : "divider",
        borderInlineStartWidth: 4,
        borderInlineStartColor: late
          ? "error.main"
          : s.status === "completed"
            ? "success.main"
            : "primary.main",
      }}
    >
      <Box sx={{ flex: "1 1 180px", minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }} noWrap>
          {inst.party_name || "عميل غير معروف"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          #{inst.id} · {s.paidCount}/{s.count} قسط
        </Typography>
      </Box>
      <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
        <DueLine s={s} compact />
        <LinearProgress
          variant="determinate"
          value={Math.min(progress, 100)}
          sx={{
            mt: 0.5,
            height: 4,
            borderRadius: 2,
            "& .MuiLinearProgress-bar": { bgcolor: progressColor(progress) },
          }}
        />
      </Box>
      <Box sx={{ textAlign: "end", minWidth: 96 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          المتبقي
        </Typography>
        <Typography
          sx={{
            fontWeight: 700,
            color: s.remaining > 0 ? "warning.main" : "success.main",
          }}
        >
          {fmtMoney(s.remaining)}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          gap: 0.75,
          alignItems: "center",
          ml: { xs: "auto", sm: 0 },
        }}
      >
        <ContactButtons inst={inst} s={s} storeName={storeName} size="small" />
        <Button
          variant={late ? "contained" : "outlined"}
          color={late ? "error" : "primary"}
          size="small"
          onClick={() => onPay(inst.id)}
          disabled={s.status === "completed"}
          sx={{ minHeight: 36 }}
        >
          دفع
        </Button>
      </Box>
    </Card>
  );
});

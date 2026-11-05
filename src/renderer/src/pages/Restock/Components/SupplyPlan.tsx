import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  METHOD_LABEL,
  PlanProduct,
  fmtQty,
  moveProductsLink,
  restockApi,
} from "../api";

export const usePlan = (storeId: number, enabled = true) =>
  useQuery({
    queryKey: ["restock", "plan", storeId],
    queryFn: () => restockApi.plan(storeId),
    enabled,
  });

const coverLabel = (d: number | null) =>
  d == null
    ? "لا مبيعات"
    : d >= 100
      ? "+100 يوم"
      : `يكفي ~${fmtQty(Math.round(d))} يوم`;

const ProductRow = ({ p, days }: { p: PlanProduct; days: number }) => (
  <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.25 }}>
    <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
      <Typography
        fontWeight={700}
        sx={{ flex: "1 1 180px", minWidth: 0 }}
        noWrap
      >
        {p.name}
      </Typography>
      <Chip
        size="small"
        variant="outlined"
        color={p.short ? "error" : "success"}
        label={`المتاح ${fmtQty(p.available)} / المطلوب ${fmtQty(p.total_remaining)}`}
      />
      {p.contested && (
        <Tooltip
          title={
            p.method === "usage"
              ? `يُوزَّع بحيث ينفد المنتج عند كل متجر في نفس الوقت تقريبًا (حسب مبيعات آخر ${days} يوم ومخزونه الحالي)`
              : "لا توجد مبيعات كافية لكل المتاجر، فيُوزَّع بنسبة الكمية المطلوبة"
          }
        >
          <Chip
            size="small"
            color="warning"
            icon={<CallSplitIcon />}
            label={METHOD_LABEL[p.method]}
          />
        </Tooltip>
      )}
    </Stack>
    <Stack sx={{ mt: 0.75 }} spacing={0.5}>
      {p.stores.map((s) => (
        <Stack
          key={s.store_id}
          direction="row"
          alignItems="center"
          gap={1}
          flexWrap="wrap"
          sx={{ pl: 1 }}
        >
          <Typography variant="body2" sx={{ minWidth: 110 }} fontWeight={600}>
            {s.store_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            طلب {fmtQty(s.remaining)} · عنده {fmtQty(s.stock)}
            {s.daily > 0
              ? ` · يبيع ~${fmtQty(Math.round(s.daily * 10) / 10)}/يوم`
              : ""}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Chip
            size="small"
            color={
              s.allocation >= s.remaining
                ? "success"
                : s.allocation > 0
                  ? "warning"
                  : "error"
            }
            label={`المقترح ${fmtQty(s.allocation)}`}
          />
          {p.contested && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: 92 }}
            >
              {coverLabel(s.cover_days)}
            </Typography>
          )}
        </Stack>
      ))}
    </Stack>
  </Box>
);

/** «حسب المنتج»: everything owed by this store, one row per product, with
 * the suggested split when several stores want more than there is. */
const SupplyPlan = ({
  storeId,
  canMove,
}: {
  storeId: number;
  canMove: boolean;
}) => {
  const { data, isLoading } = usePlan(storeId);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "short" | "contested">("all");

  const shown = useMemo(
    () =>
      (data?.products || []).filter((p) =>
        filter === "contested"
          ? p.contested
          : filter === "short"
            ? p.short
            : true,
      ),
    [data, filter],
  );

  // One "prepare" button per requesting store, covering all its open requests.
  const byStore = useMemo(() => {
    const m = new Map<
      number,
      { name: string; ids: Set<number>; lines: number }
    >();
    for (const p of data?.products || [])
      for (const s of p.stores) {
        const e = m.get(s.store_id) || {
          name: s.store_name,
          ids: new Set<number>(),
          lines: 0,
        };
        s.requests.forEach((r) => e.ids.add(r.id));
        e.lines += 1;
        m.set(s.store_id, e);
      }
    return [...m.entries()];
  }, [data]);

  if (isLoading)
    return (
      <Stack spacing={1}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={90} />
        ))}
      </Stack>
    );
  if (!data?.products.length)
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">
          لا يوجد شيء مطلوب تجهيزه الآن.
        </Typography>
      </Box>
    );

  const contested = data.products.filter((p) => p.contested).length;
  const short = data.products.filter((p) => p.short).length;

  return (
    <Stack spacing={1.5}>
      {contested > 0 && (
        <Alert severity="warning" icon={<CallSplitIcon />}>
          {contested} منتج تطلبه أكثر من جهة والمتاح لا يكفي الجميع — التقسيم
          المقترح يُستخدم تلقائيًا عند التجهيز، ويمكنك تعديله في السلة.
        </Alert>
      )}
      {canMove && byStore.length > 0 && (
        <Stack direction="row" gap={1} flexWrap="wrap">
          {byStore.map(([sid, s]) => (
            <Button
              key={sid}
              variant="contained"
              startIcon={<LocalShippingIcon />}
              onClick={() => navigate(moveProductsLink([...s.ids]))}
            >
              تجهيز {s.name} ({s.lines} صنف)
            </Button>
          ))}
        </Stack>
      )}
      <ToggleButtonGroup
        size="small"
        exclusive
        value={filter}
        onChange={(_, v) => v && setFilter(v)}
      >
        <ToggleButton value="all">الكل ({data.products.length})</ToggleButton>
        <ToggleButton value="short">غير كافٍ ({short})</ToggleButton>
        <ToggleButton value="contested">يحتاج تقسيم ({contested})</ToggleButton>
      </ToggleButtonGroup>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        {shown.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">لا يوجد</Typography>
          </Box>
        ) : (
          <Stack divider={<Divider />}>
            {shown.map((p) => (
              <ProductRow key={p.product_id} p={p} days={data.usage_days} />
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
};

export default SupplyPlan;

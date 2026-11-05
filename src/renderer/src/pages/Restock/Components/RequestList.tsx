import {
  Badge,
  Box,
  Card,
  CardActionArea,
  Chip,
  LinearProgress,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizeArabic } from "../../Shared/ProductAutocomplete";
import {
  RestockRequest,
  STATE_COLOR,
  STATE_LABEL,
  fmtQty,
  fmtWhen,
  restockApi,
} from "../api";

export const useRestockList = (storeId: number, box: "mine" | "incoming") =>
  useQuery({
    queryKey: ["restock", "list", box, storeId],
    queryFn: () => restockApi.list(storeId, box, "all"),
    refetchInterval: 60_000,
  });

const RequestCard = ({
  r,
  box,
  onOpen,
}: {
  r: RestockRequest;
  box: "mine" | "incoming";
  onOpen: () => void;
}) => {
  const pct = r.totals.requested
    ? Math.min(100, (r.totals.sent / r.totals.requested) * 100)
    : 0;
  const unseen = box === "incoming" && r.status === "open" && !r.seen_at;
  const other =
    box === "mine" ? `إلى ${r.to_store_name}` : `من ${r.from_store_name}`;
  const names = r.lines
    .filter((l) => (r.status === "open" ? l.remaining > 0 : true))
    .slice(0, 4)
    .map((l) => l.name)
    .join("، ");
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: unseen ? "info.main" : undefined,
        borderWidth: unseen ? 2 : 1,
        opacity: r.status === "closed" ? 0.85 : 1,
      }}
    >
      <CardActionArea onClick={onOpen} sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
          <Badge color="info" variant="dot" invisible={!unseen}>
            <Typography fontWeight={700}>#{r.id}</Typography>
          </Badge>
          <Chip
            size="small"
            color={STATE_COLOR[r.state]}
            label={STATE_LABEL[r.state]}
          />
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {fmtWhen(r.created_at)}
          </Typography>
        </Stack>
        <Typography variant="body2" fontWeight={600}>
          {other}
          <Typography component="span" variant="body2" color="text.secondary">
            {" "}
            · {r.totals.lines} صنف · {fmtQty(r.totals.requested)} قطعة
          </Typography>
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ mt: 0.25 }}
        >
          {names}
          {r.totals.lines > 4 ? "…" : ""}
        </Typography>
        {r.note && (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            component="div"
          >
            📝 {r.note}
          </Typography>
        )}
        <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1 }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            color={
              r.state === "short" ? "error" : pct >= 100 ? "success" : "primary"
            }
            sx={{ flex: 1, height: 6, borderRadius: 3 }}
          />
          <Typography
            variant="caption"
            sx={{ minWidth: 72, textAlign: "left" }}
          >
            {r.status === "open" && r.totals.sent > 0
              ? `بقي ${r.totals.lines_open} صنف`
              : `${Math.round(pct)}%`}
          </Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
};

const RequestList = ({
  storeId,
  box,
  onOpen,
}: {
  storeId: number;
  box: "mine" | "incoming";
  onOpen: (id: number) => void;
}) => {
  const { data, isLoading } = useRestockList(storeId, box);
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const q = normalizeArabic(search.trim());
    return (data || []).filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      if (String(r.id) === q.replace("#", "")) return true;
      const hay = normalizeArabic(
        [
          r.note,
          r.from_store_name,
          r.to_store_name,
          ...r.lines.map((l) => l.name),
          ...r.lines.map((l) => l.bar_code || ""),
        ].join(" "),
      );
      return hay.includes(q);
    });
  }, [data, filter, search]);

  const openCount = (data || []).filter((r) => r.status === "open").length;

  return (
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        gap={1}
        alignItems={{ sm: "center" }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_, v) => v && setFilter(v)}
        >
          <ToggleButton value="open">مفتوحة ({openCount})</ToggleButton>
          <ToggleButton value="closed">مغلقة</ToggleButton>
          <ToggleButton value="all">الكل</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder="بحث برقم الطلب أو اسم منتج"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: { sm: 360 } }}
        />
      </Stack>
      {isLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={110} />
          ))}
        </Stack>
      ) : shown.length === 0 ? (
        <Box sx={{ py: 6, textAlign: "center" }}>
          <Typography color="text.secondary">
            {filter === "open"
              ? box === "mine"
                ? "لا توجد طلبات مفتوحة. أنشئ طلبًا من «طلب جديد»."
                : "لا توجد طلبات واردة مفتوحة."
              : "لا توجد طلبات"}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
              xl: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {shown.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              box={box}
              onOpen={() => onOpen(r.id)}
            />
          ))}
        </Box>
      )}
    </Stack>
  );
};

export default RequestList;

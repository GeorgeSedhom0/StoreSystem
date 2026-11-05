import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Product } from "../utils/types";
import {
  PlanProduct,
  RestockRequest,
  STATE_COLOR,
  STATE_LABEL,
  fmtQty,
  fmtWhen,
  restockApi,
} from "../Restock/api";

export interface RestockFill {
  destStoreId: number;
  ids: number[];
  lines: { product: Product; qty: number }[];
  unavailable: string[];
  partial: { name: string; qty: number; remaining: number }[];
}

/**
 * What to put in the transfer cart for the selected requests (one store):
 * per product min(remaining in the selection, the suggested split for that
 * store, stock here). The split already accounts for every other store's
 * open requests for the same product.
 */
export const computeFill = (
  selected: RestockRequest[],
  plan: PlanProduct[],
  products: Product[],
): RestockFill | null => {
  if (!selected.length) return null;
  const dest = selected[0].from_store_id;
  const need = new Map<number, { name: string; remaining: number }>();
  for (const r of selected)
    for (const l of r.lines) {
      if (l.remaining <= 0) continue;
      const e = need.get(l.product_id) || { name: l.name, remaining: 0 };
      e.remaining += l.remaining;
      need.set(l.product_id, e);
    }
  const planBy = new Map(plan.map((p) => [p.product_id, p]));
  const prodBy = new Map(products.map((p) => [p.id, p]));
  const out: RestockFill = {
    destStoreId: dest,
    ids: selected.map((r) => r.id),
    lines: [],
    unavailable: [],
    partial: [],
  };
  for (const [pid, n] of need) {
    const product = prodBy.get(pid);
    const stock = Math.max(0, product?.stock ?? 0);
    const share = planBy
      .get(pid)
      ?.stores.find((s) => s.store_id === dest)?.allocation;
    const qty = Math.max(
      0,
      Math.floor(Math.min(n.remaining, stock, share ?? Infinity)),
    );
    if (!product || qty <= 0) {
      out.unavailable.push(n.name);
      continue;
    }
    out.lines.push({ product, qty });
    if (qty < n.remaining)
      out.partial.push({ name: n.name, qty, remaining: n.remaining });
  }
  return out;
};

const RestockPicker = ({
  open,
  onClose,
  storeId,
  products,
  preselect,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  storeId: number;
  products: Product[];
  preselect?: number[];
  onApply: (fill: RestockFill) => void;
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { data: requests, isLoading } = useQuery({
    queryKey: ["restock", "list", "incoming", storeId],
    queryFn: () => restockApi.list(storeId, "incoming", "all"),
    enabled: open,
  });
  const {
    data: plan,
    isLoading: planLoading,
    isError: planError,
  } = useQuery({
    queryKey: ["restock", "plan", storeId],
    queryFn: () => restockApi.plan(storeId),
    enabled: open,
  });

  const openReqs = useMemo(
    () =>
      (requests || [])
        .filter((r) => r.status === "open" && r.totals.lines_open > 0)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [requests],
  );
  const groups = useMemo(() => {
    const m = new Map<number, { name: string; reqs: RestockRequest[] }>();
    for (const r of openReqs) {
      const g = m.get(r.from_store_id) || { name: r.from_store_name, reqs: [] };
      g.reqs.push(r);
      m.set(r.from_store_id, g);
    }
    return [...m.entries()];
  }, [openReqs]);

  const [sel, setSel] = useState<number[]>([]);
  useEffect(() => {
    if (!open) {
      setSel([]);
      return;
    }
    const valid = (preselect || []).filter((id) =>
      openReqs.some((r) => r.id === id),
    );
    if (valid.length) {
      const store = openReqs.find((r) => r.id === valid[0])!.from_store_id;
      setSel(
        valid.filter(
          (id) => openReqs.find((r) => r.id === id)?.from_store_id === store,
        ),
      );
    } else if (!preselect?.length && groups.length === 1) {
      setSel(groups[0][1].reqs.map((r) => r.id));
    }
  }, [open, preselect, openReqs, groups]);

  const toggle = (r: RestockRequest) =>
    setSel((s) => {
      if (s.includes(r.id)) return s.filter((x) => x !== r.id);
      const sameStore = s.filter(
        (id) =>
          openReqs.find((x) => x.id === id)?.from_store_id === r.from_store_id,
      );
      return [...sameStore, r.id];
    });

  const selected = openReqs.filter((r) => sel.includes(r.id));
  const fill = useMemo(
    () => computeFill(selected, plan?.products || [], products),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sel, openReqs, plan, products],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>ابدأ من طلب بضاعة</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {(isLoading || planLoading) && <LinearProgress />}
        {planError && (
          <Alert severity="error" sx={{ m: 2 }}>
            تعذر حساب التقسيم المقترح — أعد فتح النافذة
          </Alert>
        )}
        {!isLoading && groups.length === 0 && (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              لا توجد طلبات مفتوحة واردة لهذا المتجر.
            </Typography>
          </Box>
        )}
        <List disablePadding>
          {groups.map(([sid, g]) => (
            <Box key={sid}>
              <ListSubheader sx={{ fontWeight: 700, lineHeight: "40px" }}>
                من {g.name}
              </ListSubheader>
              {g.reqs.map((r) => (
                <ListItemButton key={r.id} onClick={() => toggle(r)} dense>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Checkbox
                      edge="start"
                      checked={sel.includes(r.id)}
                      tabIndex={-1}
                      disableRipple
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong>#{r.id}</strong>
                        <Chip
                          size="small"
                          color={STATE_COLOR[r.state]}
                          label={STATE_LABEL[r.state]}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {fmtWhen(r.created_at)} · بقي {r.totals.lines_open}{" "}
                          صنف
                        </Typography>
                      </Box>
                    }
                    secondary={
                      r.note ||
                      r.lines
                        .filter((l) => l.remaining > 0)
                        .slice(0, 4)
                        .map((l) => l.name)
                        .join("، ")
                    }
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              ))}
              <Divider />
            </Box>
          ))}
        </List>
        {fill && (
          <Box sx={{ p: 2 }}>
            <Alert
              severity={
                fill.unavailable.length || fill.partial.length
                  ? "warning"
                  : "success"
              }
            >
              سيُضاف {fill.lines.length} صنف للسلة
              {fill.partial.length > 0 &&
                ` · ${fill.partial.length} بكمية أقل من المطلوب`}
              {fill.unavailable.length > 0 &&
                ` · ${fill.unavailable.length} غير متوفر هنا`}
            </Alert>
            {fill.partial.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                جزئي:{" "}
                {fill.partial
                  .map(
                    (p) =>
                      `${p.name} (${fmtQty(p.qty)} من ${fmtQty(p.remaining)})`,
                  )
                  .join("، ")}
              </Typography>
            )}
            {fill.unavailable.length > 0 && (
              <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                غير متوفر: {fill.unavailable.join("، ")}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose}>إلغاء</Button>
        <Button
          variant="contained"
          disabled={!fill || !plan || planLoading}
          onClick={() => fill && onApply(fill)}
        >
          تعبئة السلة
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RestockPicker;

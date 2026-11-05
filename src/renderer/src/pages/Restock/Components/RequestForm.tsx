import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SendIcon from "@mui/icons-material/Send";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Product, ProductPackage, StoreData } from "../../utils/types";
import ProductAutocomplete from "../../Shared/ProductAutocomplete";
import NumberField from "../../Shared/NumberField";
import MobileCheckoutBar, {
  MobileBarSpacer,
} from "../../Shared/MobileCheckoutBar";
import useBarcodeDetection from "../../Shared/hooks/useBarcodeDetection";
import { AlertMsg } from "../../Shared/AlertMessage";
import { apiError } from "../../utils/errors";
import {
  Draft,
  DraftLine,
  RestockRequest,
  addToDraft,
  emptyDraft,
  fmtQty,
  loadDraft,
  restockApi,
  saveDraft,
} from "../api";

const activePkgs = (p?: Product) =>
  (p?.packages || []).filter((k) => k.units >= 2);

/** Days a store's stock lasts at its sales rate. */
const coverDays = (stock: number, daily: number) =>
  daily > 0 ? Math.max(0, stock) / daily : Infinity;

const SUGGEST_COVER_DAYS = 3; // flag items running out within this
const SUGGEST_TARGET_DAYS = 7; // and suggest enough for this long

export type FormMode =
  | { kind: "new" }
  | { kind: "edit"; request: RestockRequest };

const RequestForm = ({
  storeId,
  stores,
  products,
  mode,
  onDone,
  onCancelEdit,
  setMsg,
}: {
  storeId: number;
  stores: StoreData[];
  products: Product[];
  mode: FormMode;
  onDone: (r: RestockRequest, merged: boolean) => void;
  onCancelEdit: () => void;
  setMsg: (m: AlertMsg) => void;
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const queryClient = useQueryClient();
  const editing = mode.kind === "edit" ? mode.request : null;

  const suppliers = useMemo(
    () => stores.filter((s) => s.id !== storeId),
    [stores, storeId],
  );
  const byId = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of products) if (p.id != null) m.set(p.id, p);
    return m;
  }, [products]);
  const packUnits = useCallback(
    (productId: number, packageId: number) =>
      activePkgs(byId.get(productId)).find((k) => k.id === packageId)?.units ||
      0,
    [byId],
  );

  // ─── state: the persisted draft, or the request being edited ─────────────
  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? {
          to_store_id: editing.to_store_id,
          note: editing.note,
          carry_from: [],
          lines: editing.lines.map((l) => ({
            product_id: l.product_id,
            units: l.quantity,
            package_id: l.package_id,
          })),
        }
      : loadDraft(storeId),
  );
  const loadedFor = useRef(storeId);
  useEffect(() => {
    // Store switched while on the page: show that store's draft.
    if (!editing && loadedFor.current !== storeId) {
      loadedFor.current = storeId;
      setDraft(loadDraft(storeId));
    }
  }, [storeId, editing]);
  useEffect(() => {
    if (!editing) saveDraft(storeId, draft);
  }, [draft, storeId, editing]);

  // Default supplier: remembered, or the only other store.
  useEffect(() => {
    if (
      draft.to_store_id != null &&
      suppliers.some((s) => s.id === draft.to_store_id)
    )
      return;
    // Store ids start at 0, so a missing key must not read as Number(null) = 0.
    const raw = localStorage.getItem(`restockSupplier_${storeId}`);
    const remembered = raw == null || raw === "" ? NaN : Number(raw);
    const pick =
      suppliers.find((s) => s.id === remembered)?.id ??
      (suppliers.length === 1 ? suppliers[0].id : null);
    if (pick != null) setDraft((d) => ({ ...d, to_store_id: pick }));
  }, [suppliers, draft.to_store_id, storeId]);

  // ─── hints ───────────────────────────────────────────────────────────────
  const { data: usage } = useQuery({
    queryKey: ["restockUsage", storeId],
    queryFn: () => restockApi.usage(storeId),
    staleTime: 5 * 60_000,
  });
  const rate = useCallback(
    (pid: number) => usage?.rates?.[String(pid)] ?? 0,
    [usage],
  );
  const { data: pending } = useQuery({
    queryKey: ["restock", "pending", storeId],
    queryFn: () => restockApi.pending(storeId),
  });
  const pendingByProduct = useMemo(() => {
    const m = new Map<number, { remaining: number; requests: number[] }>();
    for (const p of pending?.pending || []) {
      // While editing, the request's own lines aren't "already requested".
      const others = editing
        ? p.requests.filter((id) => id !== editing.id)
        : p.requests;
      if (others.length) m.set(p.product_id, { ...p, requests: others });
    }
    return m;
  }, [pending, editing]);

  const sentById = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of editing?.lines || []) m.set(l.product_id, l.sent);
    return m;
  }, [editing]);

  // ─── line operations ─────────────────────────────────────────────────────
  const addProduct = useCallback(
    (product: Product | null, pkg?: ProductPackage | null) => {
      if (!product?.id) return;
      const pid = product.id;
      setDraft((d) => {
        const existing = d.lines.find((l) => l.product_id === pid);
        const step = pkg ? pkg.units : 1;
        return addToDraft(
          d,
          [
            {
              product_id: pid,
              units: step,
              package_id: existing ? existing.package_id : (pkg?.id ?? null),
            },
          ],
          packUnits,
        );
      });
    },
    [packUnits],
  );
  const [scanMsg, setScanMsg] = useState<AlertMsg>({ type: "", text: "" });
  useEffect(() => {
    if (scanMsg.text) setMsg(scanMsg);
  }, [scanMsg, setMsg]);
  useBarcodeDetection(products, addProduct, setScanMsg);

  const setLine = (pid: number, patch: Partial<DraftLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.product_id === pid ? { ...l, ...patch } : l,
      ),
    }));
  const removeLine = (pid: number) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.filter((l) => l.product_id !== pid),
    }));

  // ─── suggestions: running out soon at this store ─────────────────────────
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestions = useMemo(() => {
    if (!usage) return [];
    const inDraft = new Set(draft.lines.map((l) => l.product_id));
    const out: { product: Product; days: number; qty: number }[] = [];
    for (const [pidStr, daily] of Object.entries(usage.rates)) {
      const pid = Number(pidStr);
      const p = byId.get(pid);
      if (!p || inDraft.has(pid) || pendingByProduct.has(pid)) continue;
      const days = coverDays(p.stock, daily);
      if (days >= SUGGEST_COVER_DAYS) continue;
      const qty = Math.max(
        1,
        Math.ceil(daily * SUGGEST_TARGET_DAYS - Math.max(0, p.stock)),
      );
      out.push({ product: p, days, qty });
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 60);
  }, [usage, byId, draft.lines, pendingByProduct]);

  const addSuggestions = (items: { product: Product; qty: number }[]) =>
    setDraft((d) =>
      addToDraft(
        d,
        items.map((s) => ({ product_id: s.product.id!, units: s.qty })),
        packUnits,
      ),
    );

  // ─── follow-ups: leftovers of closed requests ────────────────────────────
  const followups = editing ? [] : pending?.followups || [];
  const carryLeftovers = () => {
    setDraft((d) => {
      const next = addToDraft(
        d,
        followups.flatMap((f) =>
          f.lines
            .filter((l) => l.remaining > 0)
            .map((l) => ({
              product_id: l.product_id,
              units: l.remaining,
              package_id: l.package_id,
            })),
        ),
        packUnits,
      );
      return {
        ...next,
        carry_from: Array.from(
          new Set([...d.carry_from, ...followups.map((f) => f.id)]),
        ),
      };
    });
  };
  const dismissLeftovers = async () => {
    try {
      await restockApi.dismiss(
        storeId,
        followups.map((f) => f.id),
      );
      queryClient.invalidateQueries({
        queryKey: ["restock", "pending", storeId],
      });
    } catch (e) {
      setMsg({ type: "error", text: apiError(e) });
    }
  };
  const carried = new Set(draft.carry_from);
  const followupsToShow = followups.filter((f) => !carried.has(f.id));

  // ─── submit ──────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [mergeAsk, setMergeAsk] = useState<{ id: number } | null>(null);
  const validLines = draft.lines.filter((l) => l.units > 0);
  const supplierName =
    suppliers.find((s) => s.id === draft.to_store_id)?.name || "";
  const anySent = (editing?.totals.sent || 0) > 0;

  const linesPayload = () =>
    validLines.map((l) => ({
      product_id: l.product_id,
      quantity: Math.round(l.units),
      package_id: l.package_id,
    }));

  const send = async (mergeInto: number | null) => {
    if (draft.to_store_id == null) return;
    setBusy(true);
    try {
      if (editing) {
        const r = await restockApi.edit(editing.id, {
          store_id: storeId,
          to_store_id: draft.to_store_id,
          note: draft.note,
          lines: linesPayload(),
        });
        onDone(r, false);
      } else {
        const { request, merged } = await restockApi.create({
          store_id: storeId,
          to_store_id: draft.to_store_id,
          note: draft.note,
          lines: linesPayload(),
          carry_from: draft.carry_from,
          merge_into: mergeInto,
        });
        localStorage.setItem(
          `restockSupplier_${storeId}`,
          String(draft.to_store_id),
        );
        setDraft({ ...emptyDraft(), to_store_id: draft.to_store_id });
        onDone(request, merged);
      }
      queryClient.invalidateQueries({ queryKey: ["restock"] });
      queryClient.invalidateQueries({
        queryKey: ["restock", "pending", storeId],
      });
    } catch (e) {
      setMsg({ type: "error", text: apiError(e, "تعذر إرسال الطلب") });
    } finally {
      setBusy(false);
      setMergeAsk(null);
    }
  };

  const submit = () => {
    if (!validLines.length || draft.to_store_id == null || busy) return;
    if (!editing) {
      const untouched = (pending?.untouched || []).find(
        (u) => u.to_store_id === draft.to_store_id,
      );
      if (untouched) {
        setMergeAsk({ id: untouched.id });
        return;
      }
    }
    send(null);
  };

  const totalUnits = validLines.reduce((a, l) => a + l.units, 0);

  // ─── render ──────────────────────────────────────────────────────────────
  return (
    <Stack spacing={2}>
      {editing && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={onCancelEdit}>
              إلغاء التعديل
            </Button>
          }
        >
          تعديل الطلب #{editing.id}
          {anySent && " — لا يمكن تقليل صنف عن الكمية المرسلة بالفعل"}
        </Alert>
      )}

      {followupsToShow.length > 0 && (
        <Alert
          severity="warning"
          icon={<HistoryIcon />}
          action={
            <Stack direction="row" spacing={0.5}>
              <Button color="inherit" size="small" onClick={carryLeftovers}>
                إضافة الناقص
              </Button>
              <Button color="inherit" size="small" onClick={dismissLeftovers}>
                تجاهل
              </Button>
            </Stack>
          }
        >
          <AlertTitle sx={{ mb: 0 }}>أصناف لم تصلك من طلبات سابقة</AlertTitle>
          {followupsToShow
            .map(
              (f) =>
                `#${f.id} (${f.totals.lines_open} صنف${f.close_note ? ` — ${f.close_note}` : ""})`,
            )
            .join(" · ")}
        </Alert>
      )}

      <Card sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ md: "center" }}
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>اطلب من</InputLabel>
            <Select
              label="اطلب من"
              value={draft.to_store_id ?? ""}
              disabled={!!editing && anySent}
              onChange={(e) =>
                setDraft((d) => ({ ...d, to_store_id: Number(e.target.value) }))
              }
            >
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name || `متجر ${s.id}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }}>
            <ProductAutocomplete
              label="ابحث عن منتج أو امسح الباركود"
              onProductSelect={addProduct}
              withPackages
              products={products}
              size="small"
            />
          </Box>
          {suggestions.length > 0 && (
            <Button
              variant={showSuggest ? "contained" : "outlined"}
              color="secondary"
              startIcon={<AutoAwesomeIcon />}
              endIcon={showSuggest ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setShowSuggest((v) => !v)}
              sx={{ whiteSpace: "nowrap" }}
            >
              اقتراحات ({suggestions.length})
            </Button>
          )}
        </Stack>

        <Collapse in={showSuggest && suggestions.length > 0} unmountOnExit>
          <Box sx={{ mt: 1.5 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
              gap={1}
              flexWrap="wrap"
            >
              <Typography variant="body2" color="text.secondary">
                منتجات تنفد خلال {SUGGEST_COVER_DAYS} أيام حسب مبيعاتك — الكمية
                المقترحة تكفي {SUGGEST_TARGET_DAYS} أيام
              </Typography>
              <Button size="small" onClick={() => addSuggestions(suggestions)}>
                إضافة الكل
              </Button>
            </Stack>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {suggestions.map((s) => (
                <Chip
                  key={s.product.id}
                  icon={<AddIcon />}
                  onClick={() => addSuggestions([s])}
                  color={s.product.stock <= 0 ? "error" : "warning"}
                  variant="outlined"
                  label={`${s.product.name} · ${
                    s.product.stock <= 0
                      ? "نفد"
                      : `يكفي ${Math.max(0, Math.floor(s.days))} يوم`
                  } · +${fmtQty(s.qty)}`}
                />
              ))}
            </Box>
          </Box>
        </Collapse>
      </Card>

      <Card sx={{ p: 0 }}>
        {validLines.length === 0 && draft.lines.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              ابحث عن منتج أو امسح باركود لإضافته إلى الطلب
            </Typography>
          </Box>
        ) : (
          <Stack divider={<Divider />}>
            {[...draft.lines].reverse().map((l) => {
              const p = byId.get(l.product_id);
              const pkgs = activePkgs(p);
              const pkg = l.package_id
                ? pkgs.find((k) => k.id === l.package_id)
                : undefined;
              const per = pkg?.units || 1;
              const sent = sentById.get(l.product_id) || 0;
              const already = pendingByProduct.get(l.product_id);
              const daily = rate(l.product_id);
              return (
                <Box
                  key={l.product_id}
                  sx={{
                    px: { xs: 1.5, md: 2 },
                    py: 1.25,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
                    <Typography fontWeight={600} noWrap>
                      {p?.name || `منتج ${l.product_id}`}
                    </Typography>
                    <Stack
                      direction="row"
                      gap={0.75}
                      flexWrap="wrap"
                      sx={{ mt: 0.5 }}
                    >
                      {p && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={p.stock <= 0 ? "error" : "default"}
                          label={`عندك ${fmtQty(p.stock)}`}
                        />
                      )}
                      {daily > 0 && (
                        <Tooltip title={`متوسط آخر ${usage?.days ?? 30} يوم`}>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`تبيع ~${fmtQty(Math.round(daily * 10) / 10)}/يوم`}
                          />
                        </Tooltip>
                      )}
                      {already && (
                        <Chip
                          size="small"
                          color="warning"
                          label={`مطلوب بالفعل ${fmtQty(already.remaining)} (طلب ${already.requests
                            .map((r) => `#${r}`)
                            .join("، ")})`}
                        />
                      )}
                      {sent > 0 && (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          label={`أُرسل ${fmtQty(sent)}`}
                        />
                      )}
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {pkgs.length > 0 && (
                      <Select
                        size="small"
                        value={l.package_id ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value) || null;
                          const newPer = v
                            ? pkgs.find((k) => k.id === v)?.units || 1
                            : 1;
                          // Keep the typed count, change what it counts.
                          const count = l.units / per;
                          setLine(l.product_id, {
                            package_id: v,
                            units: Math.max(1, Math.round(count)) * newPer,
                          });
                        }}
                        sx={{ minWidth: 104 }}
                      >
                        <MenuItem value={0}>قطعة</MenuItem>
                        {pkgs.map((k) => (
                          <MenuItem key={k.id} value={k.id}>
                            {k.name} ({k.units})
                          </MenuItem>
                        ))}
                      </Select>
                    )}
                    <NumberField
                      size="small"
                      integer
                      value={Math.round((l.units / per) * 100) / 100}
                      onValueChange={(v) =>
                        setLine(l.product_id, { units: Math.max(0, v) * per })
                      }
                      min={0}
                      sx={{ width: 96 }}
                      error={l.units <= 0 || l.units < sent}
                      helperText={
                        pkg && l.units > 0
                          ? `${fmtQty(l.units)} قطعة`
                          : undefined
                      }
                      slotProps={{ htmlInput: { "aria-label": "الكمية" } }}
                    />
                    <IconButton
                      aria-label="حذف"
                      onClick={() => removeLine(l.product_id)}
                      disabled={sent > 0}
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Card>

      <Card sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ md: "center" }}
        >
          <TextField
            size="small"
            label="ملاحظة للمخزن (اختياري)"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            fullWidth
            multiline
            maxRows={3}
          />
          {!isMobile && (
            <>
              <Typography sx={{ whiteSpace: "nowrap" }} color="text.secondary">
                {validLines.length} صنف · {fmtQty(totalUnits)} قطعة
              </Typography>
              {!editing && draft.lines.length > 0 && (
                <Button
                  color="inherit"
                  onClick={() =>
                    setDraft({
                      ...emptyDraft(),
                      to_store_id: draft.to_store_id,
                    })
                  }
                >
                  تفريغ
                </Button>
              )}
              <Button
                variant="contained"
                size="large"
                startIcon={<SendIcon />}
                onClick={submit}
                disabled={
                  !validLines.length || draft.to_store_id == null || busy
                }
                sx={{ whiteSpace: "nowrap", minWidth: 160 }}
              >
                {editing ? "حفظ التعديل" : "إرسال الطلب"}
              </Button>
            </>
          )}
        </Stack>
      </Card>

      {isMobile && (
        <>
          <MobileBarSpacer />
          <MobileCheckoutBar
            total={validLines.length}
            count={validLines.length}
            caption={
              draft.to_store_id == null
                ? "اختر المتجر المطلوب منه"
                : `إلى ${supplierName} · عدد الأصناف`
            }
            onSave={submit}
            disabled={!validLines.length || draft.to_store_id == null || busy}
            saveLabel={editing ? "حفظ" : "إرسال الطلب"}
          />
        </>
      )}

      <Dialog
        open={!!mergeAsk}
        onClose={() => setMergeAsk(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>عندك طلب لم يُجهَّز بعد</DialogTitle>
        <DialogContent>
          <Typography>
            الطلب #{mergeAsk?.id} إلى {supplierName} لم يبدأ تجهيزه. الأفضل
            إضافة الأصناف إليه بدل إرسال طلب ثانٍ.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
          <Button onClick={() => setMergeAsk(null)} disabled={busy}>
            رجوع
          </Button>
          <Button onClick={() => send(null)} disabled={busy}>
            طلب جديد منفصل
          </Button>
          <Button
            variant="contained"
            onClick={() => mergeAsk && send(mergeAsk.id)}
            disabled={busy}
            autoFocus
          >
            إضافة للطلب #{mergeAsk?.id}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default RequestForm;

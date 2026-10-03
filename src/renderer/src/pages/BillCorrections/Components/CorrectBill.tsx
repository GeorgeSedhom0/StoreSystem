import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Delete as DeleteIcon, Search as SearchIcon } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useContext, useEffect, useMemo, useState } from "react";
import { StoreContext } from "@renderer/StoreDataProvider";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import LoadingScreen from "../../Shared/LoadingScreen";
import PaymentSplit, { PaymentLineState } from "../../Shared/PaymentSplit";
import ProductAutocomplete from "../../Shared/ProductAutocomplete";
import usePaymentMethods from "../../Shared/hooks/usePaymentMethods";
import useParties from "../../Shared/hooks/useParties";
import PartySelect from "../../Shared/PartySelect";
import { DBProducts, Product } from "../../utils/types";
import {
  CorrectionBillResponse,
  CorrectionLine,
  CorrectionResult,
  billTypeLabels,
  egp,
} from "../types";
import ImpactView from "./ImpactView";

const errText = (e: any, fallback: string) => e?.response?.data?.detail || fallback;

const CorrectBill = ({ onApplied }: { onApplied: () => void }) => {
  const { storeId: contextStoreId } = useContext(StoreContext);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [storeId, setStoreId] = useState<number>(contextStoreId);
  const [billIdInput, setBillIdInput] = useState("");
  const [data, setData] = useState<CorrectionBillResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [lines, setLines] = useState<CorrectionLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [partyId, setPartyId] = useState<number | null>(null);
  const [editPayments, setEditPayments] = useState(false);
  const [paymentLines, setPaymentLines] = useState<PaymentLineState[]>([]);
  const [cascade, setCascade] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { paymentMethods } = usePaymentMethods(setMsg);
  const { parties } = useParties(setMsg);

  const { data: stores } = useQuery({
    queryKey: ["bill-corrections", "stores"],
    queryFn: async () =>
      (await axios.get<{ id: number; name: string }[]>("/bill-corrections/stores")).data,
    initialData: [],
  });

  const { data: products } = useQuery({
    queryKey: ["bill-corrections", "products", storeId],
    queryFn: async () =>
      (await axios.get<DBProducts>("/products", { params: { store_id: storeId } })).data.products,
    initialData: [],
  });

  const bill = data?.bill;
  const pair = data?.pair;
  // The source side of a transfer is priced at cost.
  const priceLocked = Boolean(pair && bill?.type === "sell");
  const usesSellPrice = bill?.type === "sell" || bill?.type === "return";

  const total = useMemo(() => {
    if (deleting) return 0;
    const gross = lines.reduce(
      (acc, l) => acc + l.quantity * (usesSellPrice ? (priceLocked ? l.wholesale_price : l.price) : l.wholesale_price),
      0,
    );
    return Math.max(Math.round((gross - discount) * 100) / 100, 0);
  }, [lines, discount, usesSellPrice, priceLocked, deleting]);

  const reset = (d: CorrectionBillResponse) => {
    setLines(d.bill.lines.map((l) => ({ ...l })));
    setDiscount(d.bill.discount);
    setPartyId(d.bill.party_id);
    setPaymentLines(
      (d.bill.payments ?? [])
        .filter((p) => p.method_id != null)
        .map((p) => ({ method_id: p.method_id as number, amount: p.amount })),
    );
    setEditPayments(false);
    setCascade(true);
    setDeleting(false);
    setNote("");
    setResult(null);
  };

  const loadBill = async (id = billIdInput, store = storeId) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: d } = await axios.get<CorrectionBillResponse>("/bill-corrections/bill", {
        params: { store_id: store, bill_id: id },
      });
      setData(d);
      reset(d);
    } catch (e) {
      setData(null);
      setMsg({ type: "error", text: errText(e, "تعذر تحميل الفاتورة") });
    } finally {
      setLoading(false);
    }
  };

  // Any edit invalidates the last preview.
  useEffect(() => setResult(null), [lines, discount, partyId, editPayments, paymentLines, cascade, deleting]);

  const partyChanged = Boolean(bill) && partyId !== (bill?.party_id ?? null);
  const isTransfer = Boolean(pair) || bill?.party_type === "store";

  const updateLine = (i: number, patch: Partial<CorrectionLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const addProduct = (p: Product | null) => {
    if (!p || p.id == null) return;
    setLines((prev) => [
      ...prev,
      {
        flow_id: null,
        product_id: p.id as number,
        name: p.name,
        quantity: 1,
        wholesale_price: p.wholesale_price,
        price: priceLocked ? p.wholesale_price : p.price,
      },
    ]);
  };

  const request = (state_token?: string) => ({
    store_id: storeId,
    bill_id: bill?.bill_id,
    action: deleting ? "delete" : "edit",
    discount,
    lines: lines.map(({ flow_id, product_id, quantity, wholesale_price, price }) => ({
      flow_id,
      product_id,
      quantity,
      wholesale_price,
      price,
    })),
    payments:
      editPayments && !pair
        ? paymentLines.filter((p) => p.amount > 0).map((p) => ({ method_id: p.method_id, amount: p.amount }))
        : null,
    cascade_costs: cascade,
    set_party: partyChanged && !deleting,
    party_id: partyId,
    note: note || null,
    state_token,
  });

  const preview = async () => {
    setLoading(true);
    try {
      // Checked against the bill as it was loaded, so someone else's change
      // in between is caught instead of silently overwritten.
      const { data: r } = await axios.post<CorrectionResult>("/bill-corrections/preview", request(data?.state_token));
      setResult(r);
    } catch (e) {
      setMsg({ type: "error", text: errText(e, "تعذرت المعاينة") });
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setConfirmOpen(false);
    setLoading(true);
    try {
      await axios.post<CorrectionResult>("/bill-corrections/apply", request(result.token));
      setMsg({ type: "success", text: deleting ? "تم حذف الفاتورة" : "تم تصحيح الفاتورة" });
      onApplied();
      if (deleting) {
        setData(null);
        setResult(null);
      } else {
        await loadBill(String(bill?.bill_id), storeId);
      }
    } catch (e) {
      setMsg({ type: "error", text: errText(e, "تعذر تطبيق التصحيح") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3} sx={{ position: "relative" }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={loading} />

      <Alert severity="warning">
        التصحيح يعيد كتابة الفاتورة كأنها سُجّلت هكذا من البداية: يتغير المخزون والنقدية والحسابات بأثر رجعي دون أي حركة
        جديدة. استخدمه فقط لتصحيح أخطاء الإدخال.
      </Alert>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>المتجر</InputLabel>
          <Select
            label="المتجر"
            value={stores.some((s) => s.id === storeId) ? storeId : ""}
            onChange={(e) => {
              setStoreId(Number(e.target.value));
              setData(null);
            }}
          >
            {stores.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="رقم الفاتورة"
          type="number"
          value={billIdInput}
          onChange={(e) => setBillIdInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadBill()}
        />
        <Button variant="contained" startIcon={<SearchIcon />} onClick={() => loadBill()}>
          تحميل الفاتورة
        </Button>
      </Stack>

      {bill && data && (
        <>
          <Card variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography variant="h6">فاتورة #{bill.bill_id}</Typography>
              <Chip label={billTypeLabels[bill.type] ?? bill.type} />
              <Chip label={bill.store_name} variant="outlined" />
              {bill.party_name && <Chip label={bill.party_name} variant="outlined" />}
              <Typography variant="body2" color="text.secondary">
                {new Date(bill.time).toLocaleString("ar-EG")}
              </Typography>
              <Typography variant="body2">الإجمالي الحالي: {egp(Math.abs(bill.total))}</Typography>
            </Stack>
            {pair && (
              <Alert severity="info" sx={{ mt: 2 }}>
                فاتورة نقل مرتبطة بفاتورة #{pair.bill_id} في {pair.store_name}. سيتم تصحيح الفاتورتين معاً بنفس المنتجات
                والكميات والتكلفة.
              </Alert>
            )}
            {data.legacy_pair_candidates.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                تبدو هذه فاتورة نقل قديمة غير مرتبطة. الفاتورة المقابلة على الأرجح:{" "}
                {data.legacy_pair_candidates.map((c) => `#${c.id} (متجر ${c.store_id})`).join("، ")} — صحّحها بنفس الطريقة.
              </Alert>
            )}
            {data.history.length > 0 && (
              <Alert severity="info" sx={{ mt: 2 }}>
                صُححت هذه الفاتورة من قبل {data.history.length} مرة (راجع سجل التصحيحات).
              </Alert>
            )}
            {!data.correctable && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {data.reason}
              </Alert>
            )}
          </Card>

          {data.correctable && (
            <>
              <FormControlLabel
                control={<Switch color="error" checked={deleting} onChange={(e) => setDeleting(e.target.checked)} />}
                label={pair ? "حذف الفاتورة نهائياً (مع الفاتورة المرتبطة) كأنها لم تكن" : "حذف الفاتورة نهائياً كأنها لم تكن"}
              />

              {!deleting && (
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ mb: 2, maxWidth: 420 }}>
                    <PartySelect
                      parties={parties}
                      value={partyId}
                      onChange={setPartyId}
                      disabled={isTransfer}
                      helperText={
                        isTransfer
                          ? "لا يمكن تغيير الطرف الثاني لفاتورة نقل بين المتاجر"
                          : partyChanged
                            ? `كان: ${bill.party_name ?? "بدون"}`
                            : undefined
                      }
                    />
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>المنتج</TableCell>
                        <TableCell>الكمية</TableCell>
                        <TableCell>سعر الشراء (التكلفة)</TableCell>
                        <TableCell>سعر البيع</TableCell>
                        <TableCell>الإجمالي</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lines.map((l, i) => {
                        const orig = bill.lines.find((o) => o.flow_id === l.flow_id && l.flow_id != null);
                        const changed = (k: keyof CorrectionLine) => orig && orig[k] !== l[k];
                        const lineTotal =
                          l.quantity * (usesSellPrice ? (priceLocked ? l.wholesale_price : l.price) : l.wholesale_price);
                        return (
                          <TableRow key={`${l.flow_id ?? "new"}-${i}`} sx={{ bgcolor: orig ? undefined : "action.hover" }}>
                            <TableCell>
                              {l.name}
                              {!orig && <Chip size="small" label="جديد" color="success" sx={{ mx: 1 }} />}
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                type="number"
                                value={l.quantity}
                                color={changed("quantity") ? "warning" : undefined}
                                focused={changed("quantity") || undefined}
                                onChange={(e) => updateLine(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 0)) })}
                                sx={{ width: 90 }}
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                type="number"
                                value={l.wholesale_price}
                                color={changed("wholesale_price") ? "warning" : undefined}
                                focused={changed("wholesale_price") || undefined}
                                helperText={changed("wholesale_price") ? `كان ${orig?.wholesale_price}` : undefined}
                                onChange={(e) =>
                                  updateLine(i, {
                                    wholesale_price: Math.max(0, Number(e.target.value) || 0),
                                    ...(priceLocked ? { price: Math.max(0, Number(e.target.value) || 0) } : {}),
                                  })
                                }
                                sx={{ width: 120 }}
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                type="number"
                                value={priceLocked ? l.wholesale_price : l.price}
                                disabled={priceLocked}
                                color={changed("price") ? "warning" : undefined}
                                focused={(!priceLocked && changed("price")) || undefined}
                                helperText={!priceLocked && changed("price") ? `كان ${orig?.price}` : undefined}
                                onChange={(e) => updateLine(i, { price: Math.max(0, Number(e.target.value) || 0) })}
                                sx={{ width: 120 }}
                              />
                            </TableCell>
                            <TableCell>{egp(lineTotal)}</TableCell>
                            <TableCell>
                              <IconButton size="small" color="error" onClick={() => setLines((p) => p.filter((_, j) => j !== i))}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <Box sx={{ mt: 2, maxWidth: 420 }}>
                    <ProductAutocomplete onProductSelect={addProduct} products={products} />
                  </Box>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }} alignItems={{ sm: "center" }}>
                    <TextField
                      size="small"
                      type="number"
                      label="الخصم"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                      sx={{ width: 140 }}
                    />
                    <Typography variant="h6">
                      الإجمالي الجديد: {egp(total)}{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        (كان {egp(Math.abs(bill.total))})
                      </Typography>
                    </Typography>
                  </Stack>
                </Card>
              )}

              {!deleting && !pair && (
                <Card variant="outlined" sx={{ p: 2 }}>
                  <FormControlLabel
                    control={<Checkbox checked={editPayments} onChange={(e) => setEditPayments(e.target.checked)} />}
                    label="تعديل توزيع طرق الدفع (وإلا يُعاد توزيع الإجمالي الجديد بنفس النسب الحالية)"
                  />
                  {editPayments && (
                    <PaymentSplit
                      total={total}
                      methods={paymentMethods}
                      lines={paymentLines}
                      setLines={setPaymentLines}
                      currentStoreId={storeId}
                    />
                  )}
                </Card>
              )}

              {(bill.type === "buy" || pair) && (
                <FormControlLabel
                  control={<Checkbox checked={cascade} onChange={(e) => setCascade(e.target.checked)} />}
                  label={
                    deleting
                      ? "إعادة سجل الأسعار كأن فاتورة الشراء لم تكن: تكلفة الفواتير اللاحقة وسعر المنتج الحالي يرجعان لسعر الشراء السابق"
                      : "إعادة سجل الأسعار كأن فاتورة الشراء سُجّلت هكذا: تكلفة الفواتير اللاحقة (حتى أول شراء تالٍ للمنتج) وسعر المنتج الحالي إن لم يتغير بعدها"
                  }
                />
              )}

              <TextField
                size="small"
                label="سبب التصحيح (يُحفظ في السجل)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                fullWidth
              />

              <Stack direction="row" spacing={2}>
                <Button variant="outlined" onClick={preview}>
                  معاينة التأثير
                </Button>
                <Button variant="contained" color="error" disabled={!result} onClick={() => setConfirmOpen(true)}>
                  {deleting ? "حذف الفاتورة" : "تطبيق التصحيح"}
                </Button>
                <Button onClick={() => reset(data)}>إلغاء التعديلات</Button>
              </Stack>

              {result && (
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    المعاينة
                  </Typography>
                  <ImpactView result={result} />
                </Card>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{deleting ? "حذف الفاتورة نهائياً؟" : "تطبيق التصحيح؟"}</DialogTitle>
        <DialogContent>
          <Typography>
            سيتم تعديل البيانات بأثر رجعي كما في المعاينة. يمكن التراجع عن التعديل لاحقاً من سجل التصحيحات
            {deleting ? "، أما الحذف فلا يمكن التراجع عنه" : ""}.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>إلغاء</Button>
          <Button color="error" variant="contained" onClick={apply}>
            تأكيد
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default CorrectBill;

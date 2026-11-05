import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid2,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Bill,
  BillLine,
  PaymentMethod,
  Product,
  ProductPackage,
} from "../../utils/types";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import LoadingScreen from "../../Shared/LoadingScreen";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import ProductAutocomplete from "../../Shared/ProductAutocomplete";
import { StoreContext } from "@renderer/StoreDataProvider";
import PartySelect from "../../Shared/PartySelect";
import NumberField from "../../Shared/NumberField";
import useParties from "../../Shared/hooks/useParties";
import usePaymentMethods from "../../Shared/hooks/usePaymentMethods";
import PaymentSplit, {
  buildPayments,
  PaymentLineState,
} from "../../Shared/PaymentSplit";
import { isPackageLine, packageLabel, round2 } from "../../Shared/packages";

// Bill types whose money is split over payment methods (accounts).
const PAYABLE = ["sell", "return", "buy", "buy-return"];
const BUY_LIKE = ["buy", "buy-return"];

/** One editable line. A package line is edited in packages: `amount` is the
 * number of packages, `price` the package price (sell types) and
 * `wholesale_price` the package cost. On buy types `price` stays the UNIT sell
 * price (as in the buy cart). Converted back to units on save. */
type EditLine = BillLine & { key: string };

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

const toEditLine = (l: BillLine, i: number, buyLike: boolean): EditLine => {
  const amount = Math.abs(l.amount);
  const u = l.package_units || 0;
  if (isPackageLine(l) && amount % u === 0) {
    return {
      ...l,
      key: `l${i}`,
      amount: amount / u,
      price: buyLike ? l.price : round2(l.price * u),
      wholesale_price: round2(l.wholesale_price * u),
    };
  }
  return {
    ...l,
    key: `l${i}`,
    amount,
    package_id: null,
    package_units: null,
    package_name: null,
  };
};

const toApiLine = (l: EditLine, buyLike: boolean) => {
  const { key: _key, ...rest } = l;
  if (!isPackageLine(l)) return rest;
  const u = l.package_units as number;
  return {
    ...rest,
    amount: l.amount * u,
    price: buyLike ? l.price : l.price / u,
    wholesale_price: l.wholesale_price / u,
  };
};

/** Proportional rescale of a split to a new total (what the server does when
 * only the lines change). */
const rescale = (
  lines: PaymentLineState[],
  total: number,
): PaymentLineState[] => {
  const s = lines.reduce((a, l) => a + l.amount, 0);
  if (s <= 0 || total <= 0) return lines.map((l) => ({ ...l, amount: 0 }));
  let acc = 0;
  return lines.map((l, i) => {
    const amount =
      i === lines.length - 1
        ? round2(total - acc)
        : round2((l.amount * total) / s);
    acc += amount;
    return { ...l, amount };
  });
};

const sameSplit = (a: PaymentLineState[], b: PaymentLineState[]) => {
  const m = (x: PaymentLineState[]) => {
    const o: Record<number, number> = {};
    x.forEach(
      (l) => (o[l.method_id] = round2((o[l.method_id] || 0) + l.amount)),
    );
    return o;
  };
  const ma = m(a);
  const mb = m(b);
  const keys = new Set([...Object.keys(ma), ...Object.keys(mb)]);
  return [...keys].every(
    (k) => Math.abs((ma[+k] || 0) - (mb[+k] || 0)) < 0.011,
  );
};

const EditableBill = ({
  bill,
  setEditing,
  getBills,
}: {
  bill: Bill | null;
  setEditing: Dispatch<SetStateAction<boolean>>;
  getBills: () => void;
}) => {
  if (!bill) return null;
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const buyLike = BUY_LIKE.includes(bill.type);

  const [lines, setLines] = useState<EditLine[]>(() =>
    bill.products.map((l, i) => toEditLine(l, i, buyLike)),
  );
  const [discount, setDiscount] = useState<number>(bill.discount || 0);
  const [products, setProducts] = useState<Product[]>([]);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [isPairedBill, setIsPairedBill] = useState(false);
  const [partyId, setPartyId] = useState<number | null>(bill.party_id ?? null);
  const [nextKey, setNextKey] = useState(bill.products.length);

  const { storeId } = useContext(StoreContext);
  const { parties } = useParties(setMsg);
  const { paymentMethods } = usePaymentMethods();
  const isTransfer =
    isPairedBill ||
    parties.find((p) => p.id === bill.party_id)?.type === "store";

  // What the lines looked like when the dialog opened, to tell whether the
  // save needs a full bill edit or only the in-place party/payments change.
  const [originalLines] = useState(() =>
    JSON.stringify({
      discount: bill.discount || 0,
      lines: bill.products.map((l, i) =>
        toApiLine(toEditLine(l, i, buyLike), buyLike),
      ),
    }),
  );

  useEffect(() => {
    const getProds = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get("/products", {
          params: { store_id: storeId },
        });
        setProducts(data.products);
      } catch (error) {
        console.log(error);
        setMsg({ type: "error", text: "تعذر تحميل المنتجات" });
      }
      setLoading(false);
    };
    getProds();
  }, [storeId]);

  useEffect(() => {
    axios
      .get<{ is_paired: boolean }>("/bill-pair-status", {
        params: { bill_id: bill.id, store_id: storeId },
      })
      .then(({ data }) => setIsPairedBill(Boolean(data?.is_paired)))
      .catch(() => setIsPairedBill(false));
  }, [bill.id, storeId]);

  // Same rule the edit flow has always used (the server derives the rest).
  const total = useMemo(() => {
    let gross = 0;
    if (["sell", "return"].includes(bill.type)) {
      lines.forEach((l) => (gross += l.price * l.amount));
    } else if (BUY_LIKE.includes(bill.type)) {
      lines.forEach((l) => (gross += l.wholesale_price * l.amount));
    }
    return round2(gross - discount);
  }, [lines, discount, bill.type]);

  // ── payments ────────────────────────────────────────────────────────────
  const canEditPayments = PAYABLE.includes(bill.type) && !isTransfer;
  const originalPay = useMemo<PaymentLineState[]>(
    () =>
      (bill.payments || [])
        .filter((p) => p.method_id != null)
        .map((p) => ({
          method_id: p.method_id as number,
          amount: Number(p.amount) || 0,
        })),
    [bill.payments],
  );
  // Active methods + any (since deleted) method this bill already uses.
  const methods = useMemo<PaymentMethod[]>(() => {
    const extra = (bill.payments || [])
      .filter(
        (p) =>
          p.method_id != null &&
          !paymentMethods.some((m) => m.id === p.method_id),
      )
      .map((p) => ({
        id: p.method_id as number,
        name: p.name || "طريقة محذوفة",
      }));
    return [...paymentMethods, ...extra];
  }, [paymentMethods, bill.payments]);
  const [payLines, setPayLines] = useState<PaymentLineState[]>(originalPay);
  const [payTouched, setPayTouched] = useState(false);
  // Until the user edits the split, follow the server's behaviour: the old
  // split rescaled proportionally to the new total.
  useEffect(() => {
    if (!payTouched) setPayLines(rescale(originalPay, total));
  }, [total, payTouched, originalPay]);

  const offStoreUsed = (bill.payments || []).some((p) => {
    const m = paymentMethods.find((x) => x.id === p.method_id);
    return m?.home_store_id != null && m.home_store_id !== storeId;
  });

  // ── lines ───────────────────────────────────────────────────────────────
  const updateLine = (key: string, patch: Partial<EditLine>) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );

  const addProduct = useCallback(
    (product: Product | null, pkg?: ProductPackage | null) => {
      if (!product?.id) return;
      const pid = product.id;
      setLines((prev) => {
        const existing = prev.find(
          (l) => l.id === pid && (l.package_id ?? null) === (pkg?.id ?? null),
        );
        if (existing) {
          return prev.map((l) =>
            l === existing ? { ...l, amount: l.amount + 1 } : l,
          );
        }
        const transferSell = isPairedBill && bill.type === "sell";
        const unitPrice = transferSell
          ? product.wholesale_price
          : product.price;
        const line: EditLine = {
          key: `n${nextKey}`,
          id: pid,
          name: product.name,
          bar_code: product.bar_code,
          amount: 1,
          wholesale_price: pkg
            ? round2(product.wholesale_price * pkg.units)
            : product.wholesale_price,
          price: pkg && !buyLike ? pkg.price : unitPrice,
          package_id: pkg?.id ?? null,
          package_units: pkg?.units ?? null,
          package_name: pkg?.name ?? null,
        };
        return [...prev, line];
      });
      setNextKey((k) => k + 1);
    },
    [isPairedBill, bill.type, buyLike, nextKey],
  );

  const submitBill = useCallback(async () => {
    setLoading(true);
    try {
      const apiLines = lines
        .filter((l) => l.amount > 0)
        .map((l) => toApiLine(l, buyLike));
      const linesChanged =
        JSON.stringify({ discount, lines: apiLines }) !== originalLines;
      // Lines first: if that edit is refused, nothing has changed yet.
      if (linesChanged) {
        await axios.put(
          "/bill",
          { ...bill, discount, total, products: apiLines },
          { params: { store_id: storeId } },
        );
      }
      if (partyId !== (bill.party_id ?? null)) {
        await axios.put("/bill/party", null, {
          params: {
            store_id: storeId,
            bill_id: bill.id,
            party_id: partyId ?? undefined,
          },
        });
      }
      if (
        canEditPayments &&
        payTouched &&
        total > 0 &&
        !sameSplit(payLines, rescale(originalPay, total))
      ) {
        const payments = buildPayments(total, methods, payLines) || [];
        await axios.put("/bill/payments", {
          store_id: storeId,
          bill_id: Number(bill.id),
          payments: payments.map((p) => ({
            method_id: p.method_id,
            amount: p.amount,
          })),
        });
      }
      getBills();
      setEditing(false);
    } catch (error: any) {
      console.log(error);
      setMsg({
        type: "error",
        text: error?.response?.data?.detail || "حدث خطأ",
      });
    }
    setLoading(false);
  }, [
    lines,
    discount,
    total,
    storeId,
    partyId,
    originalLines,
    payLines,
    payTouched,
    canEditPayments,
    methods,
    originalPay,
    buyLike,
  ]);

  const priceLabel = (l: EditLine) =>
    isPackageLine(l)
      ? buyLike
        ? "سعر بيع الوحدة"
        : `سعر ${l.package_name}`
      : "السعر";
  const costLabel = (l: EditLine) =>
    isPackageLine(l) ? `تكلفة ${l.package_name}` : "سعر الشراء";
  const lineTotal = (l: EditLine) =>
    round2((buyLike ? l.wholesale_price : l.price) * l.amount);

  const nameCell = (l: EditLine) => (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
    >
      <Typography component="span">{l.name}</Typography>
      {isPackageLine(l) && (
        <Chip
          size="small"
          color="secondary"
          variant="outlined"
          label={packageLabel({ name: l.package_name, units: l.package_units })}
        />
      )}
    </Box>
  );

  const numberField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts: { disabled?: boolean; integer?: boolean } = {},
  ) => (
    <NumberField
      label={label}
      size="small"
      value={value}
      disabled={opts.disabled}
      integer={opts.integer}
      min={0}
      onValueChange={onChange}
      fullWidth
    />
  );

  return (
    <Dialog
      open={true}
      onClose={() => setEditing(false)}
      maxWidth="lg"
      fullWidth
      fullScreen={fullScreen}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
      >
        تعديل الفاتورة #{bill.id}
        <Box sx={{ flex: 1 }} />
        <Typography component="span" sx={{ fontWeight: 700 }}>
          الإجمالي: {fmt(total)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ position: "relative" }}>
        <LoadingScreen loading={loading} />
        <AlertMessage message={msg} setMessage={setMsg} />
        <Grid2 container spacing={2}>
          <Grid2 size={{ xs: 12, sm: 8 }}>
            <PartySelect
              parties={parties}
              value={partyId}
              onChange={setPartyId}
              disabled={isTransfer}
              helperText={
                isTransfer
                  ? "لا يمكن تغيير الطرف الثاني لفاتورة نقل بين المتاجر"
                  : undefined
              }
            />
          </Grid2>
          <Grid2 size={{ xs: 12, sm: 4 }}>
            {numberField("الخصم", discount, setDiscount)}
          </Grid2>

          <Grid2 size={12}>
            {fullScreen ? (
              lines.map((l) => (
                <Card
                  key={l.key}
                  variant="outlined"
                  sx={{ p: 1.5, mb: 1, borderRadius: 2 }}
                >
                  <Box
                    sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>{nameCell(l)}</Box>
                    <IconButton
                      color="error"
                      aria-label="حذف"
                      onClick={() =>
                        setLines((prev) => prev.filter((x) => x.key !== l.key))
                      }
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Box>
                  <Grid2 container spacing={1} sx={{ mt: 1 }}>
                    <Grid2 size={4}>
                      {numberField(
                        "الكمية",
                        l.amount,
                        (v) => updateLine(l.key, { amount: v }),
                        {
                          integer: true,
                        },
                      )}
                    </Grid2>
                    <Grid2 size={4}>
                      {numberField(
                        costLabel(l),
                        l.wholesale_price,
                        (v) => updateLine(l.key, { wholesale_price: v }),
                        { disabled: isPairedBill },
                      )}
                    </Grid2>
                    <Grid2 size={4}>
                      {numberField(
                        priceLabel(l),
                        l.price,
                        (v) => updateLine(l.key, { price: v }),
                        {
                          disabled: isPairedBill,
                        },
                      )}
                    </Grid2>
                  </Grid2>
                  <Typography
                    variant="body2"
                    sx={{ mt: 1, textAlign: "left", fontWeight: 600 }}
                  >
                    {fmt(lineTotal(l))}
                  </Typography>
                </Card>
              ))
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>المنتج</TableCell>
                      <TableCell width={110}>الكمية</TableCell>
                      <TableCell width={140}>سعر الشراء</TableCell>
                      <TableCell width={140}>السعر</TableCell>
                      <TableCell>الإجمالي</TableCell>
                      <TableCell width={56}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell>{nameCell(l)}</TableCell>
                        <TableCell>
                          {numberField(
                            isPackageLine(l) ? `(${l.package_name})` : "",
                            l.amount,
                            (v) => updateLine(l.key, { amount: v }),
                            { integer: true },
                          )}
                        </TableCell>
                        <TableCell>
                          {numberField(
                            isPackageLine(l) ? costLabel(l) : "",
                            l.wholesale_price,
                            (v) => updateLine(l.key, { wholesale_price: v }),
                            { disabled: isPairedBill },
                          )}
                        </TableCell>
                        <TableCell>
                          {numberField(
                            isPackageLine(l) ? priceLabel(l) : "",
                            l.price,
                            (v) => updateLine(l.key, { price: v }),
                            { disabled: isPairedBill },
                          )}
                        </TableCell>
                        <TableCell>{fmt(lineTotal(l))}</TableCell>
                        <TableCell>
                          <IconButton
                            color="error"
                            aria-label="حذف"
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((x) => x.key !== l.key),
                              )
                            }
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {lines.length === 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                الفاتورة بدون منتجات — سيصبح إجماليها صفراً عند الحفظ.
              </Alert>
            )}
          </Grid2>

          <Grid2 size={12}>
            <ProductAutocomplete
              onProductSelect={addProduct}
              products={products}
              withPackages={!isPairedBill}
              label="إضافة منتج"
            />
          </Grid2>

          {canEditPayments && methods.length > 0 && total > 0 && (
            <Grid2 size={12}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                طرق الدفع
              </Typography>
              {offStoreUsed && (
                <Alert severity="info" sx={{ mb: 1 }}>
                  هذه الفاتورة استُخدم فيها حساب يخص متجراً آخر: يمكن تغيير طرق
                  الدفع، أما تعديل المنتجات فيتم من صفحة تصحيح الفواتير.
                </Alert>
              )}
              <Box
                onChangeCapture={() => setPayTouched(true)}
                onClickCapture={() => setPayTouched(true)}
              >
                <PaymentSplit
                  total={total}
                  methods={methods}
                  lines={payLines}
                  setLines={setPayLines}
                  currentStoreId={storeId}
                />
              </Box>
            </Grid2>
          )}
        </Grid2>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={() => setEditing(false)}>إلغاء</Button>
        <Button variant="contained" onClick={submitBill} disabled={loading}>
          حفظ التعديلات
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditableBill;

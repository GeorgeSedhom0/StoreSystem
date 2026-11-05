import {
  Button,
  Card,
  Grid2,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Chip,
  Box,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useCallback, useState, useContext, useRef, useEffect } from "react";
import { Product, ProductPackage, SCProduct, StoreData } from "../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import CartView from "../Shared/CartView";
import { apiError } from "../utils/errors";
import MobileCheckoutBar, {
  MobileBarSpacer,
} from "../Shared/MobileCheckoutBar";
import { addToCartLines, makeCartLine } from "../Shared/packages";
import RestockPicker, { RestockFill } from "./RestockPicker";
import RestockResultDialog, { RestockOutcome } from "./RestockResultDialog";
import { useSearchParams } from "react-router-dom";
import { restockApi } from "../Restock/api";
import LoadingScreen from "../Shared/LoadingScreen";
import { localTimestamp } from "../utils/functions";
import useBarcodeDetection from "../Shared/hooks/useBarcodeDetection";
import useQuickHandle from "../Shared/hooks/useCtrlBackspace";
import ProductAutocomplete from "../Shared/ProductAutocomplete";
import useProducts from "../Shared/hooks/useProducts";
import usePaymentMethods from "../Shared/hooks/usePaymentMethods";
import useAccounts from "../Shared/hooks/useAccounts";
import { StoreContext } from "@renderer/StoreDataProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePersistentCart } from "../Shared/hooks/usePersistentCart";
import {
  usePosUi,
  posCardSizes,
  posActionsCardSx,
  posCartCardSx,
  posCartScrollSx,
  splitField,
} from "../Shared/PosLayout";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  }).format(value || 0);

const getStoresData = async () => {
  const { data } = await axios.get<StoreData[]>("/admin/stores-data");
  return data;
};

const MoveProducts = () => {
  const {
    products,
    updateProducts,
    isLoading: isProductsLoading,
  } = useProducts();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [shoppingCart, setShoppingCart] = usePersistentCart(
    "MoveProducts",
    [],
    products,
  );
  const [destinationStoreId, setDestinationStoreId] = useState<number | null>(
    null,
  );
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [billDialogOpen, setBillDialogOpen] = useState<boolean>(false);
  const [billId, setBillId] = useState<string>("");
  const [isLoadingBillProducts, setIsLoadingBillProducts] =
    useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Add ref to track submission progress
  const submissionInProgress = useRef<boolean>(false);

  // Ref for the cart container to enable auto-scroll
  const cartTableRef = useRef<HTMLDivElement>(null);

  const { storeId } = useContext(StoreContext);
  const { paymentMethods } = usePaymentMethods();
  const { storeBalances } = useAccounts(storeId);

  const { density } = usePosUi("MoveProducts");
  const cardSizes = posCardSizes(density.isSplit);

  // Account selection (which account receives at source / pays at destination)
  const [sourceMethodId, setSourceMethodId] = useState<number | "">("");
  const [destMethodId, setDestMethodId] = useState<number | "">("");
  const [settleFromDebt, setSettleFromDebt] = useState<boolean>(false);

  // ─── Restock requests linked to this transfer (v27) ───────────────────────
  const queryClient = useQueryClient();
  const linkKey = `moveRestock_${storeId}`;
  const [linked, setLinkedState] = useState<{
    dest: number;
    ids: number[];
  } | null>(() => {
    try {
      const v = JSON.parse(
        localStorage.getItem(`moveRestock_${storeId}`) || "null",
      );
      return v && Array.isArray(v.ids) && v.ids.length ? v : null;
    } catch {
      return null;
    }
  });
  const setLinked = useCallback(
    (v: { dest: number; ids: number[] } | null) => {
      setLinkedState(v);
      try {
        if (v) localStorage.setItem(linkKey, JSON.stringify(v));
        else localStorage.removeItem(linkKey);
      } catch {
        // ignore
      }
    },
    [linkKey],
  );
  // Restore the destination of a linked (persisted) transfer after a reload.
  useEffect(() => {
    if (linked && destinationStoreId == null)
      setDestinationStoreId(linked.dest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preselect, setPreselect] = useState<number[] | undefined>();
  const [shortNote, setShortNote] = useState<string>("");
  const [outcome, setOutcome] = useState<RestockOutcome[] | null>(null);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const raw = params.get("restock");
    if (!raw) return;
    const ids = raw.split(",").map(Number).filter(Boolean);
    params.delete("restock");
    setParams(params, { replace: true });
    if (ids.length) {
      setPreselect(ids);
      setPickerOpen(true);
    }
  }, [params, setParams]);

  // Open requests addressed to this store (to offer linking). Users without
  // the restock page get a 403 here and simply see no restock controls.
  const { data: incomingReqs } = useQuery({
    queryKey: ["restock", "list", "incoming-open", storeId],
    queryFn: () => restockApi.list(storeId, "incoming", "open"),
    retry: false,
    staleTime: 30_000,
  });
  const destOpenReqs = (incomingReqs || []).filter(
    (r) =>
      r.status === "open" &&
      r.from_store_id === destinationStoreId &&
      r.totals.lines_open > 0,
  );
  const linkedHere =
    linked && linked.dest === destinationStoreId ? linked.ids : [];

  const applyFill = useCallback(
    (fill: RestockFill) => {
      // A cart prepared for another store doesn't belong in this transfer.
      const otherStore =
        destinationStoreId != null && destinationStoreId !== fill.destStoreId;
      setDestinationStoreId(fill.destStoreId);
      setShoppingCart((prev) => {
        let cart = otherStore ? [] : [...prev];
        for (const { product, qty } of fill.lines) {
          const i = cart.findIndex((l) => l.id === product.id && !l.package_id);
          if (i >= 0) {
            // Starting twice must not double the line. Batch picks were for
            // the old quantity, so they're re-picked (FEFO) if it changes.
            const q = Math.max(cart[i].quantity, qty);
            cart[i] =
              q === cart[i].quantity
                ? cart[i]
                : {
                    ...cart[i],
                    quantity: q,
                    batches: undefined,
                    batch_id: undefined,
                  };
          } else if (cart.some((l) => l.id === product.id)) {
            cart = addToCartLines(cart, product, null, "buy", qty);
          } else {
            cart.push(makeCartLine(product, null, "buy", qty));
          }
        }
        return cart;
      });
      const prevIds =
        linked && linked.dest === fill.destStoreId ? linked.ids : [];
      setLinked({
        dest: fill.destStoreId,
        ids: Array.from(new Set([...prevIds, ...fill.ids])),
      });
      const notes: string[] = [];
      if (fill.partial.length)
        notes.push(
          `جزئي: ${fill.partial
            .map((p) => `${p.name} (${p.qty} من ${p.remaining})`)
            .join("، ")}`,
        );
      if (fill.unavailable.length)
        notes.push(`غير متوفر: ${fill.unavailable.join("، ")}`);
      setShortNote(notes.join(" — "));
      setPickerOpen(false);
      setPreselect(undefined);
      setMsg({
        type: "success",
        text: `${otherStore ? "استُبدلت السلة — " : ""}أُضيف ${fill.lines.length} صنف من الطلب ${fill.ids
          .map((i) => `#${i}`)
          .join("، ")}`,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linked, setLinked, destinationStoreId],
  );

  // Get stores data for dropdown
  const { data: storesData, isLoading: isStoresLoading } = useQuery({
    queryKey: ["storesData"],
    queryFn: getStoresData,
  });

  // Filter out the current store from the destination options
  const destinationStores =
    storesData?.filter((store) => store.id !== storeId) || [];

  // Default the accounts like-for-like, restoring the remembered choice per pair
  useEffect(() => {
    if (!destinationStoreId || paymentMethods.length === 0) return;
    const key = `moveAcct_${storeId}_${destinationStoreId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const { s, d } = JSON.parse(saved);
        if (paymentMethods.some((m) => m.id === s)) setSourceMethodId(s);
        if (paymentMethods.some((m) => m.id === d)) setDestMethodId(d);
        return;
      } catch {
        // fall through to defaults
      }
    }
    const def = paymentMethods[0].id;
    setSourceMethodId(def);
    setDestMethodId(def);
  }, [destinationStoreId, paymentMethods, storeId]);

  const destBalance = storeBalances.find(
    (b) => b.store_id === destinationStoreId,
  );

  // Only offer accounts that belong to the relevant store (or are unowned like
  // cash). Off-store accounts must not be used for inter-store moves.
  const sourceMethods = paymentMethods.filter(
    (m) => m.home_store_id == null || m.home_store_id === storeId,
  );
  const destMethods = paymentMethods.filter(
    (m) => m.home_store_id == null || m.home_store_id === destinationStoreId,
  );

  // Transfers move base units: a scanned/selected package adds its units.
  const addToCart = useCallback(
    (product: Product | null, pkg?: ProductPackage | null) => {
      if (!product) return;
      setShoppingCart((prev) =>
        addToCartLines(prev, product, null, "buy", pkg ? pkg.units : 1),
      );
    },
    [],
  );
  useBarcodeDetection(products, addToCart, setMsg);
  useQuickHandle(shoppingCart, setShoppingCart);

  // Auto-scroll cart to bottom when new products are added
  useEffect(() => {
    if (cartTableRef.current) {
      cartTableRef.current.scrollTop = cartTableRef.current.scrollHeight;
    }
  }, [shoppingCart]);

  const submitBill = useCallback(
    async (shoppingCart: SCProduct[]) => {
      // Prevent multiple submissions
      if (isSubmitting || submissionInProgress.current) {
        console.log(
          "Submission already in progress, ignoring duplicate request",
        );
        return;
      }

      // Set submission states immediately to prevent race conditions
      setIsSubmitting(true);
      submissionInProgress.current = true;

      // Validate inputs
      if (shoppingCart.length === 0) {
        setMsg({
          type: "error",
          text: "لا توجد منتجات في السلة",
        });
        setIsSubmitting(false);
        submissionInProgress.current = false;
        return;
      }

      if (destinationStoreId === null || destinationStoreId === undefined) {
        setMsg({
          type: "error",
          text: "يرجى اختيار المتجر الوجهة",
        });
        setIsSubmitting(false);
        submissionInProgress.current = false;
        return;
      }

      try {
        const bill = {
          time: localTimestamp(),
          discount: 0,
          total: shoppingCart.reduce(
            (acc, item) => acc + item.wholesale_price * item.quantity,
            0,
          ),
          products_flow: shoppingCart.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
            wholesale_price: item.wholesale_price,
            batches: item.batches,
            batch_id: item.batch_id,
          })),
        };

        const { data } = await axios.post("/admin/move-products", bill, {
          params: {
            source_store_id: storeId,
            destination_store_id: destinationStoreId,
            source_payment_method_id:
              sourceMethodId === "" ? undefined : sourceMethodId,
            destination_payment_method_id:
              destMethodId === "" ? undefined : destMethodId,
            settle_from_debt: settleFromDebt,
            restock_request_ids: linkedHere.length ? linkedHere : undefined,
          },
          // FastAPI wants repeated keys: restock_request_ids=1&restock_request_ids=2
          paramsSerializer: { indexes: null },
        });
        if (linkedHere.length) {
          const all: RestockOutcome[] = data?.restock || [];
          // Only requests this transfer actually sent something to.
          const restockOutcome = all.filter(
            (r) => !r.skipped && (r.sent_now || 0) > 0,
          );
          const skipped = all.filter((r) => r.skipped);
          if (skipped.length)
            setTimeout(
              () =>
                setMsg({
                  type: "warning",
                  text: `تم النقل، لكن لم يُسجَّل على الطلب ${skipped
                    .map((r) => `#${r.id}`)
                    .join(
                      "، ",
                    )} (أُغلق أو تعذر الربط) — راجعه من صفحة طلبات البضاعة`,
                }),
              0,
            );
          setLinked(null);
          setShortNote("");
          queryClient.invalidateQueries({ queryKey: ["restock"] });
          if (restockOutcome.length) setOutcome(restockOutcome);
        }

        // Remember the account choice for this store-pair
        localStorage.setItem(
          `moveAcct_${storeId}_${destinationStoreId}`,
          JSON.stringify({ s: sourceMethodId, d: destMethodId }),
        );

        setShoppingCart([]);
        await updateProducts();
        setMsg({
          type: "success",
          text: "تم نقل المنتجات بنجاح",
        });
      } catch (error) {
        console.log(error);
        setMsg({
          type: "error",
          text: apiError(error, "حدث خطأ أثناء نقل المنتجات"),
        });
      } finally {
        // Always reset submission state
        setIsSubmitting(false);
        submissionInProgress.current = false;
      }
    },
    [
      destinationStoreId,
      storeId,
      updateProducts,
      isSubmitting,
      sourceMethodId,
      destMethodId,
      settleFromDebt,
      linkedHere,
      setLinked,
      queryClient,
    ],
  );

  const handleStartFromBill = async () => {
    if (!billId) {
      setMsg({
        type: "error",
        text: "يرجى إدخال رقم الفاتورة",
      });
      return;
    }

    setIsLoadingBillProducts(true);
    try {
      const { data } = await axios.get(`/bill-products`, {
        params: {
          bill_id: billId,
          store_id: storeId,
        },
      });

      if (!data || data.length === 0) {
        setMsg({
          type: "error",
          text: "لم يتم العثور على منتجات في هذه الفاتورة",
        });
        setIsLoadingBillProducts(false);
        return;
      }

      // Only use id and amount from the endpoint, get the rest from products
      const newCartItems: SCProduct[] = data
        .map((item: any) => {
          const foundProduct = products.find((p) => p.id === item.id);
          if (!foundProduct) return null;
          return {
            id: foundProduct.id,
            name: foundProduct.name,
            price: foundProduct.price,
            wholesale_price: foundProduct.wholesale_price,
            quantity: item.amount,
            stock: foundProduct.stock,
            barCode: foundProduct.bar_code,
          };
        })
        .filter(Boolean) as SCProduct[];

      setShoppingCart((prevCart) => {
        // Merge new items with existing cart
        const updatedCart = [...prevCart];

        newCartItems.forEach((newItem) => {
          const existingItemIndex = updatedCart.findIndex(
            (item) => item.id === newItem.id,
          );

          if (existingItemIndex >= 0) {
            // Add quantity to existing item
            updatedCart[existingItemIndex].quantity += newItem.quantity;
          } else {
            // Add new item to cart
            updatedCart.push(newItem);
          }
        });

        return updatedCart;
      });

      setMsg({
        type: "success",
        text: `تم إضافة ${newCartItems.length} منتج من الفاتورة إلى السلة`,
      });

      setBillDialogOpen(false);
    } catch (error) {
      console.log(error);
      setMsg({
        type: "error",
        text: "حدث خطأ أثناء جلب بيانات الفاتورة",
      });
    } finally {
      setIsLoadingBillProducts(false);
    }
  };

  return (
    <Grid2 container spacing={density.spacing} alignItems="flex-start">
      <AlertMessage message={msg} setMessage={setMsg} />{" "}
      <LoadingScreen
        loading={
          isProductsLoading ||
          isStoresLoading ||
          isLoadingBillProducts ||
          isSubmitting
        }
      />
      <RestockPicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setPreselect(undefined);
        }}
        storeId={storeId}
        products={products}
        preselect={preselect}
        onApply={applyFill}
      />
      <RestockResultDialog
        outcome={outcome}
        storeId={storeId}
        onClose={() => setOutcome(null)}
        onError={(text) => setMsg({ type: "error", text })}
      />
      {/* Bill ID Dialog */}
      <Dialog open={billDialogOpen} onClose={() => setBillDialogOpen(false)}>
        <DialogTitle>ابدأ من فاتورة</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="رقم الفاتورة"
            fullWidth
            variant="outlined"
            value={billId}
            onChange={(e) => setBillId(e.target.value)}
          />
        </DialogContent>{" "}
        <DialogActions>
          <Button
            onClick={() => setBillDialogOpen(false)}
            color="secondary"
            disabled={isLoadingBillProducts}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleStartFromBill}
            color="primary"
            disabled={isLoadingBillProducts}
          >
            {isLoadingBillProducts ? "جاري التحميل..." : "تأكيد"}
          </Button>
        </DialogActions>
      </Dialog>
      {isMobile && (
        <Grid2 size={12} sx={{ order: 1 }}>
          <ProductAutocomplete
            label="ابحث عن منتج أو امسح الباركود"
            onProductSelect={addToCart}
            withPackages
            products={products}
          />
        </Grid2>
      )}
      <Grid2 size={cardSizes.actions} sx={{ order: { xs: 3, md: 0 } }}>
        <Card elevation={3} sx={posActionsCardSx(density)}>
          <Grid2 container spacing={density.spacing} alignItems="center">
            <Grid2 size={12}>
              <Typography variant="h6">نقل المنتجات بين المتاجر</Typography>
              <Typography variant="subtitle1">
                اختر المنتجات والمتجر الوجهة لنقل المنتجات
              </Typography>
            </Grid2>

            <Grid2 size={splitField(density.isSplit, 4, 12)}>
              <FormControl fullWidth>
                <InputLabel size="small">المتجر الوجهة</InputLabel>
                <Select
                  size="small"
                  value={destinationStoreId ?? ""}
                  label="المتجر الوجهة"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDestinationStoreId(v);
                    if (linked && linked.dest !== v) {
                      setLinked(null);
                      setShortNote("");
                    }
                  }}
                  fullWidth
                >
                  {destinationStores.map((store) => (
                    <MenuItem key={store.id} value={store.id}>
                      {store.name || `متجر ${store.id}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid2>

            <Grid2 size={splitField(density.isSplit, 2, 6)}>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setBillDialogOpen(true)}
                fullWidth
              >
                ابدأ من فاتورة
              </Button>
            </Grid2>

            {incomingReqs !== undefined && (
              <Grid2 size={splitField(density.isSplit, 2, 6)}>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() => {
                    setPreselect(undefined);
                    setPickerOpen(true);
                  }}
                  fullWidth
                >
                  ابدأ من طلب
                  {incomingReqs.length > 0 && ` (${incomingReqs.length})`}
                </Button>
              </Grid2>
            )}

            {(linkedHere.length > 0 || destOpenReqs.length > 0) && (
              <Grid2 size={12}>
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  {linkedHere.map((id) => (
                    <Chip
                      key={id}
                      color="primary"
                      label={`مرتبط بطلب #${id}`}
                      onDelete={() => {
                        const ids = linkedHere.filter((x) => x !== id);
                        setLinked(
                          ids.length && destinationStoreId != null
                            ? { dest: destinationStoreId, ids }
                            : null,
                        );
                      }}
                    />
                  ))}
                  {linkedHere.length === 0 && destOpenReqs.length > 0 && (
                    <Chip
                      color="warning"
                      variant="outlined"
                      label={`لهذا المتجر ${destOpenReqs.length} طلب مفتوح — اضغط لربط النقل به`}
                      onClick={() =>
                        destinationStoreId != null &&
                        setLinked({
                          dest: destinationStoreId,
                          ids: destOpenReqs.map((r) => r.id),
                        })
                      }
                    />
                  )}
                  {linkedHere.length > 0 && shortNote && (
                    <Typography variant="caption" color="warning.main">
                      {shortNote}
                    </Typography>
                  )}
                </Box>
              </Grid2>
            )}

            {!isMobile && (
              <Grid2 size={splitField(density.isSplit, 2, 6)}>
                <Button
                  variant="contained"
                  onClick={() => submitBill(shoppingCart)}
                  disabled={
                    shoppingCart.length === 0 ||
                    destinationStoreId === null ||
                    destinationStoreId === undefined ||
                    isSubmitting
                  }
                  fullWidth
                >
                  {isSubmitting ? "جاري النقل..." : "نقل المنتجات"}
                </Button>
              </Grid2>
            )}

            <Grid2
              size={splitField(density.isSplit, 4, 12)}
              sx={{ display: { xs: "none", md: "block" } }}
            >
              <Typography variant="h6" align="center">
                الإجمالي:{" "}
                {shoppingCart
                  .reduce(
                    (acc, item) => acc + item.wholesale_price * item.quantity,
                    0,
                  )
                  .toFixed(2)}{" "}
                جنيه
              </Typography>
            </Grid2>

            {/* Money / accounts row */}
            {destinationStoreId !== null && paymentMethods.length > 0 && (
              <>
                <Grid2 size={splitField(density.isSplit, 4, 12)}>
                  <FormControl fullWidth size="small">
                    <InputLabel>حساب الاستلام (هذا المتجر)</InputLabel>
                    <Select
                      label="حساب الاستلام (هذا المتجر)"
                      value={sourceMethodId}
                      onChange={(e) =>
                        setSourceMethodId(Number(e.target.value))
                      }
                      disabled={settleFromDebt}
                    >
                      {sourceMethods.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {m.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid2>

                <Grid2 size={splitField(density.isSplit, 4, 12)}>
                  <FormControl fullWidth size="small">
                    <InputLabel>حساب الدفع (المتجر الوجهة)</InputLabel>
                    <Select
                      label="حساب الدفع (المتجر الوجهة)"
                      value={destMethodId}
                      onChange={(e) => setDestMethodId(Number(e.target.value))}
                      disabled={settleFromDebt}
                    >
                      {destMethods.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {m.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid2>

                <Grid2 size={splitField(density.isSplit, 4, 12)}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Switch
                          checked={settleFromDebt}
                          onChange={(e) => setSettleFromDebt(e.target.checked)}
                        />
                      }
                      label="تسوية من الرصيد (بدون نقد)"
                    />
                    {destBalance && Math.abs(destBalance.balance) > 0.001 && (
                      <Chip
                        size="small"
                        color={destBalance.balance > 0 ? "error" : "success"}
                        label={
                          destBalance.balance > 0
                            ? `مدين لهم: ${formatCurrency(destBalance.balance)}`
                            : `لك عندهم: ${formatCurrency(-destBalance.balance)}`
                        }
                      />
                    )}
                  </Box>
                </Grid2>
              </>
            )}

            {!isMobile && (
              <Grid2 size={12}>
                <ProductAutocomplete
                  onProductSelect={addToCart}
                  withPackages
                  products={products}
                />
              </Grid2>
            )}
          </Grid2>
        </Card>
      </Grid2>{" "}
      <Grid2 size={cardSizes.cart} sx={{ order: { xs: 2, md: 0 } }}>
        <Card elevation={3} sx={posCartCardSx(density)}>
          <CartView
            ref={cartTableRef}
            cart={shoppingCart}
            setCart={setShoppingCart}
            type="transfer"
            scrollSx={posCartScrollSx(density)}
            emptyHint="امسح باركود أو ابحث عن منتج لنقله"
          />
        </Card>
      </Grid2>
      {isMobile && (
        <>
          <Grid2 size={12} sx={{ order: 4 }}>
            <MobileBarSpacer />
          </Grid2>
          <MobileCheckoutBar
            total={
              Math.round(
                shoppingCart.reduce(
                  (a, i) => a + i.wholesale_price * i.quantity,
                  0,
                ) * 100,
              ) / 100
            }
            count={shoppingCart.length}
            onSave={() => submitBill(shoppingCart)}
            disabled={
              shoppingCart.length === 0 ||
              destinationStoreId === null ||
              destinationStoreId === undefined ||
              isSubmitting
            }
            saveLabel={isSubmitting ? "جاري النقل..." : "نقل المنتجات"}
            caption={
              destinationStoreId == null
                ? "اختر المتجر المستلم أولاً"
                : undefined
            }
          />
        </>
      )}
    </Grid2>
  );
};

export default MoveProducts;

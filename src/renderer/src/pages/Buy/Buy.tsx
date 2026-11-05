import {
  Autocomplete,
  Button,
  Card,
  Grid2,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Switch,
  FormControlLabel,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState, useContext, useRef, useEffect } from "react";
import { Party, Product, ProductPackage, SCProduct } from "../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import NumberField from "../Shared/NumberField";
import { apiError } from "../utils/errors";
import CartView from "../Shared/CartView";
import MobileCheckoutBar, {
  MobileBarSpacer,
} from "../Shared/MobileCheckoutBar";
import {
  addToCartLines,
  cartLineToFlow,
  lineKey,
  printableLine,
} from "../Shared/packages";
import LoadingScreen from "../Shared/LoadingScreen";
import { localTimestamp } from "../utils/functions";
import useBarcodeDetection from "../Shared/hooks/useBarcodeDetection";
import useQuickHandle from "../Shared/hooks/useCtrlBackspace";
import ProductAutocomplete from "../Shared/ProductAutocomplete";
import useParties from "../Shared/hooks/useParties";
import usePaymentMethods from "../Shared/hooks/usePaymentMethods";
import PaymentSplit, {
  buildPayments,
  PaymentLineState,
} from "../Shared/PaymentSplit";
import useProducts from "../Shared/hooks/useProducts";
import { StoreContext } from "@renderer/StoreDataProvider";
import { usePersistentCart } from "../Shared/hooks/usePersistentCart";
import BatchPrintDialog from "./Components/BatchPrintDialog";
import BulkEditDialog from "./Components/BulkEditDialog";
import {
  usePosUi,
  resolveVisibility,
  posCardSizes,
  posActionsCardSx,
  posCartCardSx,
  posCartScrollSx,
  splitField,
} from "../Shared/PosLayout";

const Buy = () => {
  const {
    products,
    updateProducts,
    isLoading: isProductsLoading,
  } = useProducts();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [shoppingCart, setShoppingCart] = usePersistentCart(
    "Buy",
    [],
    products,
  );
  const [partyId, setPartyId] = useState<number | null>(null);
  const [addingParty, setAddingParty] = useState<boolean>(false);
  const [newParty, setNewParty] = useState<Party>({
    id: null,
    name: "",
    phone: "",
    address: "",
    type: "مورد",
    extra_info: {},
  });
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [moveType, setMoveType] = useState<"buy" | "buy-return">("buy");
  const [discount, setDiscount] = useState<number>(0);
  // Add state and ref to track submission status
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submissionInProgress = useRef<boolean>(false);

  // Ref for the cart container to enable auto-scroll
  const cartTableRef = useRef<HTMLDivElement>(null);
  // Track previous cart length to detect new product additions
  const prevCartLengthRef = useRef<number>(0);

  // Selection state for bulk operations
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    new Set(),
  );
  // Modal states for quick actions
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const { parties, addPartyMutationAsync } = useParties(setMsg);
  const { paymentMethods } = usePaymentMethods();
  const [paymentLines, setPaymentLines] = useState<PaymentLineState[]>([]);

  const { density, partiesPolicy, paymentsPolicy } = usePosUi("Buy");
  const cardSizes = posCardSizes(density.isSplit);
  const pairInputs = density.isCompact && !density.isSplit;
  // Buy has no on-page toggles; honour only a "never" policy (else keep showing).
  const showPay = resolveVisibility(paymentsPolicy, true);
  const showSupplier = resolveVisibility(partiesPolicy, true);

  const { storeId } = useContext(StoreContext);

  // Another store paying for (part of) this buy bill -> inter-store debt
  const { data: storesData = [] } = useQuery({
    queryKey: ["stores-data"],
    queryFn: async () => {
      const { data } =
        await axios.get<{ id: number; name: string }[]>("/admin/stores-data");
      return data;
    },
    initialData: [],
  });
  const otherStores = storesData.filter((s) => s.id !== storeId);
  // Accounts of this store (or unowned). Off-store accounts can't pay a buy.
  const buyMethods = paymentMethods.filter(
    (m) => m.home_store_id == null || m.home_store_id === storeId,
  );
  const [payByEnabled, setPayByEnabled] = useState(false);
  const [payByStoreId, setPayByStoreId] = useState<number | "">("");
  const [payByAmount, setPayByAmount] = useState<number>(0);
  const [payByMyMethod, setPayByMyMethod] = useState<number | "">("");
  const [payByTheirMethod, setPayByTheirMethod] = useState<number | "">("");
  // Accounts of the paying store (or unowned), for the funding panel.
  const payerMethods = paymentMethods.filter(
    (m) => m.home_store_id == null || m.home_store_id === payByStoreId,
  );

  const addToCart = useCallback(
    (product: Product | null, pkg?: ProductPackage | null) => {
      if (!product) return;
      setShoppingCart((prev) =>
        addToCartLines(prev, product, pkg ?? null, "buy"),
      );
    },
    [],
  );
  useBarcodeDetection(products, addToCart, setMsg);
  useQuickHandle(shoppingCart, setShoppingCart);

  // Auto-scroll cart to bottom only when a NEW product is added (not on quantity changes)
  useEffect(() => {
    if (
      cartTableRef.current &&
      shoppingCart.length > prevCartLengthRef.current
    ) {
      cartTableRef.current.scrollTop = cartTableRef.current.scrollHeight;
    }
    prevCartLengthRef.current = shoppingCart.length;
  }, [shoppingCart]);

  // Cleanup selection when products are removed from cart
  useEffect(() => {
    const currentIds = new Set(shoppingCart.map((p) => lineKey(p)));
    setSelectedProductIds((prev) => {
      const next = new Set([...prev].filter((id) => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shoppingCart]);

  // Selection handlers
  const allSelected =
    shoppingCart.length > 0 && selectedProductIds.size === shoppingCart.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(shoppingCart.map((p) => lineKey(p))));
    }
  };

  const handleSelectProduct = (productId: string, selected: boolean) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  };

  const handleBulkEditApply = (updatedProducts: SCProduct[]) => {
    setShoppingCart(updatedProducts);
    setSelectedProductIds(new Set());
  };

  const submitBill = useCallback(
    async (shoppingCart: SCProduct[], discount: number) => {
      // Prevent multiple submissions
      if (isSubmitting || submissionInProgress.current) {
        console.log(
          "Submission already in progress, ignoring duplicate request",
        );
        return;
      }

      // Set our local states immediately to prevent race conditions
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

      try {
        const billTotal =
          shoppingCart.reduce(
            (acc, item) => acc + item.wholesale_price * item.quantity,
            0,
          ) - discount;

        // When another store funds this buy, the bill is paid from the account
        // they transfer the money into, so lock the buy's payment to it.
        const buyPayments =
          payByEnabled && payByMyMethod !== ""
            ? [
                {
                  method_id: payByMyMethod,
                  name: paymentMethods.find((m) => m.id === payByMyMethod)
                    ?.name,
                  amount: billTotal,
                },
              ]
            : buildPayments(billTotal, paymentMethods, paymentLines);

        const bill = {
          time: localTimestamp(),
          discount,
          total: billTotal,
          products_flow: shoppingCart.map((item) =>
            cartLineToFlow(item, "buy"),
          ),
          payments: buyPayments,
        };

        let newPartyId = partyId;

        if (addingParty) {
          newPartyId = await addPartyMutationAsync(newParty);
          setAddingParty(false);
          setNewParty({
            id: null,
            name: "",
            phone: "",
            address: "",
            type: "مورد",
            extra_info: {},
          });
        }

        await axios.post("/bill", bill, {
          params: {
            move_type: moveType,
            store_id: storeId,
            party_id: newPartyId,
          },
        });

        // Another store funded (part of) this buy -> record an inter-store loan
        // (that store -> this store). Builds a debt this store owes them.
        if (
          payByEnabled &&
          payByStoreId !== "" &&
          payByAmount > 0 &&
          moveType === "buy"
        ) {
          await axios.post("/store-transfer", null, {
            params: {
              from_store_id: payByStoreId,
              to_store_id: storeId,
              amount: payByAmount,
              from_payment_method_id:
                payByTheirMethod === "" ? undefined : payByTheirMethod,
              to_payment_method_id:
                payByMyMethod === "" ? undefined : payByMyMethod,
              description: "تمويل فاتورة شراء من متجر آخر",
              time: localTimestamp(),
            },
          });
        }

        setShoppingCart([]);
        await updateProducts();
        setDiscount(0);
        setMoveType("buy");
        setPartyId(null);
        setPaymentLines([]);
        setPayByEnabled(false);
        setPayByStoreId("");
        setPayByAmount(0);
        setMsg({
          type: "success",
          text: "تم حفظ الفاتورة بنجاح",
        });
      } catch (error) {
        console.log(error);
        setMsg({ type: "error", text: apiError(error, "تعذر حفظ الفاتورة") });
      } finally {
        // Always ensure we reset the submission state, even in case of errors
        setIsSubmitting(false);
        submissionInProgress.current = false;
      }
    },
    [
      addingParty,
      newParty,
      partyId,
      updateProducts,
      storeId,
      moveType,
      isSubmitting,
      paymentMethods,
      paymentLines,
      payByEnabled,
      payByStoreId,
      payByAmount,
      payByMyMethod,
      payByTheirMethod,
    ],
  );

  // Check if submit should be disabled
  const isSubmitDisabled =
    shoppingCart.length === 0 || isSubmitting || submissionInProgress.current;

  return (
    <Grid2 container spacing={density.spacing} alignItems="flex-start">
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={isProductsLoading || isSubmitting} />
      {isMobile && (
        <Grid2 size={12} sx={{ order: 1 }}>
          <ProductAutocomplete
            label="ابحث عن منتج أو امسح الباركود"
            withPackages
            onProductSelect={addToCart}
            products={products}
          />
        </Grid2>
      )}
      <Grid2 size={cardSizes.actions} sx={{ order: { xs: 3, md: 0 } }}>
        <Card elevation={3} sx={posActionsCardSx(density)}>
          <Grid2 container spacing={density.spacing} alignItems="center">
            <Grid2 size={12}>
              <Typography variant="h6">
                اختار منتج ليتم اضافته الى الفاتورة
              </Typography>
            </Grid2>

            <Grid2 size={12} container spacing={2}>
              <Grid2 size={splitField(density.isSplit, { xs: 6, sm: 3 }, 6)}>
                <FormControl fullWidth>
                  <InputLabel size="small">نوع الفاتورة</InputLabel>
                  <Select
                    value={moveType}
                    onChange={(e) =>
                      setMoveType(e.target.value as "buy" | "buy-return")
                    }
                    size="small"
                    label="نوع الفاتورة"
                    fullWidth
                  >
                    <MenuItem value="buy">شراء</MenuItem>
                    <MenuItem value="buy-return">مرتجع شراء</MenuItem>
                  </Select>
                </FormControl>
              </Grid2>
              <Grid2 size={splitField(density.isSplit, { xs: 6, sm: 3 }, 6)}>
                <NumberField
                  size="small"
                  label="الخصم"
                  value={discount}
                  onValueChange={setDiscount}
                  min={0}
                  fullWidth
                />
              </Grid2>{" "}
              {!isMobile && (
                <Grid2 size={splitField(density.isSplit, { xs: 6, sm: 3 }, 12)}>
                  <Button
                    variant="contained"
                    onClick={() => submitBill(shoppingCart, discount)}
                    disabled={isSubmitDisabled}
                    fullWidth
                    sx={{ height: 40 }}
                  >
                    {isSubmitting ? "جاري الحفظ..." : "إضافة فاتورة"}
                  </Button>
                </Grid2>
              )}
              {!isMobile && (
                <Grid2 size={splitField(density.isSplit, { xs: 6, sm: 3 }, 12)}>
                  <Typography variant="h6" align="center">
                    الإجمالي:{" "}
                    {(
                      Math.round(
                        (shoppingCart.reduce(
                          (a, i) => a + i.wholesale_price * i.quantity,
                          0,
                        ) -
                          discount) *
                          100,
                      ) / 100
                    ).toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    جنيه
                  </Typography>
                </Grid2>
              )}
            </Grid2>

            {showPay && paymentMethods.length > 0 && !payByEnabled && (
              <Grid2 size={12}>
                <PaymentSplit
                  total={
                    shoppingCart.reduce(
                      (acc, item) => acc + item.wholesale_price * item.quantity,
                      0,
                    ) - discount
                  }
                  methods={buyMethods}
                  lines={paymentLines}
                  setLines={setPaymentLines}
                  currentStoreId={storeId}
                  dense={density.isCompact}
                />
              </Grid2>
            )}

            {payByEnabled && (
              <Grid2 size={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="طريقة دفع الفاتورة"
                  value={
                    paymentMethods.find((m) => m.id === payByMyMethod)?.name ||
                    ""
                  }
                  disabled
                  helperText="تُدفع الفاتورة تلقائيًا من الحساب الذي يحوّل إليه المتجر الدافع"
                />
              </Grid2>
            )}

            {/* Another store pays for this buy (inter-store debt) */}
            {moveType === "buy" && otherStores.length > 0 && (
              <Grid2 size={12}>
                <Box
                  sx={{
                    p: density.isCompact ? 1 : 2,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: payByEnabled ? "primary.light" : "divider",
                  }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        checked={payByEnabled}
                        onChange={(e) => {
                          setPayByEnabled(e.target.checked);
                          if (e.target.checked) {
                            setPayByStoreId(otherStores[0]?.id ?? "");
                            setPayByAmount(
                              shoppingCart.reduce(
                                (acc, item) =>
                                  acc + item.wholesale_price * item.quantity,
                                0,
                              ) - discount,
                            );
                            setPayByMyMethod(paymentMethods[0]?.id ?? "");
                            setPayByTheirMethod(paymentMethods[0]?.id ?? "");
                          }
                        }}
                      />
                    }
                    label="متجر آخر يدفع عن هذه الفاتورة (دين بين المتاجر)"
                  />
                  {payByEnabled && (
                    <Grid2 container spacing={2} sx={{ mt: 0.5 }}>
                      <Grid2 size={{ xs: 12, sm: 3 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>المتجر الدافع</InputLabel>
                          <Select
                            label="المتجر الدافع"
                            value={payByStoreId}
                            onChange={(e) =>
                              setPayByStoreId(Number(e.target.value))
                            }
                          >
                            {otherStores.map((s) => (
                              <MenuItem key={s.id} value={s.id}>
                                {s.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid2>
                      <Grid2 size={{ xs: 12, sm: 3 }}>
                        <NumberField
                          fullWidth
                          size="small"
                          label="المبلغ المدفوع"
                          value={payByAmount}
                          onValueChange={(v) => {
                            const max =
                              shoppingCart.reduce(
                                (acc, item) =>
                                  acc + item.wholesale_price * item.quantity,
                                0,
                              ) - discount;
                            setPayByAmount(Math.min(Math.max(v, 0), max));
                          }}
                          helperText="بحد أقصى قيمة الفاتورة"
                        />
                      </Grid2>
                      <Grid2 size={{ xs: 12, sm: 3 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>حساب المتجر الدافع</InputLabel>
                          <Select
                            label="حساب المتجر الدافع"
                            value={payByTheirMethod}
                            onChange={(e) =>
                              setPayByTheirMethod(Number(e.target.value))
                            }
                          >
                            {payerMethods.map((m) => (
                              <MenuItem key={m.id} value={m.id}>
                                {m.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid2>
                      <Grid2 size={{ xs: 12, sm: 3 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>حسابي (الاستلام)</InputLabel>
                          <Select
                            label="حسابي (الاستلام)"
                            value={payByMyMethod}
                            onChange={(e) =>
                              setPayByMyMethod(Number(e.target.value))
                            }
                          >
                            {buyMethods.map((m) => (
                              <MenuItem key={m.id} value={m.id}>
                                {m.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid2>
                    </Grid2>
                  )}
                </Box>
              </Grid2>
            )}

            {!isMobile && (
              <Grid2 size={pairInputs && showSupplier ? { xs: 12, sm: 6 } : 12}>
                <ProductAutocomplete
                  withPackages
                  onProductSelect={addToCart}
                  products={products}
                />
              </Grid2>
            )}
            {showSupplier && (
              <Grid2 size={pairInputs ? { xs: 12, sm: 6 } : 12}>
                <Autocomplete
                  options={
                    [
                      { id: null, name: "بدون مورد", phone: "", address: "" },
                      { id: null, name: "مورد جديد", phone: "", address: "" },
                      ...parties,
                    ] as Party[]
                  }
                  getOptionLabel={(option) =>
                    option.name + " - " + (option.phone || "")
                  }
                  isOptionEqualToValue={(option, value) =>
                    option.id === value.id && option.name === value.name
                  }
                  value={parties.find((party) => party.id === partyId) || null}
                  onChange={(_, value) => {
                    if (value && value.id) {
                      setPartyId(value.id);
                      setAddingParty(false);
                    } else {
                      setPartyId(null);
                      if (value && value.name === "مورد جديد") {
                        setAddingParty(true);
                      } else {
                        setAddingParty(false);
                      }
                    }
                  }}
                  filterOptions={(options, params) => {
                    const filtered = options.filter(
                      (option) =>
                        option.name
                          ?.toLowerCase()
                          .includes(params.inputValue) ||
                        option.phone?.includes(params.inputValue),
                    );
                    return filtered;
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="اسم المورد" />
                  )}
                />
              </Grid2>
            )}
            {showSupplier && addingParty && (
              <Grid2 container size={12} spacing={2}>
                <Grid2 size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="اسم المورد"
                    value={newParty.name}
                    onChange={(e) =>
                      setNewParty({ ...newParty, name: e.target.value })
                    }
                  />
                </Grid2>
                <Grid2 size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="رقم الهاتف"
                    value={newParty.phone}
                    onChange={(e) =>
                      setNewParty({ ...newParty, phone: e.target.value })
                    }
                  />
                </Grid2>
                <Grid2 size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="العنوان"
                    value={newParty.address}
                    onChange={(e) =>
                      setNewParty({ ...newParty, address: e.target.value })
                    }
                  />
                </Grid2>
              </Grid2>
            )}
          </Grid2>
        </Card>
      </Grid2>{" "}
      <Grid2 size={cardSizes.cart} sx={{ order: { xs: 2, md: 0 } }}>
        <Card elevation={3} sx={posCartCardSx(density)}>
          {/* Quick Actions Toolbar */}
          <Box
            sx={{
              p: density.isCompact ? 1 : 2,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: density.isCompact ? 1 : 2,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Button
              variant="contained"
              size={density.isCompact ? "small" : "medium"}
              onClick={() => setBatchPrintOpen(true)}
              disabled={shoppingCart.length === 0}
            >
              طباعة الكل
            </Button>
            <Button
              variant="outlined"
              size={density.isCompact ? "small" : "medium"}
              onClick={() => setBulkEditOpen(true)}
              disabled={selectedProductIds.size === 0}
            >
              تعديل المحدد ({selectedProductIds.size})
            </Button>
            {shoppingCart.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                {shoppingCart.length} منتج في السلة
              </Typography>
            )}
          </Box>

          <CartView
            ref={cartTableRef}
            cart={shoppingCart}
            setCart={setShoppingCart}
            type="buy"
            scrollSx={posCartScrollSx(density)}
            selected={selectedProductIds}
            onToggle={handleSelectProduct}
            onToggleAll={handleSelectAll}
          />
        </Card>
      </Grid2>
      {/* Batch Print Dialog */}
      <BatchPrintDialog
        open={batchPrintOpen}
        onClose={() => setBatchPrintOpen(false)}
        products={shoppingCart.map(printableLine)}
      />
      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        products={shoppingCart}
        selectedProductIds={selectedProductIds}
        onApply={handleBulkEditApply}
      />
      {isMobile && (
        <>
          <Grid2 size={12} sx={{ order: 4 }}>
            <MobileBarSpacer />
          </Grid2>
          <MobileCheckoutBar
            total={
              Math.round(
                (shoppingCart.reduce(
                  (a, i) => a + i.wholesale_price * i.quantity,
                  0,
                ) -
                  discount) *
                  100,
              ) / 100
            }
            count={shoppingCart.length}
            onSave={() => submitBill(shoppingCart, discount)}
            disabled={isSubmitDisabled}
            saveLabel={isSubmitting ? "جاري الحفظ..." : "حفظ الفاتورة"}
          />
        </>
      )}
    </Grid2>
  );
};

export default Buy;

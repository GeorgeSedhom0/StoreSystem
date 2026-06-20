import {
  Autocomplete,
  Button,
  Card,
  Grid2,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Table,
  TableBody,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  Box,
  IconButton,
  Switch,
  FormControlLabel,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ExpirationModal from "../Shared/ExpirationModal";
import { useCallback, useState, useContext, useRef, useEffect } from "react";
import { Party, Product, SCProduct, BatchInfo } from "../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "../Shared/ProductInCart";
import LoadingScreen from "../Shared/LoadingScreen";
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

// Mobile-friendly buy-cart row: a stacked card instead of the 9-column table.
const MobileBuyCartItem = ({
  product,
  setShoppingCart,
  isSelected,
  onSelectionChange,
}: {
  product: SCProduct;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  isSelected: boolean;
  onSelectionChange: (selected: boolean) => void;
}) => {
  const [expOpen, setExpOpen] = useState(false);
  const update = (patch: Partial<SCProduct>) =>
    setShoppingCart((prev) =>
      prev.map((i) => (i.id === product.id ? { ...i, ...patch } : i)),
    );
  const remove = () =>
    setShoppingCart((prev) => prev.filter((i) => i.id !== product.id));
  const hasBatches = !!product.batches && product.batches.length > 0;

  return (
    <Card variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Checkbox
          sx={{ p: 0.5 }}
          checked={isSelected}
          onChange={(e) => onSelectionChange(e.target.checked)}
        />
        <Typography sx={{ fontWeight: 600, flex: 1, wordBreak: "break-word" }}>
          {product.name}
        </Typography>
        <IconButton color="error" size="small" onClick={remove} aria-label="حذف">
          <DeleteOutlineIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
        <IconButton
          size="small"
          onClick={() => update({ quantity: Math.max(0, product.quantity - 1) })}
        >
          <RemoveIcon fontSize="small" />
        </IconButton>
        <TextField
          type="number"
          size="small"
          label="الكمية"
          value={product.quantity}
          onChange={(e) => update({ quantity: parseInt(e.target.value) || 0 })}
          sx={{ width: 90 }}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
        />
        <IconButton
          size="small"
          onClick={() => update({ quantity: product.quantity + 1 })}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          type="number"
          label="سعر الشراء"
          value={product.wholesale_price}
          onChange={(e) =>
            update({ wholesale_price: parseFloat(e.target.value) || 0 })
          }
          slotProps={{ htmlInput: { inputMode: "decimal" } }}
        />
        <TextField
          fullWidth
          size="small"
          type="number"
          label="سعر البيع"
          value={product.price}
          onChange={(e) => update({ price: parseFloat(e.target.value) || 0 })}
          slotProps={{ htmlInput: { inputMode: "decimal" } }}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mt: 1.5,
        }}
      >
        <Button
          size="small"
          variant={hasBatches ? "contained" : "outlined"}
          color={hasBatches ? "success" : "primary"}
          startIcon={<CalendarMonthIcon />}
          onClick={() => setExpOpen(true)}
        >
          صلاحية
        </Button>
        <Typography sx={{ fontWeight: 600 }}>
          الإجمالي: {product.wholesale_price * product.quantity}
        </Typography>
      </Box>

      {expOpen && (
        <ExpirationModal
          open={expOpen}
          onClose={() => setExpOpen(false)}
          product={product}
          onSave={(batches: BatchInfo[]) =>
            update({ batches: batches.length > 0 ? batches : undefined })
          }
        />
      )}
    </Card>
  );
};

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
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(
    new Set(),
  );
  // Modal states for quick actions
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const { parties, addPartyMutationAsync } = useParties(setMsg);
  const { paymentMethods } = usePaymentMethods();
  const [paymentLines, setPaymentLines] = useState<PaymentLineState[]>([]);

  const { storeId } = useContext(StoreContext);

  // Another store paying for (part of) this buy bill -> inter-store debt
  const { data: storesData = [] } = useQuery({
    queryKey: ["stores-data"],
    queryFn: async () => {
      const { data } = await axios.get<{ id: number; name: string }[]>(
        "/admin/stores-data",
      );
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

  const addToCart = useCallback((product: Product | null) => {
    if (!product) return;
    setShoppingCart((prev) => {
      if (!product.id) return prev;
      const productExists = prev.find((item) => item.id === product.id);
      if (productExists) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      } else {
        return [
          ...prev,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            wholesale_price: product.wholesale_price,
            quantity: 1,
            stock: product.stock,
            barCode: product.bar_code,
          },
        ];
      }
    });
  }, []);
  useBarcodeDetection(products, addToCart, setMsg);
  useQuickHandle(shoppingCart, setShoppingCart);

  // Auto-scroll cart to bottom only when a NEW product is added (not on quantity changes)
  useEffect(() => {
    if (cartTableRef.current && shoppingCart.length > prevCartLengthRef.current) {
      cartTableRef.current.scrollTop = cartTableRef.current.scrollHeight;
    }
    prevCartLengthRef.current = shoppingCart.length;
  }, [shoppingCart]);

  // Cleanup selection when products are removed from cart
  useEffect(() => {
    const currentIds = new Set(shoppingCart.map((p) => p.id));
    setSelectedProductIds((prev) => {
      const next = new Set([...prev].filter((id) => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shoppingCart]);

  // Selection handlers
  const allSelected =
    shoppingCart.length > 0 && selectedProductIds.size === shoppingCart.length;
  const someSelected =
    selectedProductIds.size > 0 && selectedProductIds.size < shoppingCart.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(shoppingCart.map((p) => p.id)));
    }
  };

  const handleSelectProduct = (productId: number, selected: boolean) => {
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
                  name: paymentMethods.find((m) => m.id === payByMyMethod)?.name,
                  amount: billTotal,
                },
              ]
            : buildPayments(billTotal, paymentMethods, paymentLines);

        const bill = {
          time: new Date().toLocaleString(),
          discount,
          total: billTotal,
          products_flow: shoppingCart,
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
              time: new Date().toLocaleString(),
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
          text: "تم اضافة الفاتورة بنجاح",
        });
      } catch (error) {
        console.log(error);
        setMsg({
          type: "error",
          text: "حدث خطأ ما",
        });
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
    <Grid2 container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={isProductsLoading || isSubmitting} />
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid2 container spacing={3} alignItems="center">
            <Grid2 size={12}>
              <Typography variant="h6">
                اختار منتج ليتم اضافته الى الفاتورة
              </Typography>
            </Grid2>

            <Grid2 size={12} container spacing={2}>
              <Grid2 size={{ xs: 6, sm: 3 }}>
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
              <Grid2 size={{ xs: 6, sm: 3 }}>
                <TextField
                  size="small"
                  label="الخصم"
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(+e.target.value)}
                  fullWidth
                />
              </Grid2>{" "}
              <Grid2 size={{ xs: 6, sm: 3 }}>
                <Button
                  variant="contained"
                  onClick={() => submitBill(shoppingCart, discount)}
                  disabled={isSubmitDisabled}
                  fullWidth
                  sx={{ height: 40 }}
                >
                  {isSubmitting ? "جاري الحفظ..." : "اضافة فاتورة"}
                </Button>
              </Grid2>
              <Grid2 size={{ xs: 6, sm: 3 }}>
                <Typography variant="h6" align="center">
                  الاجمالي:{" "}
                  {shoppingCart.reduce(
                    (acc, item) => acc + item.wholesale_price * item.quantity,
                    0,
                  ) - discount}{" "}
                  جنيه
                </Typography>
                <Typography variant="body1" align="center"></Typography>
              </Grid2>
            </Grid2>

            {paymentMethods.length > 0 && !payByEnabled && (
              <Grid2 size={12}>
                <PaymentSplit
                  total={
                    shoppingCart.reduce(
                      (acc, item) =>
                        acc + item.wholesale_price * item.quantity,
                      0,
                    ) - discount
                  }
                  methods={buyMethods}
                  lines={paymentLines}
                  setLines={setPaymentLines}
                  currentStoreId={storeId}
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
                    p: 2,
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
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          label="المبلغ المدفوع"
                          value={payByAmount}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            const max =
                              shoppingCart.reduce(
                                (acc, item) =>
                                  acc + item.wholesale_price * item.quantity,
                                0,
                              ) - discount;
                            setPayByAmount(Math.min(Math.max(v, 0), max));
                          }}
                          inputMode="decimal"
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

            <Grid2 size={12}>
              <ProductAutocomplete
                onProductSelect={addToCart}
                products={products}
              />
            </Grid2>
            <Grid2 size={12}>
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
                      option.name?.toLowerCase().includes(params.inputValue) ||
                      option.phone?.includes(params.inputValue),
                  );
                  return filtered;
                }}
                renderInput={(params) => (
                  <TextField {...params} label="اسم المورد" />
                )}
              />
            </Grid2>
            {addingParty && (
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
      <Grid2 size={12}>
        <Card elevation={3}>
          {/* Quick Actions Toolbar */}
          <Box
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Button
              variant="contained"
              onClick={() => setBatchPrintOpen(true)}
              disabled={shoppingCart.length === 0}
            >
              طباعة الكل
            </Button>
            <Button
              variant="outlined"
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

          {isMobile ? (
            <Box
              ref={cartTableRef}
              sx={{ maxHeight: "55vh", overflowY: "auto", p: 1.5 }}
            >
              {shoppingCart.length === 0 ? (
                <Typography
                  align="center"
                  color="text.secondary"
                  sx={{ py: 4 }}
                >
                  لا توجد منتجات في السلة
                </Typography>
              ) : (
                shoppingCart.map((product) => (
                  <MobileBuyCartItem
                    key={product.id}
                    product={product}
                    setShoppingCart={setShoppingCart}
                    isSelected={selectedProductIds.has(product.id)}
                    onSelectionChange={(selected) =>
                      handleSelectProduct(product.id, selected)
                    }
                  />
                ))
              )}
            </Box>
          ) : (
            <TableContainer
              ref={cartTableRef}
              sx={{
                height: "50vh",
                overflowY: "auto",
              }}
            >
              <Table
                stickyHeader
                sx={{
                  "& .MuiTableCell-head": {
                    bgcolor: "background.paper",
                  },
                }}
              >
                <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={handleSelectAll}
                      disabled={shoppingCart.length === 0}
                    />
                  </TableCell>
                  <TableCell>المنتج</TableCell>
                  <TableCell>الكمية</TableCell>
                  <TableCell>سعر الشراء</TableCell>
                  <TableCell>السعر</TableCell>
                  <TableCell>الاجمالي</TableCell>
                  <TableCell>الصلاحية</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shoppingCart.map((product) => (
                  <ProductInCart
                    key={product.id}
                    product={product}
                    setShoppingCart={setShoppingCart}
                    type="buy"
                    isSelected={selectedProductIds.has(product.id)}
                    onSelectionChange={(selected) =>
                      handleSelectProduct(product.id, selected)
                    }
                  />
                ))}
              </TableBody>
            </Table>
            </TableContainer>
          )}
        </Card>
      </Grid2>

      {/* Batch Print Dialog */}
      <BatchPrintDialog
        open={batchPrintOpen}
        onClose={() => setBatchPrintOpen(false)}
        products={shoppingCart}
      />

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        products={shoppingCart}
        selectedProductIds={selectedProductIds}
        onApply={handleBulkEditApply}
      />
    </Grid2>
  );
};

export default Buy;

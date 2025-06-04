import {
  Autocomplete,
  Button,
  ButtonGroup,
  Card,
  FormControl,
  FormControlLabel,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Bill, Party, Product, SCProduct } from "../utils/types";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "../Shared/ProductInCart";
import ShiftDialog from "../Sell/Components/ShiftDialog";
import BillView from "../utils/BillView";
import LoadingScreen from "../Shared/LoadingScreen";
import { printBill } from "../utils/functions";
import { useNavigate } from "react-router-dom";
import PartyDetails from "../Shared/PartyDetails";
import useBarcodeDetection from "../Shared/hooks/useBarcodeDetection";
import useQuickHandle from "../Shared/hooks/useCtrlBackspace";
import ProductAutocomplete from "../Shared/ProductAutocomplete";
import Installments from "../Sell/Components/Installments";
import useParties from "../Shared/hooks/useParties";
import useProducts from "../Shared/hooks/useProducts";
import { useShift } from "../Sell/hooks/useShifts";
import useBills from "../Sell/hooks/useBills";
import { StoreContext } from "@renderer/StoreDataProvider";
import { usePersistentCart } from "../Shared/hooks/usePersistentCart";

const AdminSell = () => {
  const {
    products,
    isLoading: isProductsLoading,
    updateProducts,
  } = useProducts();

  const [shoppingCart, setShoppingCart] = usePersistentCart(
    "AdminSell",
    [],
    products,
  );
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [discount, setDiscount] = useState<number>(0);
  const [billPayment, setBillPayment] = useState<
    "sell" | "BNPL" | "return" | "reserve" | "installment"
  >("sell");
  const [partyId, setPartyId] = useState<number | null>(null);
  const [addingParty, setAddingParty] = useState<boolean>(false);
  const [newParty, setNewParty] = useState<Party>({
    id: null,
    name: "",
    phone: "",
    address: "",
    type: "عميل",
    extra_info: {},
  });
  const [shiftDialog, setShiftDialog] = useState<boolean>(false);
  const [lastBill, setLastBill] = useState<Bill | null>(null);
  const [lastBillOpen, setLastBillOpen] = useState<boolean>(false);
  const [installments, setInstallments] = useState<number>(1);
  const [installmentInterval, setInstallmentInterval] = useState<number>(30);
  const [paid, setPaid] = useState<number>(0);
  const [usingThirdParties, setUsingThirdParties] = useState<boolean>(false);

  // Ref for the cart container to enable auto-scroll
  const cartTableRef = useRef<HTMLDivElement>(null);

  // Add an internal state to track submission status
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Add a ref to track if a submission is in progress
  const submissionInProgress = useRef<boolean>(false);

  const billRef = useRef<HTMLDivElement>(null);
  const { storeId } = useContext(StoreContext);

  const navigate = useNavigate();

  const { shift, isShiftLoading, isShiftError } = useShift();

  const { parties, addPartyMutationAsync } = useParties(setMsg);

  const { createBill, isCreatingBill } = useBills();

  useEffect(() => {
    const usingThirdParties = localStorage.getItem("usingThirdParties");
    if (usingThirdParties) {
      setUsingThirdParties(true);
    }
  }, []);

  useEffect(() => {
    if (isShiftError) {
      setMsg({
        type: "error",
        text: "لا يوجد شيفت مفتوح",
      });
      navigate("/login");
    } else if (shift) {
      setShiftDialog(false);
    }
  }, [isShiftError, shift, navigate]);
  // Update the submission status when React Query updates its state
  useEffect(() => {
    if (!isCreatingBill && isSubmitting) {
      setIsSubmitting(false);
      submissionInProgress.current = false;
    }
  }, [isCreatingBill, isSubmitting]);

  // Auto-scroll cart to bottom when new products are added
  useEffect(() => {
    if (cartTableRef.current) {
      cartTableRef.current.scrollTop = cartTableRef.current.scrollHeight;
    }
  }, [shoppingCart]);

  const loading = isProductsLoading || isShiftLoading;
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

  useQuickHandle(shoppingCart, setShoppingCart);
  useBarcodeDetection(products, addToCart, setMsg);

  // Create a debounced version of the submit function to prevent multiple submissions
  const submitBill = useCallback(
    async (shoppingCart: SCProduct[], discount: number) => {
      // Use both the React Query state and our local state to prevent multiple submissions
      if (isCreatingBill || isSubmitting || submissionInProgress.current) {
        console.log(
          "Submission already in progress, ignoring duplicate request",
        );
        return;
      }

      // Set our local states immediately to prevent race conditions
      setIsSubmitting(true);
      submissionInProgress.current = true;

      if (discount >= shoppingCart.reduce((acc, item) => acc + item.price, 0)) {
        setMsg({
          type: "error",
          text: "الخصم اكبر من الاجمالي",
        });
        setIsSubmitting(false);
        submissionInProgress.current = false;
        return;
      }

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
        const bill = {
          time: new Date().toLocaleString(),
          discount: discount,
          total:
            shoppingCart.reduce(
              (acc, item) => acc + item.price * item.quantity,
              0,
            ) - discount,
          products_flow: shoppingCart,
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

        const data = await createBill({
          bill,
          billPayment,
          newPartyId,
          paid,
          installments,
          installmentInterval,
          storeId,
        });

        setLastBill(data.bill);
        setShoppingCart([]);
        setDiscount(0);
        setBillPayment("sell");
        setPartyId(null);
        setAddingParty(false);
        setNewParty({
          id: null,
          name: "",
          phone: "",
          address: "",
          type: "عميل",
          extra_info: {},
        });

        await updateProducts();
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
        window.alert(
          "حدث خطا ما اثناء اضافة الفاتورة يرجى التاكد فى صفحة الفواتير ان كانت الفاتورة محفوظة",
        );
      } finally {
        // Always ensure we reset the submission state, even in case of errors
        setIsSubmitting(false);
        submissionInProgress.current = false;
      }
    },
    [
      billPayment,
      updateProducts,
      newParty,
      partyId,
      addingParty,
      installments,
      installmentInterval,
      paid,
      storeId,
      isCreatingBill,
      addPartyMutationAsync,
    ],
  );

  // Handle keyboard shortcuts using a single event listener that remains stable
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        await submitBill(shoppingCart, discount);
      } else if (e.key === "F1") {
        e.preventDefault();
        await submitBill(shoppingCart, discount);
        if (!isSubmitting && !submissionInProgress.current) {
          printBill(billRef, setMsg, setLastBillOpen);
        }
      }
    },
    [shoppingCart, discount, submitBill, isSubmitting],
  );

  // Set up keyboard listener only once with a stable callback reference
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Create a safe wrapper for the print and submit function
  const submitAndPrint = useCallback(async () => {
    await submitBill(shoppingCart, discount);
    if (!isSubmitting && !submissionInProgress.current) {
      printBill(billRef, setMsg, setLastBillOpen);
    }
  }, [submitBill, shoppingCart, discount, isSubmitting]);

  // Check if submit should be disabled
  const isSubmitDisabled =
    shoppingCart.length === 0 ||
    isCreatingBill ||
    isSubmitting ||
    submissionInProgress.current ||
    (addingParty && (!newParty.name || !newParty.phone));

  return (
    <Grid2 container spacing={3}>
      <BillView
        bill={lastBill}
        open={lastBillOpen}
        setOpen={setLastBillOpen}
        ref={billRef}
      />
      <LoadingScreen loading={loading} />
      <AlertMessage message={msg} setMessage={setMsg} />
      <ShiftDialog
        dialogOpen={shiftDialog}
        setDialogOpen={setShiftDialog}
        shift={shift}
      />
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid2 container spacing={3} alignItems="center">
            <Grid2 container size={12} justifyContent="space-between">
              <Button variant="contained" onClick={() => setShiftDialog(true)}>
                الشيفتات
              </Button>
              <FormControlLabel
                control={<Switch />}
                checked={usingThirdParties}
                onChange={() => {
                  localStorage.setItem(
                    "usingThirdParties",
                    usingThirdParties ? "" : "true",
                  );
                  setUsingThirdParties((prev) => !prev);
                }}
                label="اظهار العملاء"
              />
            </Grid2>

            <Grid2 size={3}>
              <FormControl fullWidth>
                <InputLabel>نوع الفاتورة</InputLabel>
                <Select
                  label="نوع الفاتورة"
                  value={billPayment}
                  onChange={(e) =>
                    setBillPayment(e.target.value as "sell" | "BNPL" | "return")
                  }
                  size="small"
                >
                  <MenuItem value="sell">نقدي</MenuItem>
                  <MenuItem value="BNPL">اجل</MenuItem>
                  <MenuItem value="return">مرتجع</MenuItem>
                  <MenuItem value="reserve">حجز</MenuItem>
                  <MenuItem value="installment">تقسيط</MenuItem>
                </Select>
              </FormControl>
            </Grid2>

            <Grid2 size={3}>
              <TextField
                label="الخصم"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                fullWidth
                size="small"
                disabled={["return", "installment"].includes(billPayment)}
                inputMode="decimal"
              />
            </Grid2>

            <Grid2 size={3}>
              <ButtonGroup fullWidth>
                <Button
                  variant="contained"
                  onClick={() => submitBill(shoppingCart, discount)}
                  disabled={isSubmitDisabled}
                >
                  حفظ الفاتورة (F2)
                </Button>
                <Button
                  variant="contained"
                  onClick={submitAndPrint}
                  disabled={isSubmitDisabled}
                >
                  حفظ و طباعة الفاتورة (F1)
                </Button>
              </ButtonGroup>
            </Grid2>

            <Grid2 size={3}>
              <Typography variant="h6" align="center">
                الاجمالي{": "}
                {shoppingCart.reduce(
                  (acc, item) => acc + item.price * item.quantity,
                  0,
                ) - discount}{" "}
                جنيه
              </Typography>
              <Typography variant="body1" align="center"></Typography>
            </Grid2>
            {billPayment === "installment" && (
              <Installments
                installments={installments}
                setInstallments={setInstallments}
                installmentInterval={installmentInterval}
                setInstallmentInterval={setInstallmentInterval}
                paid={paid}
                setPaid={setPaid}
                shoppingCart={shoppingCart}
                discount={discount}
              />
            )}

            <Grid2 size={12}>
              <ProductAutocomplete
                onProductSelect={addToCart}
                products={products}
              />
            </Grid2>
            {usingThirdParties && (
              <Grid2 size={12}>
                <Autocomplete
                  options={
                    [
                      { id: null, name: "بدون عميل", phone: "", address: "" },
                      { id: null, name: "عميل جديد", phone: "", address: "" },
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
                      if (value && value.name === "عميل جديد") {
                        setAddingParty(true);
                      } else {
                        setAddingParty(false);
                      }
                    }
                  }}
                  filterOptions={(options, params) => {
                    const filtered = options.filter(
                      (option) =>
                        option.name.toLowerCase().includes(params.inputValue) ||
                        option.phone.includes(params.inputValue),
                    );
                    return filtered;
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="اسم العميل" />
                  )}
                />
              </Grid2>
            )}

            {addingParty && (
              <Grid2 container size={12} gap={3}>
                <TextField
                  label="اسم العميل"
                  value={newParty.name}
                  onChange={(e) =>
                    setNewParty({ ...newParty, name: e.target.value })
                  }
                />
                <TextField
                  label="رقم الهاتف"
                  value={newParty.phone}
                  onChange={(e) =>
                    setNewParty({ ...newParty, phone: e.target.value })
                  }
                />
                <TextField
                  label="العنوان"
                  value={newParty.address}
                  onChange={(e) =>
                    setNewParty({ ...newParty, address: e.target.value })
                  }
                />
              </Grid2>
            )}
            {partyId && (
              <Grid2 container size={12} gap={3}>
                <PartyDetails partyId={partyId} />
              </Grid2>
            )}
          </Grid2>
        </Card>
      </Grid2>{" "}
      <Grid2 size={12}>
        <Card elevation={3}>
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
                  <TableCell>المنتج</TableCell>
                  <TableCell>الكمية</TableCell>
                  <TableCell>السعر</TableCell>
                  <TableCell>الاجمالي</TableCell>
                  <TableCell>حذف</TableCell>
                  <TableCell>الكمية المتاحة بالمخزن</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shoppingCart.map((product) => (
                  <ProductInCart
                    key={product.id}
                    product={product}
                    setShoppingCart={setShoppingCart}
                    type="sell-admin"
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Grid2>
    </Grid2>
  );
};

export default AdminSell;

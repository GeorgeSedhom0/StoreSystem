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
import { useCallback, useEffect, useRef, useState } from "react";
import { Bill, Party, Product, SCProduct } from "../../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "../Shared/ProductInCart";
import ShiftDialog from "./Components/ShiftDialog";
import BillView from "../../utils/BillView";
import LoadingScreen from "../Shared/LoadingScreen";
import { printBill } from "../../utils/functions";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import PartyDetails from "../Shared/PartyDetails";
import useBarcodeDetection from "../Shared/hooks/useBarcodeDetection";
import useQuickHandle from "../Shared/hooks/useCtrlBackspace";
import ProductAutocomplete from "../Shared/ProductAutocomplete";
import Installments from "./Components/Installments";
import useParties from "../Shared/hooks/useParties";
import useProducts from "../Shared/hooks/useProducts";

const getShift = async () => {
  const { data } = await axios.get("/current-shift");
  if (data.start_date_time) {
    return data.start_date_time;
  } else {
    throw new Error("No shift opened");
  }
};

const Sell = () => {
  const [shoppingCart, setShoppingCart] = useState<SCProduct[]>([]);
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

  const billRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef<boolean>(false);

  const naviagte = useNavigate();

  const {
    products,
    isLoading: isProductsLoading,
    updateProducts,
  } = useProducts();

  const {
    data: shift,
    isLoading: isShiftLoading,
    isError: isShiftError,
  } = useQuery({
    queryKey: ["shift"],
    queryFn: getShift,
    initialData: "",
    retry: false,
  });

  const { parties, addPartyMutationAsync } = useParties(setMsg, (parties) =>
    parties.filter((party) => party.type === "عميل"),
  );

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
      naviagte("/login");
    } else if (shift) {
      setShiftDialog(false);
    }
  }, [isShiftError, shift]);

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
          },
        ];
      }
    });
  }, []);

  useQuickHandle(shoppingCart, setShoppingCart);
  useBarcodeDetection(products, addToCart, setMsg);

  const submitBill = useCallback(
    async (shoppingCart: SCProduct[], discount: number) => {
      if (savingRef.current) return;
      savingRef.current = true;
      if (discount >= shoppingCart.reduce((acc, item) => acc + item.price, 0)) {
        setMsg({
          type: "error",
          text: "الخصم اكبر من الاجمالي",
        });
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

        const { data } = await axios.post("/bill", bill, {
          params: {
            move_type: billPayment,
            store_id: import.meta.env.VITE_STORE_ID,
            party_id: newPartyId,
            paid: paid,
            installments: installments,
            installment_interval: installmentInterval,
          },
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
      }
      savingRef.current = false;
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
    ],
  );

  useEffect(() => {
    const handleF2 = async (e: KeyboardEvent) => {
      if (e.key === "F2") {
        submitBill(shoppingCart, discount);
      }
      if (e.key === "F1") {
        e.preventDefault();
        await submitBill(shoppingCart, discount);
        printBill(billRef, setMsg, setLastBillOpen);
      }
    };
    window.addEventListener("keydown", handleF2);
    return () => {
      window.removeEventListener("keydown", handleF2);
    };
  }, [shoppingCart, discount, submitBill]);

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
                  disabled={
                    shoppingCart.length === 0 ||
                    (addingParty && (!newParty.name || !newParty.phone))
                  }
                >
                  حفظ الفاتورة (F2)
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    await submitBill(shoppingCart, discount);
                    printBill(billRef, setMsg, setLastBillOpen);
                  }}
                  disabled={
                    shoppingCart.length === 0 ||
                    (addingParty && (!newParty.name || !newParty.phone))
                  }
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
      </Grid2>

      <Grid2 size={12}>
        <Card elevation={3}>
          <TableContainer
            sx={{
              height: "60vh",
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
                    type="sell"
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

export default Sell;

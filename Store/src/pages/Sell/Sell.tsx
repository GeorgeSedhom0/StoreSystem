import {
  Autocomplete,
  Button,
  ButtonGroup,
  Card,
  FormControl,
  FormControlLabel,
  Grid,
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
import { Bill, DBProducts, Party, Product, SCProduct } from "../../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "./Components/ProductInCart";
import ShiftDialog from "./Components/ShiftDialog";
import BillView from "../../utils/BillView";
import LoadingScreen from "../Shared/LoadingScreen";
import { printBill } from "../../utils/functions";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useParties } from "../../utils/data/useParties";
import PartyDetails from "../Shared/PartyDetails";

const getProds = async () => {
  const { data } = await axios.get<DBProducts>(
    import.meta.env.VITE_SERVER_URL + "/products"
  );
  return data;
};

const getShift = async () => {
  const { data } = await axios.get(
    import.meta.env.VITE_SERVER_URL + "/current-shift"
  );
  if (data.start_date_time) {
    return data.start_date_time;
  } else {
    throw new Error("No shift opened");
  }
};

const Sell = () => {
  const [options, setOptions] = useState<Product[]>([]);
  const [query, setQuery] = useState<string>("");
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
  const [printer, setPrinter] = useState<any | null>(null);
  const [installments, setInstallments] = useState<number>(1);
  const [installmentInterval, setInstallmentInterval] = useState<number>(30);
  const [paid, setPaid] = useState<number>(0);
  const [usingThirdParties, setUsingThirdParties] = useState<boolean>(false);

  const billRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef<boolean>(false);

  const naviagte = useNavigate();

  const {
    data: products,
    isLoading: isProductsLoading,
    refetch: updateProducts,
  } = useQuery({
    queryKey: ["products"],
    queryFn: getProds,
    initialData: { products: [], reserved_products: [] },
    select: (data) => data.products,
  });

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
    parties.filter((party) => party.type === "عميل")
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

  useEffect(() => {
    if (!query) {
      setOptions(products);
      return;
    }
    setOptions(
      products
        .filter(
          (prod) =>
            prod.name.toLowerCase().includes(query.toLowerCase()) ||
            prod.bar_code.includes(query)
        )
        .slice(0, 30)
    );
  }, [products, query]);

  useEffect(() => {
    // for ease of use, if the user holds ctrl and typing numbers
    // the last product in the shopping cart quantity will be changed
    // the can also remove the last digit by ctrl pressing backspace

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && (!isNaN(parseInt(e.key)) || e.key === "Backspace")) {
        e.preventDefault();
        if (shoppingCart.length > 0) {
          setShoppingCart((prev) =>
            prev.map((item, index) => {
              if (index === prev.length - 1) {
                if (e.key === "Backspace") {
                  return {
                    ...item,
                    quantity:
                      parseInt(item.quantity.toString().slice(0, -1)) || 0,
                  };
                } else
                  return {
                    ...item,
                    quantity:
                      parseInt(item.quantity.toString() + e.key) ||
                      item.quantity,
                  };
              } else return item;
            })
          );
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);

    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [shoppingCart]);

  const addToCart = useCallback((product: Product | null) => {
    if (!product) return;
    setShoppingCart((prev) => {
      if (!product.id) return prev;
      const productExists = prev.find((item) => item.id === product.id);
      if (productExists) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
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

  useEffect(() => {
    let code = "";
    let reading = false;

    const handleKeyPress = (e: KeyboardEvent) => {
      // If the target of the event is an input element, ignore the event
      if ((e.target as HTMLElement).tagName.toLowerCase() === "input") {
        return;
      }

      if (e.key === "Enter") {
        if (code.length >= 7) {
          const product = products.find((prod) => prod.bar_code === code);
          if (product) {
            addToCart(product);
          } else {
            setMsg({
              type: "error",
              text: "المنتج غير موجود",
            });
          }
          code = "";
        }
      } else {
        code += e.key;
      }

      if (!reading) {
        reading = true;
        setTimeout(() => {
          code = "";
          reading = false;
        }, 500);
      }
    };

    window.addEventListener("keypress", handleKeyPress);

    return () => {
      window.removeEventListener("keypress", handleKeyPress);
    };
  }, [products, addToCart]);

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
              0
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

        const { data } = await axios.post(
          import.meta.env.VITE_SERVER_URL + "/bill",
          bill,
          {
            params: {
              move_type: billPayment,
              store_id: import.meta.env.VITE_STORE_ID,
              party_id: newPartyId,
              paid: paid,
              installments: installments,
              installment_interval: installmentInterval,
            },
          }
        );

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
          "حدث خطا ما اثناء اضافة الفاتورة يرجى التاكد فى صفحة الفواتير ان كانت الفاتورة محفوظة"
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
    ]
  );

  useEffect(() => {
    const handleF2 = async (e: KeyboardEvent) => {
      if (e.key === "F2") {
        submitBill(shoppingCart, discount);
      }
      if (e.key === "F1") {
        e.preventDefault();
        await submitBill(shoppingCart, discount);
        setTimeout(() => {
          printWithPrinter();
        }, 500);
      }
    };
    window.addEventListener("keydown", handleF2);
    return () => {
      window.removeEventListener("keydown", handleF2);
    };
  }, [shoppingCart, discount, submitBill]);

  const printWithPrinter = useCallback(async () => {
    setLastBillOpen(true);
    if (printer) {
      setTimeout(() => {
        printBill(billRef, setMsg, setLastBillOpen, printer);
      }, 500);
    } else {
      // request access to usb device, no filter listing all devices
      // @ts-ignore
      const usbDevice = await navigator.usb.requestDevice({
        filters: [
          {
            vendorId: 2727,
          },
        ],
      });
      // open the device
      await usbDevice.open();
      await usbDevice.selectConfiguration(1);
      await usbDevice.claimInterface(0);
      setPrinter(usbDevice);
      printBill(billRef, setMsg, setLastBillOpen, usbDevice);
    }
  }, [printer]);

  return (
    <Grid container spacing={3}>
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

      <Grid item xs={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item container xs={12} justifyContent="space-between">
              <Button variant="contained" onClick={() => setShiftDialog(true)}>
                الشيفتات
              </Button>
              <FormControlLabel
                control={<Switch />}
                checked={usingThirdParties}
                onChange={() => {
                  localStorage.setItem(
                    "usingThirdParties",
                    usingThirdParties ? "" : "true"
                  );
                  setUsingThirdParties((prev) => !prev);
                }}
                label="اظهار العملاء"
              />
            </Grid>

            <Grid item xs={12} sm={3}>
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
            </Grid>

            <Grid item xs={12} sm={3}>
              <TextField
                label="الخصم"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(parseInt(e.target.value) || 0)}
                fullWidth
                size="small"
                disabled={["return", "installment"].includes(billPayment)}
              />
            </Grid>

            <Grid item xs={12} sm={3}>
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
                    setTimeout(() => {
                      printWithPrinter();
                    }, 500);
                  }}
                  disabled={
                    shoppingCart.length === 0 ||
                    (addingParty && (!newParty.name || !newParty.phone))
                  }
                >
                  حفظ و طباعة الفاتورة (F1)
                </Button>
              </ButtonGroup>
            </Grid>

            <Grid item xs={12} sm={3}>
              <Typography variant="h6" align="center">
                الاجمالي
              </Typography>
              <Typography variant="body1" align="center">
                {shoppingCart.reduce(
                  (acc, item) => acc + item.price * item.quantity,
                  0
                ) - discount}{" "}
                جنيه
              </Typography>
            </Grid>
            {billPayment === "installment" && (
              <>
                <Grid item container xs={12} gap={3}>
                  <TextField
                    label="عدد الاقساط"
                    type="number"
                    value={installments}
                    onChange={(e) =>
                      setInstallments(parseInt(e.target.value) || 1)
                    }
                    size="small"
                  />
                  <TextField
                    label="الفترة بين الاقساط"
                    type="number"
                    value={installmentInterval}
                    onChange={(e) =>
                      setInstallmentInterval(parseInt(e.target.value) || 30)
                    }
                    size="small"
                  />
                  <TextField
                    label="المقدم"
                    type="number"
                    value={paid}
                    onChange={(e) => setPaid(parseInt(e.target.value) || 0)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="h6">
                    المتبقي:{" "}
                    {shoppingCart.reduce(
                      (acc, item) => acc + item.price * item.quantity,
                      0
                    ) -
                      discount -
                      paid}{" "}
                    جنيه
                  </Typography>
                  <Typography variant="h6">
                    قيمة القسط:{" "}
                    {shoppingCart.reduce(
                      (acc, item) => acc + item.price * item.quantity,
                      0
                    ) -
                      discount -
                      paid}{" "}
                    / {installments} ={" "}
                    {(shoppingCart.reduce(
                      (acc, item) => acc + item.price * item.quantity,
                      0
                    ) -
                      discount -
                      paid) /
                      installments}{" "}
                    جنيه
                  </Typography>
                </Grid>
              </>
            )}

            <Grid item xs={12}>
              <Autocomplete
                options={options}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) =>
                  option.id === value.id || option.bar_code === value.bar_code
                }
                value={null}
                onChange={(_, value) => {
                  addToCart(value);
                  setQuery("");
                }}
                autoHighlight
                inputValue={query}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="المنتج"
                    onChange={(e) => {
                      const currentValue = e.target.value;
                      setQuery(currentValue);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        // if an enter is pressed, and the query is more than or equal to 8 numbers
                        // then search for the product with the barcode and add it to the cart
                        if (query.length >= 7 && !isNaN(parseInt(query))) {
                          const product = products.find(
                            (prod) => prod.bar_code === query
                          );
                          if (product) {
                            addToCart(product);
                          } else {
                            setMsg({
                              type: "error",
                              text: "المنتج غير موجود",
                            });
                          }
                          setQuery("");
                        }
                      }
                    }}
                  />
                )}
              />
            </Grid>
            {usingThirdParties && (
              <Grid item xs={12}>
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
                        option.phone.includes(params.inputValue)
                    );
                    return filtered;
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="اسم العميل" />
                  )}
                />
              </Grid>
            )}

            {addingParty && (
              <Grid item container xs={12} gap={3}>
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
              </Grid>
            )}
            {partyId && (
              <Grid item container xs={12} gap={3}>
                <PartyDetails partyId={partyId} />
              </Grid>
            )}
          </Grid>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card elevation={3}>
          <TableContainer
            sx={{
              height: 650,
              overflowY: "auto",
            }}
          >
            <Table
              stickyHeader
              sx={{
                // the Table Cell from Table Row from Table Head should be background.paper
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
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Grid>
    </Grid>
  );
};

export default Sell;

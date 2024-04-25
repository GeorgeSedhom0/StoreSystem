import {
  Autocomplete,
  Button,
  Card,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Bill, Product, SCProduct } from "../../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "./Components/ProductInCart";
import ShiftDialog from "./Components/ShiftDialog";

const Sell = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [options, setOptions] = useState<Product[]>([]);
  const [query, setQuery] = useState<string>("");
  const [shoppingCart, setShoppingCart] = useState<SCProduct[]>([]);
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [discount, setDiscount] = useState<number>(0);
  const [billPayment, setBillPayment] = useState<"sale" | "BNPL">("sale");
  const [shift, setShipt] = useState<string | null>("");
  const [shiftDialog, setShiftDialog] = useState<boolean>(false);
  const [lastBill, setLastBill] = useState<Bill | null>(null);

  useEffect(() => {
    const getProds = async () => {
      try {
        const { data } = await axios.get("http://localhost:8000/products");
        setProducts(data);
      } catch (error) {
        console.log(error);
      }
    };
    getProds();
  }, []);

  useEffect(() => {
    const getShift = async () => {
      try {
        const { data } = await axios.get("http://localhost:8000/current-shift");
        setShipt(data.start_date_time);
      } catch (error) {
        console.log(error);
      }
    };
    getShift();
  }, []);

  useEffect(() => {
    if (!shift) setShiftDialog(true);
    else setShiftDialog(false);
  }, [shift]);

  useEffect(() => {
    if (!query) {
      setOptions([]);
      return;
    }
    setOptions(
      products
        .filter(
          (prod) =>
            prod.name.toLowerCase().includes(query.toLowerCase()) ||
            prod.bar_code.includes(query)
        )
        .slice(0, 10)
    );
  }, [products, query]);

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
        if (code.length >= 8) {
          const product = products.find((prod) => prod.bar_code === code);
          if (product) {
            addToCart(product);
            console.log(product);
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

  // mock
  async function printBill() {
    const printerIP = "192.168.1.100"; // Example printer IP address
    const billData = lastBill; // Generate bill data

    try {
      const response = await fetch(`http://${printerIP}/print`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(billData),
      });

      if (response.ok) {
        console.log("Bill printed successfully");
      } else {
        console.error("Failed to print bill");
      }
    } catch (error) {
      console.error("Error printing bill:", error);
    }
  }

  const submitBill = useCallback(
    async (shoppingCart: SCProduct[], discount: number) => {
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
        const { data } = await axios.post("http://localhost:8000/bill", bill, {
          params: {
            move_type: billPayment,
          },
        });
        setLastBill(data.bill);
        setShoppingCart([]);
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
      }
    },
    [billPayment]
  );

  return (
    <Grid container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <ShiftDialog
        dialogOpen={shiftDialog}
        setDialogOpen={setShiftDialog}
        shift={shift}
        setShift={setShipt}
      />

      <Grid item xs={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item container xs={12} gap={3}>
              <Button variant="contained" onClick={() => setShiftDialog(true)}>
                فترات العمل
              </Button>
              <Button variant="contained" onClick={printBill}>
                طباعة الفاتورة
              </Button>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="h6">
                اختار منتج ليتم اضافته الى الفاتورة
              </Typography>
            </Grid>

            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>نوع الفاتورة</InputLabel>
                <Select
                  label="نوع الفاتورة"
                  value={billPayment}
                  onChange={(e) =>
                    setBillPayment(e.target.value as "sale" | "BNPL")
                  }
                  size="small"
                >
                  <MenuItem value="sale">نقدي</MenuItem>
                  <MenuItem value="BNPL">اجل</MenuItem>
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
              />
            </Grid>

            <Grid item xs={12} sm={3}>
              <Button
                variant="contained"
                onClick={() => submitBill(shoppingCart, discount)}
                disabled={shoppingCart.length === 0}
                fullWidth
              >
                اضافة فاتورة
              </Button>
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
                filterOptions={(x) => x}
                autoHighlight
                inputValue={query}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="المنتج"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                )}
              />
            </Grid>
          </Grid>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card elevation={1} sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>المنتج</TableCell>
                    <TableCell>الكمية</TableCell>
                    <TableCell>السعر</TableCell>
                    <TableCell>الاجمالي</TableCell>
                    <TableCell>حذف</TableCell>
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
          </Grid>
        </Card>
      </Grid>
    </Grid>
  );
};

export default Sell;

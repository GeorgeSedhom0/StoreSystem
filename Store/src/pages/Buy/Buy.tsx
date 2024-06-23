import {
  Autocomplete,
  Button,
  Card,
  Grid,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Table,
  TableBody,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Product, SCProduct } from "../../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "./Components/ProductInCart";
import { useQuery } from "@tanstack/react-query";
import LoadingScreen from "../Shared/LoadingScreen";

const getProducts = async () => {
  const { data } = await axios.get<Product[]>(
    import.meta.env.VITE_SERVER_URL + "/products"
  );
  return data;
};

const Buy = () => {
  const [options, setOptions] = useState<Product[]>([]);
  const [query, setQuery] = useState<string>("");
  const [shoppingCart, setShoppingCart] = useState<SCProduct[]>([]);
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });

  const {
    data: products,
    refetch: updateProducts,
    isLoading,
  } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
    initialData: [],
  });

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
        .slice(0, 30)
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
            stock: product.stock,
            barCode: product.bar_code,
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

  const submitBill = useCallback(
    async (shoppingCart: SCProduct[], discount: number) => {
      try {
        const bill = {
          time: new Date().toLocaleString(),
          discount,
          total:
            shoppingCart.reduce(
              (acc, item) => acc + item.wholesale_price * item.quantity,
              0
            ) - discount,
          products_flow: shoppingCart,
        };
        await axios.post(import.meta.env.VITE_SERVER_URL + "/bill", bill, {
          params: {
            move_type: "buy",
            store_id: import.meta.env.VITE_STORE_ID,
          },
        });
        await updateProducts();
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
    []
  );

  return (
    <Grid container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />

      <LoadingScreen loading={isLoading} />

      <Grid item xs={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={4}>
              <Typography variant="h6">
                اختار منتج ليتم اضافته الى الفاتورة
              </Typography>
              <Typography variant="subtitle1">
                يمكنك اضافة منتج الى الفاتورة و جعل الكمية 0 لتغير سعر الشراء او
                البيع للمنتج
              </Typography>
            </Grid>

            <Grid item xs={12} sm={3}>
              <Button
                variant="contained"
                onClick={() => submitBill(shoppingCart, 0)}
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
                  (acc, item) => acc + item.wholesale_price * item.quantity,
                  0
                )}{" "}
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
                    <TableCell>سعر الشراء</TableCell>
                    <TableCell>السعر</TableCell>
                    <TableCell>الاجمالي</TableCell>
                    <TableCell></TableCell>
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

export default Buy;

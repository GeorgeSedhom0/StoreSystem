import {
  Button,
  Card,
  Grid,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import { Product } from "../../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";

const Storage = () => {
  const [product, setProduct] = useState<Product>({
    name: "",
    category: "",
    price: 0,
    stock: 0,
    wholesale_price: 0,
    bar_code: "",
  });
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const addProduct = useCallback(async () => {
    try {
      const { data } = await axios.post(
        import.meta.env.VITE_SERVER_URL + "/product",
        product
      );
      console.log(data);
      setProduct({
        name: "",
        category: "",
        price: 0,
        stock: 0,
        wholesale_price: 0,
        bar_code: "",
      });
      setMsg({ type: "success", text: "تمت الاضافة بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ ما" });
    }
  }, [product]);

  const getBarcode = useCallback(async () => {
    try {
      const { data } = await axios.get(
        import.meta.env.VITE_SERVER_URL + "/barcode"
      );
      setProduct({ ...product, bar_code: data });
    } catch (error) {
      console.log(error);
    }
  }, [product, setProduct]);

  return (
    <Grid container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid item xs={12}>
        <Card
          elevation={3}
          sx={{
            p: 3,
          }}
        >
          <Grid container direction="column" gap={3}>
            <Typography variant="h6">اضافة منتج</Typography>
            <TextField
              label="اسم المنتج"
              value={product.name}
              onChange={(e) => setProduct({ ...product, name: e.target.value })}
            />
            <TextField
              label="السعر"
              value={product.price}
              onChange={(e) =>
                setProduct({
                  ...product,
                  price: parseFloat(e.target.value) || 0,
                })
              }
            />
            <TextField
              label="سعر الشراء"
              value={product.wholesale_price}
              onChange={(e) =>
                setProduct({
                  ...product,
                  wholesale_price: parseFloat(e.target.value) || 0,
                })
              }
            />
            <TextField
              label="الباركود"
              value={product.bar_code}
              onChange={(e) =>
                setProduct({ ...product, bar_code: e.target.value })
              }
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Button onClick={getBarcode}>احصل على باركود</Button>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="المجموعة"
              value={product.category}
              onChange={(e) =>
                setProduct({ ...product, category: e.target.value })
              }
            />
            <Button
              variant="contained"
              color="primary"
              onClick={addProduct}
              disabled={
                product.name === "" ||
                product.category === "" ||
                product.price === 0 ||
                product.wholesale_price === 0 ||
                product.bar_code === ""
              }
            >
              اضافة
            </Button>
          </Grid>
        </Card>
      </Grid>
    </Grid>
  );
};

export default Storage;

import {
  Button,
  Card,
  Grid2,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useContext, useState } from "react";
import { Product } from "../../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import PrintBarCode from "../Shared/PrintBarCode";
import { StoreContext } from "@renderer/StoreDataProvider";

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
  const [isPrintingCode, setIsPrintingCode] = useState(false);
  const { storeId } = useContext(StoreContext);

  const addProduct = useCallback(async () => {
    try {
      await axios.post("/product", product, {
        params: {
          store_id: storeId,
        },
      });
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
  }, [product, storeId]);

  const getBarcode = useCallback(async () => {
    try {
      const { data } = await axios.get("/barcode");
      setProduct({ ...product, bar_code: data });
    } catch (error) {
      console.log(error);
    }
  }, [product, setProduct]);

  return (
    <Grid2 container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      {isPrintingCode && (
        <PrintBarCode
          code={product.bar_code}
          name={product.name}
          price={product.price}
          setOpen={setIsPrintingCode}
        />
      )}
      <Grid2 size={12}>
        <Card
          elevation={3}
          sx={{
            p: 3,
          }}
        >
          <Grid2 container direction="column" gap={3}>
            <Typography variant="h6">اضافة منتج</Typography>
            <TextField
              label="اسم المنتج"
              value={product.name}
              onChange={(e) => setProduct({ ...product, name: e.target.value })}
            />
            <TextField
              label="السعر"
              type="number"
              value={product.price}
              onChange={(e) =>
                setProduct({
                  ...product,
                  price: parseFloat(e.target.value) || 0,
                })
              }
              inputMode="decimal"
            />
            <TextField
              label="سعر الشراء"
              type="number"
              value={product.wholesale_price}
              onChange={(e) =>
                setProduct({
                  ...product,
                  wholesale_price: parseFloat(e.target.value) || 0,
                })
              }
              inputMode="decimal"
            />
            <TextField
              label="الباركود"
              value={product.bar_code}
              onChange={(e) =>
                setProduct({ ...product, bar_code: e.target.value })
              }
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        onClick={() => setIsPrintingCode(true)}
                        disabled={product.bar_code === ""}
                      >
                        طباعة باركود
                      </Button>
                      <Button onClick={getBarcode}>احصل على باركود</Button>
                    </InputAdornment>
                  ),
                },
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
          </Grid2>
        </Card>
      </Grid2>
    </Grid2>
  );
};

export default Storage;

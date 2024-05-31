import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Product } from "../../utils/types";
import { Button, Card, Grid, TextField, Typography } from "@mui/material";
import { TableVirtuoso } from "react-virtuoso";
import ProductCard from "./Components/ProductCard";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";
import LoadingScreen from "../Shared/LoadingScreen";
import { Link } from "react-router-dom";

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [editedProducts, setEditedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  const filteredProducts = useMemo(() => {
    if (query === "") {
      if (changedOnly) {
        return editedProducts;
      }
      return products;
    }
    if (changedOnly) {
      return editedProducts.filter((product) =>
        product.name.toLowerCase().includes(query.toLowerCase())
      );
    }
    return products.filter((product) =>
      product.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [products, editedProducts, query, changedOnly]);

  const getProds = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get<Product[]>(
        "http://localhost:8000/products"
      );
      setProducts(data);
    } catch (error) {
      console.log(error);
    }
    setLoading(false);
  }, []);

  const getInventory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:8000/inventory", {
        responseType: "blob", // important
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "جرد المنتجات.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.log(error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    getProds();
  }, []);

  const submitProducts = useCallback(async () => {
    setLoading(true);
    try {
      await axios.put("http://localhost:8000/products", editedProducts);
      setMsg({ type: "success", text: "تم تعديل المنتجات بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء تعديل المنتجات" });
    }
    setLoading(false);
    setQuery("");
    setChangedOnly(false);
    setEditedProducts([]);
  }, [editedProducts]);

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h4">المنتجات</Typography>
                <Typography variant="subtitle1">
                  عند الانتهاء من التعديل يرجى الضغط على "عرض المعدلة فقط"
                  للتأكد من الحفظ بشكل صحيح
                </Typography>
                <Typography variant="subtitle2">
                  لا يمكن تعديل سعر الشراء او البيع للمنتج من هذة الصفحة للتعديل
                  يجب الذهاب الى{" "}
                  <Link
                    to="/buy"
                    style={{
                      color: "inherit",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    صفحة الشراء
                  </Link>
                </Typography>
              </Grid>

              <Grid item container xs={12} gap={3}>
                <Button onClick={submitProducts} variant="contained">
                  حفظ التعديلات
                </Button>
                <Button
                  onClick={() => setChangedOnly((prev) => !prev)}
                  variant="contained"
                >
                  {changedOnly ? "عرض الكل" : "عرض المعدلة فقط"}
                </Button>
                <Button onClick={getInventory} variant="contained">
                  تحميل جرد المنتجات
                </Button>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="بحث"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  fullWidth
                />
              </Grid>
            </Grid>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card
            elevation={3}
            sx={{
              position: "relative",
              height: 600,
            }}
          >
            <LoadingScreen loading={loading} />
            <TableVirtuoso
              fixedHeaderContent={fixedHeaderContent}
              components={VirtuosoTableComponents}
              data={filteredProducts}
              itemContent={(_, product) => (
                <ProductCard
                  product={product}
                  setEditedProducts={setEditedProducts}
                  editedProducts={editedProducts}
                  key={product.id || product.bar_code}
                />
              )}
            />
          </Card>
        </Grid>
      </Grid>
    </>
  );
};

export default Products;

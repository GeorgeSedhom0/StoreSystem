import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DBProducts, Product } from "../../utils/types";
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
  const [reservedProducts, setReservedProducts] = useState<
    Record<number, Product>
  >({});
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
      const {
        data: { products, reserved_products },
      } = await axios.get<DBProducts>(
        import.meta.env.VITE_SERVER_URL + "/products"
      );
      console.log(
        products,
        reserved_products.reduce((acc, product) => {
          acc[product.id!] = product;
          return acc;
        }, {} as Record<number, Product>)
      );
      setProducts(products);
      setReservedProducts(
        reserved_products.reduce((acc, product) => {
          acc[product.id!] = product;
          return acc;
        }, {} as Record<number, Product>)
      );
    } catch (error) {
      console.log(error);
    }
    setLoading(false);
  }, []);

  const getInventory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        import.meta.env.VITE_SERVER_URL + "/inventory",
        {
          responseType: "blob", // important
        }
      );
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
      await axios.put(
        import.meta.env.VITE_SERVER_URL + "/products",
        editedProducts,
        {
          params: {
            store_id: import.meta.env.VITE_STORE_ID,
          },
        }
      );
      setMsg({ type: "success", text: "تم تعديل المنتجات بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء تعديل المنتجات" });
    }
    await getProds();
    setLoading(false);
    setQuery("");
    setChangedOnly(false);
    setEditedProducts([]);
  }, [editedProducts]);

  const deleteProduct = useCallback(async (productId: number) => {
    setLoading(true);
    try {
      await axios.put(
        import.meta.env.VITE_SERVER_URL + "/product/delete",
        null,
        {
          params: {
            product_id: productId,
          },
        }
      );
      setMsg({ type: "success", text: "تم ازالة المنتج بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء ازالة المنتج" });
    }
    await getProds();
    setLoading(false);
  }, []);

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
                  reserved={reservedProducts[product.id!]?.stock || 0}
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

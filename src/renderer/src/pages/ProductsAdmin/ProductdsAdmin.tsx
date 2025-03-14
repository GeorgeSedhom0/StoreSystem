import axios from "axios";
import { useCallback, useContext, useMemo, useState } from "react";
import { AdminProduct } from "../../utils/types";
import { Button, Card, Grid2, TextField, Typography } from "@mui/material";
import { TableVirtuoso } from "react-virtuoso";
import AdminProductCard from "./Components/AdminProductCard";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";
import LoadingScreen from "../Shared/LoadingScreen";
import { Link } from "react-router-dom";
import useAdminProducts from "../Shared/hooks/useAdminProducts";
import { StoreContext } from "@renderer/StoreDataProvider";

const ProductsAdmin = () => {
  const [editedProducts, setEditedProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  const { storeId } = useContext(StoreContext);

  const {
    products,
    reservedProducts,
    updateProducts: getProds,
  } = useAdminProducts();

  const filteredProducts = useMemo(() => {
    if (query === "") {
      if (changedOnly) {
        return editedProducts;
      }
      return products;
    }
    if (changedOnly) {
      return editedProducts.filter(
        (product) =>
          product.name.toLowerCase().includes(query.toLowerCase()) ||
          product.bar_code.toLowerCase().includes(query.toLowerCase()),
      );
    }
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.bar_code.toLowerCase().includes(query.toLowerCase()),
    );
  }, [products, editedProducts, query, changedOnly]);

  const getInventory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get("/admin/inventory", {
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

  const submitProducts = useCallback(async () => {
    setLoading(true);
    try {
      await axios.put("/products", editedProducts, {
        params: {
          store_id: storeId,
        },
      });
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
  }, [editedProducts, storeId]);

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Grid2 container spacing={3}>
              <Grid2 container size={12}>
                <Typography variant="h4">المنتجات</Typography>
              </Grid2>
              <Grid2 size={12}>
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
              </Grid2>

              <Grid2 container size={12} gap={3}>
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
              </Grid2>

              <Grid2 size={12}>
                <TextField
                  label="بحث"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  fullWidth
                />
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>

        <Grid2 size={12}>
          <Card
            elevation={3}
            sx={{
              position: "relative",
              height: 600,
            }}
          >
            <LoadingScreen loading={loading} />
            <TableVirtuoso
              fixedHeaderContent={() =>
                fixedHeaderContent({
                  stores:
                    products.length > 0
                      ? Object.keys(products[0].stock_by_store)
                      : [],
                })
              }
              components={VirtuosoTableComponents}
              data={filteredProducts}
              itemContent={(_, product) => (
                <AdminProductCard
                  product={product}
                  reserved={reservedProducts[product.id!]}
                  setEditedProducts={setEditedProducts}
                  editedProducts={editedProducts}
                  key={product.id || product.bar_code}
                />
              )}
            />
          </Card>
        </Grid2>
      </Grid2>
    </>
  );
};

export default ProductsAdmin;

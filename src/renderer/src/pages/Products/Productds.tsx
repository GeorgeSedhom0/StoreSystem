import axios from "axios";
import { useCallback, useMemo, useState, useContext } from "react";
import { Product } from "../../utils/types";
import {
  Button,
  Card,
  FormControlLabel,
  Grid2,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { TableVirtuoso } from "react-virtuoso";
import ProductCard from "./Components/ProductCard";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";
import LoadingScreen from "../Shared/LoadingScreen";
import { Link } from "react-router-dom";
import useProducts from "../Shared/hooks/useProducts";
import { StoreContext } from "@renderer/StoreDataProvider";

const Products = () => {
  const [editedProducts, setEditedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [showDeleted, setShowDeleted] = useState<boolean>(false);

  const {
    products,
    reservedProducts,
    updateProducts: getProds,
  } = useProducts(showDeleted);

  const { storeId } = useContext(StoreContext);

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
      const response = await axios.get("/inventory", {
        responseType: "blob", // important
        params: {
          store_id: storeId,
        },
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
  }, [editedProducts]);

  const deleteProduct = useCallback(async (productId: number) => {
    setLoading(true);
    try {
      await axios.put("/product/delete", null, {
        params: {
          product_id: productId,
          store_id: storeId,
        },
      });
      setMsg({ type: "success", text: "تم ازالة المنتج بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء ازالة المنتج" });
    }
    await getProds();
    setLoading(false);
  }, []);

  const restoreProduct = useCallback(async (productId: number) => {
    setLoading(true);
    try {
      await axios.put("/product/restore", null, {
        params: {
          product_id: productId,
          store_id: storeId,
        },
      });
      setMsg({ type: "success", text: "تم استعادة المنتج بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء استعادة المنتج" });
    }
    await getProds();
    setLoading(false);
  }, []);

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Grid2 container spacing={3}>
              <Grid2 container size={12} justifyContent="space-between">
                <Typography variant="h4">المنتجات</Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showDeleted}
                      onChange={(e) => setShowDeleted(e.target.checked)}
                    />
                  }
                  label="عرض المنتجات المحذوفة"
                />
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
                  deleteProduct={deleteProduct}
                  restoreProduct={restoreProduct}
                  isShowingDeleted={showDeleted}
                />
              )}
            />
          </Card>
        </Grid2>
      </Grid2>
    </>
  );
};

export default Products;

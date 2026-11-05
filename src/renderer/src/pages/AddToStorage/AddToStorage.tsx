import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Grid2,
  TextField,
  Typography,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { AutoAwesome, Print } from "@mui/icons-material";
import { useCallback, useContext, useMemo, useState } from "react";
import { Product } from "../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import PrintBarCode from "../Shared/PrintBarCode";
import NumberField from "../Shared/NumberField";
import useProducts from "../Shared/hooks/useProducts";
import { apiError } from "../utils/errors";
import { StoreContext } from "@renderer/StoreDataProvider";

const EMPTY: Product = {
  name: "",
  category: "",
  price: 0,
  stock: 0,
  wholesale_price: 0,
  bar_code: "",
};

const Storage = () => {
  const [product, setProduct] = useState<Product>(EMPTY);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [isPrintingCode, setIsPrintingCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gettingBarcode, setGettingBarcode] = useState(false);
  const { storeId } = useContext(StoreContext);
  const { products, updateProducts } = useProducts(false);

  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.category).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "ar"),
      ),
    [products],
  );

  const fetchBarcode = useCallback(async () => {
    const { data } = await axios.get<string>("/barcode");
    return String(data);
  }, []);

  const getBarcode = useCallback(async () => {
    setGettingBarcode(true);
    try {
      const code = await fetchBarcode();
      setProduct((prev) => ({ ...prev, bar_code: code }));
    } catch (error) {
      setMsg({ type: "error", text: apiError(error, "تعذر توليد باركود") });
    } finally {
      setGettingBarcode(false);
    }
  }, [fetchBarcode]);

  const name = product.name.trim();
  const priceBelowCost =
    product.price > 0 &&
    product.wholesale_price > 0 &&
    product.price < product.wholesale_price;
  const canSave =
    name !== "" && product.price > 0 && product.wholesale_price > 0;

  const addProduct = useCallback(async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // No barcode typed: take the next free one so the product can be
      // scanned/printed later.
      const barCode = product.bar_code.trim() || (await fetchBarcode());
      await axios.post(
        "/product",
        {
          ...product,
          name,
          bar_code: barCode,
          category: product.category.trim(),
        },
        { params: { store_id: storeId } },
      );
      setProduct(EMPTY);
      setMsg({
        type: "success",
        text: `تمت إضافة «${name}» بالباركود ${barCode}`,
      });
      updateProducts();
    } catch (error) {
      setMsg({
        type: "error",
        text: apiError(error, "حدث خطأ أثناء إضافة المنتج"),
      });
    } finally {
      setSaving(false);
    }
  }, [product, name, canSave, saving, storeId, fetchBarcode, updateProducts]);

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
            p: { xs: 2, sm: 3 },
            maxWidth: 720,
            mx: "auto",
          }}
        >
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              addProduct();
            }}
          >
            <Grid2 container spacing={2.5}>
              <Grid2 size={12}>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  إضافة منتج
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  الكمية تضاف لاحقًا من صفحة الشراء.
                </Typography>
              </Grid2>
              <Grid2 size={12}>
                <TextField
                  fullWidth
                  required
                  label="اسم المنتج"
                  value={product.name}
                  onChange={(e) =>
                    setProduct({ ...product, name: e.target.value })
                  }
                />
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 6 }}>
                <NumberField
                  fullWidth
                  required
                  label="سعر البيع"
                  value={product.price}
                  onValueChange={(price) => setProduct({ ...product, price })}
                  min={0}
                />
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 6 }}>
                <NumberField
                  fullWidth
                  required
                  label="سعر الشراء"
                  value={product.wholesale_price}
                  onValueChange={(wholesale_price) =>
                    setProduct({ ...product, wholesale_price })
                  }
                  min={0}
                />
              </Grid2>
              {priceBelowCost && (
                <Grid2 size={12}>
                  <Alert severity="warning">
                    سعر البيع أقل من سعر الشراء — سيتم البيع بخسارة. يمكنك
                    المتابعة إذا كان ذلك مقصودًا.
                  </Alert>
                </Grid2>
              )}
              <Grid2 size={12}>
                <TextField
                  fullWidth
                  label="الباركود"
                  value={product.bar_code}
                  onChange={(e) =>
                    setProduct({ ...product, bar_code: e.target.value })
                  }
                  helperText="اتركه فارغًا ليتم توليد باركود تلقائيًا عند الإضافة"
                  slotProps={{
                    htmlInput: { dir: "ltr", autoComplete: "off" },
                  }}
                />
                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                  <LoadingButton
                    variant="outlined"
                    startIcon={<AutoAwesome />}
                    onClick={getBarcode}
                    loading={gettingBarcode}
                    sx={{ minHeight: 40 }}
                  >
                    توليد باركود
                  </LoadingButton>
                  <Button
                    variant="outlined"
                    startIcon={<Print />}
                    onClick={() => setIsPrintingCode(true)}
                    disabled={product.bar_code.trim() === ""}
                    sx={{ minHeight: 40 }}
                  >
                    طباعة باركود
                  </Button>
                </Box>
              </Grid2>
              <Grid2 size={12}>
                <Autocomplete
                  freeSolo
                  options={categories}
                  inputValue={product.category}
                  onInputChange={(_, value) =>
                    setProduct((prev) => ({ ...prev, category: value }))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="المجموعة (اختياري)"
                      helperText="اختر مجموعة موجودة أو اكتب اسمًا جديدًا"
                    />
                  )}
                />
              </Grid2>
              <Grid2 size={12}>
                <LoadingButton
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  fullWidth
                  loading={saving}
                  disabled={!canSave}
                  sx={{ minHeight: 48 }}
                >
                  إضافة
                </LoadingButton>
                {!canSave && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1, textAlign: "center" }}
                  >
                    أدخل اسم المنتج وسعر البيع وسعر الشراء
                  </Typography>
                )}
              </Grid2>
            </Grid2>
          </Box>
        </Card>
      </Grid2>
    </Grid2>
  );
};

export default Storage;

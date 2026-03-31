import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import useProducts from "@renderer/pages/Shared/hooks/useProducts";
import type { Product } from "@renderer/pages/utils/types";
import {
  buildBarcodeLabelHtml,
  type BarcodeSettings,
} from "@renderer/pages/Shared/barcodeUtils";

interface BarcodePreviewProps {
  barcodeSettings: BarcodeSettings;
  barcodePrinterWidth: string;
  barcodePrinterHeight: string;
}

const SAMPLE_PREVIEW_PRODUCT: Product = {
  id: -1,
  name: "منتج تجريبي طويل لعرض تأثير النص على ملصق الباركود",
  wholesale_price: 0,
  price: 125,
  category: "",
  stock: 0,
  bar_code: "123456789012",
};

const BarcodePreview = ({
  barcodeSettings,
  barcodePrinterWidth,
  barcodePrinterHeight,
}: BarcodePreviewProps) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const { products, isLoading } = useProducts(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const productsWithBarcode = products.filter((product) =>
    product.bar_code?.trim(),
  );

  useEffect(() => {
    if (productsWithBarcode.length === 0) {
      if (selectedProduct?.id !== SAMPLE_PREVIEW_PRODUCT.id) {
        setSelectedProduct(null);
      }
      return;
    }

    if (
      !selectedProduct ||
      !productsWithBarcode.some((product) => product.id === selectedProduct.id)
    ) {
      setSelectedProduct(productsWithBarcode[0]);
    }
  }, [productsWithBarcode, selectedProduct]);

  const previewProduct = selectedProduct || SAMPLE_PREVIEW_PRODUCT;
  const previewPriceText =
    previewProduct.price > 0 ? `${previewProduct.price} جنية` : "";

  useEffect(() => {
    if (!previewRef.current) {
      return;
    }

    previewRef.current.innerHTML = buildBarcodeLabelHtml(
      {
        code: previewProduct.bar_code,
        productName: previewProduct.name,
        priceText: previewPriceText,
        barcodePrinterWidth,
        barcodePrinterHeight,
        barcodeSettings,
      },
      "preview",
    );
  }, [
    barcodePrinterHeight,
    barcodePrinterWidth,
    barcodeSettings,
    previewPriceText,
    previewProduct,
  ]);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 3,
        background:
          "linear-gradient(180deg, rgba(56, 142, 60, 0.05) 0%, rgba(56, 142, 60, 0.01) 100%)",
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          معاينة سريعة للباركود
        </Typography>
        <Typography variant="body2" color="text.secondary">
          اختر منتجا لرؤية شكل الملصق مباشرة أثناء تعديل الإعدادات.
        </Typography>
      </Box>

      <Autocomplete
        options={productsWithBarcode}
        value={
          productsWithBarcode.some(
            (product) => product.id === selectedProduct?.id,
          )
            ? selectedProduct
            : null
        }
        onChange={(_event, value) => setSelectedProduct(value)}
        getOptionLabel={(option) => `${option.name} - ${option.bar_code}`}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        loading={isLoading}
        renderInput={(params) => (
          <TextField
            {...params}
            label="منتج المعاينة"
            helperText="سيتم استخدام أول منتج يملك باركود تلقائيا إذا لم تختر منتجا"
          />
        )}
        sx={{ mb: 2 }}
      />

      {productsWithBarcode.length === 0 && !isLoading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          لا يوجد منتج محفوظ معه باركود حاليا، لذلك يتم عرض مثال تجريبي.
        </Alert>
      )}

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          mb: 2,
        }}
      >
        <Chip label={`الباركود: ${previewProduct.bar_code}`} size="small" />
        <Chip label={`السعر: ${previewPriceText || "بدون سعر"}`} size="small" />
        <Chip
          label={`المقاس: ${barcodePrinterWidth || "40"} × ${barcodePrinterHeight || "25"} مم`}
          size="small"
        />
      </Box>

      <Box
        sx={{
          minHeight: 260,
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
          bgcolor: "grey.50",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          p: 2,
        }}
      >
        <Box ref={previewRef} sx={{ lineHeight: 0 }} />
      </Box>
    </Paper>
  );
};

export default BarcodePreview;

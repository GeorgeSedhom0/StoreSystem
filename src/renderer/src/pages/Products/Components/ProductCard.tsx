import {
  Button,
  IconButton,
  InputAdornment,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
  Chip,
  Box,
} from "@mui/material";
import { CalendarMonth, Warning } from "@mui/icons-material";
import { Product } from "../../utils/types";
import { useMemo, useState } from "react";
import PrintBarCode from "@renderer/pages/Shared/PrintBarCode";
import { PackageChips } from "@renderer/pages/Shared/PackagesDialog";
import ProductMobileCard from "@renderer/pages/Shared/ProductMobileCard";
import useConfirm from "@renderer/pages/Shared/useConfirm";

interface ProductCardProps {
  product: Product;
  reserved: number;
  setEditedProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  editedProducts: Product[];
  deleteProduct: (productId: number) => void;
  restoreProduct: (productId: number) => void;
  isShowingDeleted: boolean;
  onOpenBatchModal: (product: Product) => void;
  earliestExpiration?: string | null;
  hasExpiringBatches?: boolean;
  onOpenPackages?: (product: Product) => void;
  isMobile?: boolean;
}

const ProductCard = ({
  product,
  reserved,
  setEditedProducts,
  editedProducts,
  deleteProduct,
  restoreProduct,
  isShowingDeleted,
  onOpenBatchModal,
  earliestExpiration,
  hasExpiringBatches,
  onOpenPackages,
  isMobile,
}: ProductCardProps) => {
  const [isPrintingCode, setIsPrintingCode] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const askDelete = async () => {
    const ok = await confirm({
      title: `إزالة «${product.name}»؟`,
      message:
        "سيختفي المنتج من البيع والبحث في هذا المتجر. يمكن استعادته لاحقاً من «عرض المنتجات المحذوفة».",
      confirmText: "إزالة",
      danger: true,
    });
    if (ok) deleteProduct(product.id!);
  };

  const productInCart = useMemo(
    () => editedProducts.find((p) => p.id === product.id),
    [editedProducts, product.id],
  );

  const productToMap = useMemo(
    () => (productInCart ? productInCart : product),
    [productInCart, product],
  );

  if (isMobile) {
    const setField = (field: string, value: string) =>
      setEditedProducts((prev) => {
        const v = field === "stock" ? parseInt(value) || 0 : value;
        const i = prev.findIndex((p) => p.id === product.id);
        if (i === -1) return [...prev, { ...product, [field]: v }];
        const next = [...prev];
        next[i] = { ...next[i], [field]: v };
        return next;
      });
    return (
      <>
        {confirmDialog}
        {confirmDialog}
        {isPrintingCode && (
          <PrintBarCode
            code={product.bar_code}
            name={product.name}
            price={product.price}
            setOpen={setIsPrintingCode}
          />
        )}
        <ProductMobileCard
          name={productToMap.name}
          barCode={productToMap.bar_code}
          category={productToMap.category}
          price={productToMap.price}
          wholesalePrice={productToMap.wholesale_price}
          stock={productToMap.stock}
          editStock
          reserved={reserved}
          packages={product.packages}
          changed={!!productInCart}
          onChange={setField}
          onOpenPackages={
            onOpenPackages ? () => onOpenPackages(product) : undefined
          }
          actions={
            <>
              <Tooltip title="الصلاحية">
                <IconButton
                  size="small"
                  color={hasExpiringBatches ? "warning" : "default"}
                  onClick={() => onOpenBatchModal(product)}
                >
                  <CalendarMonth />
                </IconButton>
              </Tooltip>
              <Button size="small" onClick={() => setIsPrintingCode(true)}>
                باركود
              </Button>
              {isShowingDeleted ? (
                <Button
                  size="small"
                  color="success"
                  onClick={() => restoreProduct(product.id!)}
                >
                  استعادة
                </Button>
              ) : (
                <Button size="small" color="error" onClick={askDelete}>
                  إزالة
                </Button>
              )}
            </>
          }
        />
      </>
    );
  }

  return (
    <TableRow key={`${product.id}-${product.bar_code}-${product.name}`}>
      {isPrintingCode && (
        <PrintBarCode
          code={product.bar_code}
          name={product.name}
          price={product.price}
          setOpen={setIsPrintingCode}
        />
      )}
      <TableCell>
        <TextField
          disabled={false}
          value={productToMap.name}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id,
              );
              if (changedProduct) {
                changedProduct.name = e.target.value;
              } else {
                newProducts.push({ ...product, name: e.target.value });
              }
              return newProducts;
            })
          }
        />
      </TableCell>

      <TableCell>
        <TextField
          disabled={false}
          value={productToMap.bar_code}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id,
              );
              if (changedProduct) {
                changedProduct.bar_code = e.target.value;
              } else {
                newProducts.push({ ...product, bar_code: e.target.value });
              }
              return newProducts;
            })
          }
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Button onClick={() => setIsPrintingCode(true)}>طباعة</Button>
                </InputAdornment>
              ),
            },
          }}
        />
      </TableCell>

      <TableCell>
        <TextField
          disabled={true}
          value={productToMap.price}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id,
              );
              if (changedProduct) {
                changedProduct.price = parseFloat(e.target.value) || 0;
              } else {
                newProducts.push({
                  ...product,
                  price: parseFloat(e.target.value) || 0,
                });
              }
              return newProducts;
            })
          }
        />
      </TableCell>

      <TableCell>
        <TextField
          disabled={true}
          value={productToMap.wholesale_price}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id,
              );
              if (changedProduct) {
                changedProduct.wholesale_price =
                  parseFloat(e.target.value) || 0;
              } else {
                newProducts.push({
                  ...product,
                  wholesale_price: parseFloat(e.target.value) || 0,
                });
              }
              return newProducts;
            })
          }
        />
      </TableCell>

      <TableCell>
        <TextField
          disabled={false}
          value={productToMap.stock}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id,
              );
              if (changedProduct) {
                changedProduct.stock = parseInt(e.target.value) || 0;
              } else {
                newProducts.push({
                  ...product,
                  stock: parseInt(e.target.value) || 0,
                });
              }
              return newProducts;
            })
          }
        />
      </TableCell>

      <TableCell>
        <TextField disabled={true} value={reserved} variant="standard" />
      </TableCell>

      <TableCell sx={{ minWidth: 120 }}>
        <PackageChips
          packages={product.packages}
          onClick={onOpenPackages ? () => onOpenPackages(product) : undefined}
          emptyLabel="إضافة"
        />
      </TableCell>

      <TableCell>
        <TextField
          disabled={false}
          value={productToMap.category}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id,
              );
              if (changedProduct) {
                changedProduct.category = e.target.value;
              } else {
                newProducts.push({ ...product, category: e.target.value });
              }
              return newProducts;
            })
          }
        />
      </TableCell>

      <TableCell>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Tooltip title="إدارة تواريخ الصلاحية">
            <IconButton
              size="small"
              color={hasExpiringBatches ? "warning" : "default"}
              onClick={() => onOpenBatchModal(product)}
            >
              <CalendarMonth />
              {hasExpiringBatches && (
                <Warning
                  sx={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    fontSize: 14,
                    color: "warning.main",
                  }}
                />
              )}
            </IconButton>
          </Tooltip>
          {earliestExpiration && (
            <Chip
              size="small"
              label={earliestExpiration}
              color={hasExpiringBatches ? "warning" : "default"}
              variant="outlined"
            />
          )}
        </Box>
      </TableCell>

      <TableCell>
        {isShowingDeleted ? (
          <Button
            variant="contained"
            color="success"
            onClick={() => restoreProduct(product.id!)}
          >
            استعادة المنتج
          </Button>
        ) : (
          <Button variant="contained" color="error" onClick={askDelete}>
            ازالة المنتج
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
};

export default ProductCard;

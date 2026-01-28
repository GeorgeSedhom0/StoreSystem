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
}: ProductCardProps) => {
  const [isPrintingCode, setIsPrintingCode] = useState(false);

  const productInCart = useMemo(
    () => editedProducts.find((p) => p.id === product.id),
    [editedProducts, product.id],
  );

  const productToMap = useMemo(
    () => (productInCart ? productInCart : product),
    [productInCart, product],
  );

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
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteProduct(product.id!)}
          >
            ازالة المنتج
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
};

export default ProductCard;

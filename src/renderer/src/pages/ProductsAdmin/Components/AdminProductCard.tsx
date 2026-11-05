import {
  Button,
  InputAdornment,
  TableCell,
  TableRow,
  TextField,
} from "@mui/material";
import { AdminProduct } from "../../utils/types";
import { useMemo, useState } from "react";
import PrintBarCode from "@renderer/pages/Shared/PrintBarCode";
import { PackageChips } from "@renderer/pages/Shared/PackagesDialog";
import ProductMobileCard from "@renderer/pages/Shared/ProductMobileCard";

interface ProductCardProps {
  product: AdminProduct;
  reserved: { [key: string | number]: number };
  setEditedProducts: React.Dispatch<React.SetStateAction<AdminProduct[]>>;
  editedProducts: AdminProduct[];
  onOpenPackages?: (product: AdminProduct) => void;
  isMobile?: boolean;
}

const AdminProductCard = ({
  product,
  reserved,
  setEditedProducts,
  editedProducts,
  onOpenPackages,
  isMobile,
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

  if (isMobile) {
    const setField = (field: string, value: string) =>
      setEditedProducts((prev) => {
        const i = prev.findIndex((p) => p.id === product.id);
        if (i === -1) return [...prev, { ...product, [field]: value }];
        const next = [...prev];
        next[i] = { ...next[i], [field]: value };
        return next;
      });
    return (
      <>
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
          stocks={Object.entries(product.stock_by_store).map(
            ([store, stock]) => ({
              store,
              stock,
              reserved: reserved ? (reserved[store] ?? 0) : 0,
            }),
          )}
          packages={product.packages}
          changed={!!productInCart}
          onChange={setField}
          onOpenPackages={
            onOpenPackages ? () => onOpenPackages(product) : undefined
          }
          actions={
            <Button size="small" onClick={() => setIsPrintingCode(true)}>
              باركود
            </Button>
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

      {Object.entries(product.stock_by_store).map(([store, stock]) => (
        <TableCell key={store}>
          <TextField disabled={true} value={stock} variant="standard" />
        </TableCell>
      ))}

      {Object.entries(product.stock_by_store).map(([store, _]) => (
        <TableCell key={`${store}-reserved`}>
          <TextField
            disabled={true}
            value={reserved ? (reserved[store] ?? 0) : 0}
            variant="standard"
          />
        </TableCell>
      ))}

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

      <TableCell sx={{ minWidth: 120 }}>
        <PackageChips
          packages={product.packages}
          onClick={onOpenPackages ? () => onOpenPackages(product) : undefined}
          emptyLabel="إضافة"
        />
      </TableCell>
    </TableRow>
  );
};

export default AdminProductCard;

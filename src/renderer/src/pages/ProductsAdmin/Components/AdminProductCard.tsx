import { Button, InputAdornment, TableCell, TextField } from "@mui/material";
import { AdminProduct } from "../../../utils/types";
import { useMemo, useState } from "react";
import PrintBarCode from "@renderer/pages/Shared/PrintBarCode";

interface ProductCardProps {
  product: AdminProduct;
  reserved: { [key: string | number]: number };
  setEditedProducts: React.Dispatch<React.SetStateAction<AdminProduct[]>>;
  editedProducts: AdminProduct[];
}

const AdminProductCard = ({
  product,
  reserved,
  setEditedProducts,
  editedProducts,
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
    <>
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
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Button onClick={() => setIsPrintingCode(true)}>طباعة</Button>
              </InputAdornment>
            ),
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

      {Object.values(product.stock_by_store).map((stock) => (
        <TableCell>
          <TextField disabled={true} value={stock} variant="standard" />
        </TableCell>
      ))}

      {Object.keys(product.stock_by_store).map((store) => (
        <TableCell>
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
    </>
  );
};

export default AdminProductCard;

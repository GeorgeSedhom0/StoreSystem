import { TableCell, TextField } from "@mui/material";
import { Product } from "../../../utils/types";
import { useMemo } from "react";

interface ProductCardProps {
  product: Product;
  setEditedProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  editedProducts: Product[];
  secretAgentActivated: boolean;
}

const ProductCard = ({
  product,
  setEditedProducts,
  editedProducts,
  secretAgentActivated,
}: ProductCardProps) => {
  const productInCart = useMemo(
    () => editedProducts.find((p) => p.id === product.id),
    [editedProducts, product.id]
  );

  const productToMap = useMemo(
    () => (productInCart ? productInCart : product),
    [productInCart, product]
  );

  return (
    <>
      <TableCell>
        <TextField
          disabled={!secretAgentActivated}
          value={productToMap.name}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id
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
          disabled={!secretAgentActivated}
          value={productToMap.bar_code}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id
              );
              if (changedProduct) {
                changedProduct.bar_code = e.target.value;
              } else {
                newProducts.push({ ...product, bar_code: e.target.value });
              }
              return newProducts;
            })
          }
        />
      </TableCell>

      <TableCell>
        <TextField
          disabled={!secretAgentActivated}
          value={productToMap.price}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id
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
          disabled={!secretAgentActivated}
          value={productToMap.wholesale_price}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id
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
          disabled={!secretAgentActivated}
          value={productToMap.stock}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id
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
        <TextField
          disabled={!secretAgentActivated}
          value={productToMap.category}
          variant="standard"
          onChange={(e) =>
            setEditedProducts((prev) => {
              const newProducts = [...prev];
              const changedProduct = newProducts.find(
                (p) => p.id === product.id
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

export default ProductCard;

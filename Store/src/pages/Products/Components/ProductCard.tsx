import { TableCell, TextField } from "@mui/material";
import { Product } from "../../../utils/types";
import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import { LoadingButton } from "@mui/lab";
import { AlertMsg } from "../../Shared/AlertMessage";

interface ProductCardProps {
  product: Product;
  setEditedProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  editedProducts: Product[];
  secretAgentActivated: boolean;
  setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>;
  getProds: () => Promise<void>;
}

const ProductCard = ({
  product,
  setEditedProducts,
  editedProducts,
  secretAgentActivated,
  setMsg,
  getProds,
}: ProductCardProps) => {
  const [loading, setLoading] = useState<boolean>(false);
  const productInCart = useMemo(
    () => editedProducts.find((p) => p.id === product.id),
    [editedProducts, product.id]
  );

  const productToMap = useMemo(
    () => (productInCart ? productInCart : product),
    [productInCart, product]
  );

  const saveProduct = useCallback(async () => {
    setLoading(true);
    try {
      const { data: _ } = await axios.put<Product>(
        `http://localhost:8000/product/${product.id}`,
        productToMap
      );
      await getProds();
      setEditedProducts((prev) => prev.filter((p) => p.id !== product.id));
      setMsg({ type: "success", text: "تم حفظ التعديلات" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ ما" });
    }
    setLoading(false);
  }, [product.id, productToMap, setEditedProducts]);

  return (
    <>
      <TableCell>
        <TextField
          disabled={false}
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
          disabled={false}
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

      <TableCell>
        <LoadingButton
          variant="contained"
          onClick={saveProduct}
          loading={loading}
          disabled={loading || !productInCart}
        >
          حفظ
        </LoadingButton>
      </TableCell>
    </>
  );
};

export default ProductCard;

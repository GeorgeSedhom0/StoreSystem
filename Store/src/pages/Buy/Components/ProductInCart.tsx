import { Button, TextField, TableRow, TableCell } from "@mui/material";
import { SCProduct } from "../../../utils/types";

const ProductInCart = ({
  product,
  setShoppingCart,
}: {
  product: SCProduct;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
}) => {
  return (
    <TableRow>
      <TableCell>{product.name}</TableCell>

      <TableCell>
        <TextField
          label="الكمية"
          type="number"
          value={product.quantity}
          variant="standard"
          onChange={(e) => {
            setShoppingCart((prev) =>
              prev.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: parseInt(e.target.value) || 0 }
                  : item
              )
            );
          }}
        />
      </TableCell>

      <TableCell>
        <TextField
          label="سعر الشراء"
          type="number"
          value={product.wholesale_price}
          variant="standard"
          onChange={(e) => {
            setShoppingCart((prev) =>
              prev.map((item) =>
                item.id === product.id
                  ? {
                      ...item,
                      wholesale_price: parseFloat(e.target.value) || 0,
                    }
                  : item
              )
            );
          }}
        />
      </TableCell>

      <TableCell>
        <TextField
          label="السعر"
          type="number"
          value={product.price}
          variant="standard"
          onChange={(e) => {
            setShoppingCart((prev) =>
              prev.map((item) =>
                item.id === product.id
                  ? { ...item, price: parseFloat(e.target.value) || 0 }
                  : item
              )
            );
          }}
        />
      </TableCell>

      <TableCell>{product.price * product.quantity}</TableCell>

      <TableCell>
        <Button
          variant="contained"
          color="error"
          onClick={() => {
            setShoppingCart((prev) =>
              prev.filter((item) => item.id !== product.id)
            );
          }}
        >
          حذف
        </Button>
      </TableCell>
    </TableRow>
  );
};

export default ProductInCart;

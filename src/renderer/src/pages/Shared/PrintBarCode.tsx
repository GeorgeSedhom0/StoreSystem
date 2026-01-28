import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { Dispatch, SetStateAction, useState } from "react";
import { printCode } from "../utils/functions";

interface PrintBarCodeProps {
  code: string;
  name: string;
  price?: number;
  initialQuantity?: number;
  setOpen: Dispatch<SetStateAction<boolean>>;
}
const PrintBarCode = ({
  code,
  name,
  price,
  initialQuantity,
  setOpen,
}: PrintBarCodeProps) => {
  const [quantity, setQuantity] = useState(initialQuantity || 1);

  // For clients (no price), show empty footer; for products, show price
  const footer =
    price !== undefined && price > 0 ? price.toString() + " " + "جنية " : "";

  return (
    <Dialog open={true}>
      <DialogTitle>طباعة الباركود</DialogTitle>
      <DialogContent>
        <TextField
          label="الكمية"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          sx={{
            my: 1,
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>إلغاء</Button>
        <Button
          onClick={() => {
            printCode(code, name, footer, quantity);
            setOpen(false);
          }}
        >
          طباعة
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PrintBarCode;

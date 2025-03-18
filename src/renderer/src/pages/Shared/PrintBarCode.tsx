import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { Dispatch, SetStateAction, useContext, useState } from "react";
import { printCode } from "./../../utils/functions";
import { StoreContext } from "@renderer/StoreDataProvider";

interface PrintBarCodeProps {
  code: string;
  name: string;
  price: number;
  setOpen: Dispatch<SetStateAction<boolean>>;
}
const PrintBarCode = ({ code, name, price, setOpen }: PrintBarCodeProps) => {
  const [quantity, setQuantity] = useState(1);
  const {store} = useContext(StoreContext)
  return (
    <Dialog open={true}>
      <DialogTitle>طباعة الباركود</DialogTitle>
      <DialogContent>
        <TextField
          label="الكمية"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>إلغاء</Button>
        <Button
          onClick={() => {
            printCode(
              code,
              `${store.name} \n ${name}`,
              price.toString() + " " + "جنية ",
              quantity,
            );
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

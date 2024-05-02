import { Button, ButtonGroup, TableCell } from "@mui/material";
import { Bill as BillType } from "../../../utils/types";
import { useRef, useState } from "react";
import BillView from "../../../utils/BillView";
import { printBill } from "../../../utils/functions";
import { AlertMsg } from "../../Shared/AlertMessage";

const Bill = ({
  bill,
  setMsg,
}: {
  bill: BillType;
  setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>;
}) => {
  const [billOpen, setBillOpen] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <BillView
        bill={bill}
        open={billOpen}
        setOpen={setBillOpen}
        ref={billRef}
      />
      <TableCell>
        فاتورة{" "}
        {bill.type === "sell"
          ? "بيع"
          : bill.type === "buy"
          ? "شراء"
          : bill.type === "return"
          ? "مرتجع"
          : bill.type === "BNPL"
          ? "بيع اجل"
          : ""}
      </TableCell>
      <TableCell>{new Date(bill.time).toLocaleString("ar-EG")}</TableCell>
      <TableCell>{Math.abs(bill.discount)}</TableCell>
      <TableCell>{Math.abs(bill.total)}</TableCell>
      <TableCell>
        <ButtonGroup variant="outlined">
          <Button onClick={() => setBillOpen(true)}>معاينة</Button>
          <Button
            onClick={() => {
              setBillOpen(true);
              setTimeout(() => {
                printBill(billRef, setMsg, setBillOpen);
              }, 1000);
            }}
          >
            طباعة
          </Button>
        </ButtonGroup>
      </TableCell>
    </>
  );
};

export default Bill;

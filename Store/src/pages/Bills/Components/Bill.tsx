import { Button, ButtonGroup, TableCell } from "@mui/material";
import { Bill as BillType } from "../../../utils/types";
import { useCallback, useRef, useState } from "react";
import BillView from "../../../utils/BillView";
import { printBill } from "../../../utils/functions";
import { AlertMsg } from "../../Shared/AlertMessage";
import EditableBill from "./EditableBill";

const Bill = ({
  bill,
  setMsg,
  printer,
  setPrinter,
  getBills,
}: {
  bill: BillType;
  setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>;
  printer: any;
  setPrinter: React.Dispatch<React.SetStateAction<any>>;
  getBills: () => void;
}) => {
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);

  const printWithPrinter = useCallback(async () => {
    setBillPreviewOpen(true);
    if (printer) {
      setTimeout(() => {
        printBill(billRef, setMsg, setBillPreviewOpen, printer);
      }, 500);
    } else {
      // request access to usb device, no filter listing all devices
      // @ts-ignore
      const usbDevice = await navigator.usb.requestDevice({
        filters: [
          {
            vendorId: 2727,
          },
        ],
      });
      // open the device
      await usbDevice.open();
      await usbDevice.selectConfiguration(1);
      await usbDevice.claimInterface(0);
      setPrinter(usbDevice);
      printBill(billRef, setMsg, setBillPreviewOpen, usbDevice);
    }
  }, [printer]);

  return (
    <>
      <BillView
        bill={bill}
        open={billPreviewOpen}
        setOpen={setBillPreviewOpen}
        ref={billRef}
      />
      {editing ? (
        <EditableBill bill={bill} setEditing={setEditing} getBills={getBills} />
      ) : null}
      <TableCell>{bill.id}</TableCell>
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
        <ButtonGroup
          variant="outlined"
          sx={{
            width: "100%",
          }}
        >
          <Button onClick={() => setEditing(true)}>تعديل</Button>
          <Button onClick={() => setBillPreviewOpen(true)}>معاينة</Button>
          <Button onClick={printWithPrinter}>طباعة</Button>
        </ButtonGroup>
      </TableCell>
      <TableCell>
        {bill.party_name ? bill.party_name : "بدون طرف ثانى"}
      </TableCell>
    </>
  );
};

export default Bill;

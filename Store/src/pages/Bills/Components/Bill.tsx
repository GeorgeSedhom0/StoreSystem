import { Button, ButtonGroup, TableCell, TableRow, Table, TableContainer, TableBody } from "@mui/material";
import { Bill as BillType } from "../../../utils/types";
import { useCallback, useContext, useRef, useState } from "react";
import BillView from "../../../utils/BillView";
import { printBill } from "../../../utils/functions";
import { AlertMsg } from "../../Shared/AlertMessage";
import EditableBill from "./EditableBill";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import ProductView from "../../../utils/ProductView";
import { SettingsContext } from "../../../SettingsDataProvider";

const endReservation = async (id: string) => {
  await axios.get(import.meta.env.VITE_SERVER_URL + "/end-reservation", {
    params: { bill_id: id },
  });
};

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
  const { settingsData } = useContext(SettingsContext);
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);

  const { mutate: endReservationMutation } = useMutation({
    mutationKey: ["endReservation"],
    mutationFn: endReservation,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم تسليم الحجز" });
      getBills();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ أثناء تسليم الحجز" });
    },
  });

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
    <TableCell colSpan={7} sx={{ borderBottom: "none", padding: 0 }}>
      <TableContainer>
        <Table>
          <TableBody>
            <TableRow>
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
                        : bill.type === "reserve"
                          ? "حجز"
                          : bill.type === "installment"
                            ? "قسط"
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
                  {bill.type === "reserve" && (
                    <Button onClick={() => endReservationMutation(bill.id)}>
                      تسليم
                    </Button>
                  )}
                </ButtonGroup>
              </TableCell>
              <TableCell>
                {bill.party_name ? bill.party_name : "بدون طرف ثانى"}
              </TableCell>
            </TableRow>
            {
              settingsData.showExpandedBills ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ padding: 0 }}>
                    <ProductView bill={bill} />
                  </TableCell>
                </TableRow>
              ) : <></>
            }
          </TableBody>
        </Table>
      </TableContainer>
    </TableCell>
  );
};

export default Bill;

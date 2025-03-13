import { Button, ButtonGroup, TableCell, TableRow } from "@mui/material";
import { useContext, useRef, useState } from "react";
import BillView from "../../../utils/BillView";
import { printBill } from "../../../utils/functions";
import EditableBill from "./EditableBill";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import ProductsView from "../../../utils/ProductsView";
import FormatedNumber from "../../Shared/FormatedNumber";
import { StoreContext } from "@renderer/StoreDataProvider";

const endReservation = async ({
  id,
  storeId,
}: {
  id: number;
  storeId: number;
}) => {
  await axios.get("/end-reservation", {
    params: { bill_id: id, store_id: storeId },
  });
};

const billTypes = {
  sell: "بيع",
  buy: "شراء",
  return: "مرتجع",
  BNPL: "بيع اجل",
  reserve: "حجز",
  installment: "قسط",
};

const Bill = ({ context, item: bill, ...props }: any) => {
  const { setMsg, getBills } = context;
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);
  const { storeId } = useContext(StoreContext);

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
      {!bill.isExpanded && (
        <TableRow {...props}>
          <TableCell>{bill.id}</TableCell>
          <TableCell>
            فاتورة {billTypes[bill.type as keyof typeof billTypes] || bill.type}
          </TableCell>
          <TableCell>{new Date(bill.time).toLocaleString("ar-EG")}</TableCell>
          <TableCell>
            <FormatedNumber>{Math.abs(bill.discount)}</FormatedNumber>
          </TableCell>
          <TableCell>
            <FormatedNumber>{Math.abs(bill.total)}</FormatedNumber>
          </TableCell>
          <TableCell>
            <ButtonGroup
              variant="outlined"
              sx={{
                width: "100%",
              }}
            >
              <Button onClick={() => setEditing(true)}>تعديل</Button>
              <Button onClick={() => setBillPreviewOpen(true)}>معاينة</Button>
              <Button
                onClick={() => printBill(billRef, setMsg, setBillPreviewOpen)}
              >
                طباعة
              </Button>
              {bill.type === "reserve" && (
                <Button
                  onClick={() =>
                    endReservationMutation({ id: bill.id, storeId })
                  }
                >
                  تسليم
                </Button>
              )}
            </ButtonGroup>
          </TableCell>
          <TableCell>
            {bill.party_name ? bill.party_name : "بدون طرف ثانى"}
          </TableCell>
        </TableRow>
      )}
      {bill.isExpanded && (
        <TableRow {...props}>{<ProductsView bill={bill} />}</TableRow>
      )}
    </>
  );
};

export default Bill;

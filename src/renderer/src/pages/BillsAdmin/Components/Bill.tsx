import {
  Button,
  ButtonGroup,
  TableCell,
  TableRow,
  Typography,
  Tooltip,
} from "@mui/material";
import { useContext, useRef, useState } from "react";
import BillView from "../../utils/BillView";
import { printBill } from "../../utils/functions";
import EditableBill from "./EditableBill";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import ProductsView from "../../utils/ProductsView";
import FormatedNumber from "../../Shared/FormatedNumber";
import BillCard from "../../Shared/BillCard";
import useConfirm from "../../Shared/useConfirm";
import { apiError } from "../../utils/errors";
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

const completeBnplPayment = async ({
  id,
  storeId,
}: {
  id: number;
  storeId: number;
}) => {
  await axios.get("/complete-bnpl-payment", {
    params: { bill_id: id, store_id: storeId },
  });
};

const billTypes = {
  sell: "بيع",
  buy: "شراء",
  return: "مرتجع",
  BNPL: "بيع آجل",
  reserve: "حجز",
  installment: "قسط",
  "buy-return": "مرتجع شراء",
};

const Bill = ({ context, item: bill, ...props }: any) => {
  const { setMsg, getBills, isMobile, expandAll } = context;
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);
  const { storeId } = useContext(StoreContext);
  const [confirm, confirmDialog] = useConfirm();

  const { mutate: endReservationMutation, isPending: isEnding } = useMutation({
    mutationKey: ["endReservation"],
    mutationFn: endReservation,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم تسليم الحجز" });
      getBills();
    },
    onError: (e) => {
      setMsg({ type: "error", text: apiError(e, "حدث خطأ أثناء تسليم الحجز") });
    },
  });

  const { mutate: completeBnplMutation, isPending: isCollecting } = useMutation(
    {
      mutationKey: ["completeBnplPayment"],
      mutationFn: completeBnplPayment,
      onSuccess: () => {
        setMsg({ type: "success", text: "تم استلام الدفع بنجاح" });
        getBills();
      },
      onError: (e) => {
        setMsg({
          type: "error",
          text: apiError(e, "حدث خطأ أثناء استلام الدفع"),
        });
      },
    },
  );

  const fmtTotal = Math.abs(bill.total).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  const deliverReservation = async () => {
    const ok = await confirm({
      title: `تسليم الحجز رقم ${bill.id}؟`,
      message: `ستتحول الفاتورة إلى فاتورة بيع ويُخصم المحجوز من المخزون${bill.party_name ? ` — العميل: ${bill.party_name}` : ""}.`,
      confirmText: "تسليم",
    });
    if (ok) endReservationMutation({ id: bill.id, storeId });
  };
  const collectBnpl = async () => {
    const ok = await confirm({
      title: `تحصيل الفاتورة الآجلة رقم ${bill.id}؟`,
      message: `سيتم تسجيل استلام كامل المبلغ (${fmtTotal})${bill.party_name ? ` من ${bill.party_name}` : ""}.`,
      confirmText: "تحصيل",
    });
    if (ok) completeBnplMutation({ id: bill.id, storeId });
  };
  if (isMobile) {
    // Phones: one card per bill (the "detailed" rows are folded into it).
    if (bill.isExpanded) return null;
    return (
      <>
        <BillView
          bill={bill}
          open={billPreviewOpen}
          setOpen={setBillPreviewOpen}
          ref={billRef}
        />
        {confirmDialog}
        {editing ? (
          <EditableBill
            bill={bill}
            setEditing={setEditing}
            getBills={getBills}
          />
        ) : null}
        <BillCard
          bill={bill}
          typeLabel={
            billTypes[bill.type as keyof typeof billTypes] || bill.type
          }
          defaultExpanded={!!expandAll}
          actions={
            <>
              <Button onClick={() => setBillPreviewOpen(true)}>معاينة</Button>
              <Button
                onClick={() => printBill(billRef, setMsg, setBillPreviewOpen)}
              >
                طباعة
              </Button>
              <Button onClick={() => setEditing(true)}>تعديل</Button>
              {bill.type === "reserve" && (
                <Button onClick={deliverReservation} disabled={isEnding}>
                  تسليم
                </Button>
              )}
              {bill.type === "BNPL" && (
                <Button onClick={collectBnpl} disabled={isCollecting}>
                  تحصيل
                </Button>
              )}
            </>
          }
        />
      </>
    );
  }

  return (
    <>
      <BillView
        bill={bill}
        open={billPreviewOpen}
        setOpen={setBillPreviewOpen}
        ref={billRef}
      />
      {confirmDialog}
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
            {bill.payments && bill.payments.length > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", lineHeight: 1.1 }}
              >
                {bill.payments.length === 1 ? (
                  bill.payments[0].name
                ) : (
                  <Tooltip
                    title={bill.payments
                      .map(
                        (p: { name: string; amount: number }) =>
                          `${p.name}: ${Math.abs(p.amount).toLocaleString()}`,
                      )
                      .join("، ")}
                  >
                    <span style={{ cursor: "help" }}>
                      متعدد ({bill.payments.length})
                    </span>
                  </Tooltip>
                )}
              </Typography>
            )}
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
                <Button onClick={deliverReservation} disabled={isEnding}>
                  تسليم
                </Button>
              )}
              {bill.type === "BNPL" && (
                <Button onClick={collectBnpl} disabled={isCollecting}>
                  تحصيل
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

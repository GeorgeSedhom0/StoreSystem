import { Button, ButtonGroup, Chip, TableCell, TableRow } from "@mui/material";
import { useRef, useState, useContext } from "react";
import BillCollectionView from "../../../utils/BillCollectionView";
import { printBill } from "../../../utils/functions";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import FormatedNumber from "../../Shared/FormatedNumber";
import { StoreContext } from "@renderer/StoreDataProvider";
import { Bill, CollectionBill } from "@renderer/utils/types";

const closeBills = async (partyId: number, storeId: number) => {
  const { data } = await axios.post("/parties/close-bills", null, {
    params: { party_id: partyId, store_id: storeId },
  });
  return data;
};

const getBillTypes = (bills: Bill[]) => {
  const types = new Set(bills.map((bill) => bill.type));
  return Array.from(types);
};

const billTypeLabels: Record<string, string> = {
  sell: "بيع",
  buy: "شراء",
  return: "مرتجع",
  BNPL: "بيع اجل",
  reserve: "حجز",
  installment: "قسط",
};

const CollectionBillComponent = ({
  context,
  item: collection,
  ...props
}: {
  context: any;
  item: CollectionBill;
}) => {
  const { setMsg, getBills } = context;
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);
  const { storeId } = useContext(StoreContext);

  const { mutate: closeBillsMutation } = useMutation({
    mutationKey: ["closeBills"],
    mutationFn: (partyId: number) => closeBills(partyId, storeId),
    onSuccess: () => {
      setMsg({ type: "success", text: "تم إغلاق الفواتير بنجاح" });
      getBills();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ أثناء إغلاق الفواتير" });
    },
  });

  // Get unique bill types in this collection
  const billTypes = getBillTypes(collection.bills);

  // Format bill types as comma-separated text
  const billTypesText = billTypes
    .map((type) => billTypeLabels[type] || type)
    .join(", ");

  return (
    <>
      <BillCollectionView
        collection={collection}
        open={billPreviewOpen}
        setOpen={setBillPreviewOpen}
        ref={billRef}
      />
      <TableRow {...props}>
        <TableCell>{collection.collection_id.substring(0, 8)}...</TableCell>
        <TableCell>{billTypesText}</TableCell>
        <TableCell>
          {new Date(collection.time).toLocaleString("ar-EG")}
        </TableCell>
        <TableCell>
          <FormatedNumber>{Math.abs(collection.total)}</FormatedNumber>
        </TableCell>
        <TableCell>
          <ButtonGroup
            variant="outlined"
            sx={{
              width: "100%",
            }}
          >
            <Button onClick={() => setBillPreviewOpen(true)}>معاينة</Button>
            <Button
              onClick={() => printBill(billRef, setMsg, setBillPreviewOpen)}
            >
              طباعة
            </Button>
            {collection.party_id && !collection.is_closed && (
              <Button
                onClick={() => closeBillsMutation(collection.party_id)}
                color="warning"
              >
                إغلاق
              </Button>
            )}
          </ButtonGroup>
        </TableCell>
        <TableCell>
          {collection.party_name ? collection.party_name : "بدون طرف ثانى"}
        </TableCell>
        <TableCell>
          {collection.is_closed ? (
            <Chip label="مغلقة" color="default" />
          ) : (
            <Chip label="مفتوحة" color="success" />
          )}
        </TableCell>
      </TableRow>
    </>
  );
};

export default CollectionBillComponent;

import {
  Box,
  Button,
  ButtonGroup,
  Card,
  Chip,
  Divider,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import { useRef, useState, useContext } from "react";
import BillCollectionView from "../../utils/BillCollectionView";
import { printBill } from "../../utils/functions";
import { Bill, CollectionBill } from "../../utils/types";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { StoreContext } from "@renderer/StoreDataProvider";
import useConfirm from "../../Shared/useConfirm";
import { apiError } from "../../utils/errors";

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
  BNPL: "بيع آجل",
  reserve: "حجز",
  installment: "تقسيط",
};

// Negatives in an LTR isolate so RTL text shows "-75.5", not "75.5-".
export const fmt = (n: number) =>
  Number.isFinite(n)
    ? n < 0
      ? `⁦${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}⁩`
      : n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

const NO_PARTY = "بدون طرف ثانٍ";

/** Preview / print / close for one collection — shared by the table row
 * (desktop) and the card (phone). */
const useCollectionActions = (collection: CollectionBill, context: any) => {
  const { setMsg, getBills } = context;
  const [billPreviewOpen, setBillPreviewOpen] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);
  const { storeId } = useContext(StoreContext);
  const [confirm, confirmDialog] = useConfirm();

  const { mutate: closeBillsMutation, isPending: isClosing } = useMutation({
    mutationKey: ["closeBills"],
    mutationFn: (partyId: number) => closeBills(partyId, storeId),
    onSuccess: () => {
      setMsg({ type: "success", text: "تم إغلاق الفواتير بنجاح" });
      getBills();
    },
    onError: (error) => {
      setMsg({
        type: "error",
        text: apiError(error, "حدث خطأ أثناء إغلاق الفواتير"),
      });
    },
  });

  const requestClose = async () => {
    const ok = await confirm({
      title: "إغلاق فواتير الطرف؟",
      message: `سيتم إغلاق كل الفواتير المفتوحة لـ ${
        collection.party_name || "هذا الطرف"
      } (وليس هذه المجموعة فقط) وبدء مجموعة جديدة لفواتيره القادمة.`,
      confirmText: "إغلاق",
      danger: true,
    });
    if (ok) closeBillsMutation(collection.party_id);
  };

  const canClose = !!collection.party_id && !collection.is_closed;

  const preview = (
    <>
      <BillCollectionView
        collection={collection}
        open={billPreviewOpen}
        setOpen={setBillPreviewOpen}
        ref={billRef}
      />
      {confirmDialog}
    </>
  );

  return {
    preview,
    canClose,
    isClosing,
    requestClose,
    openPreview: () => setBillPreviewOpen(true),
    print: () => printBill(billRef, setMsg, setBillPreviewOpen),
  };
};

const typesText = (collection: CollectionBill) =>
  getBillTypes(collection.bills)
    .map((type) => billTypeLabels[type] || type)
    .join("، ");

const StatusChip = ({ closed }: { closed: boolean }) =>
  closed ? (
    <Chip label="مغلقة" color="default" size="small" />
  ) : (
    <Chip label="مفتوحة" color="success" size="small" />
  );

const CollectionBillComponent = ({
  context,
  item: collection,
  ...props
}: {
  context?: any;
  item: CollectionBill;
}) => {
  const a = useCollectionActions(collection, context);

  return (
    <TableRow {...props}>
      <TableCell className="selectable">
        {collection.collection_id.substring(0, 8)}...
      </TableCell>
      <TableCell>{typesText(collection)}</TableCell>
      <TableCell>{new Date(collection.time).toLocaleString("ar-EG")}</TableCell>
      <TableCell sx={{ fontWeight: 600 }}>{fmt(collection.total)}</TableCell>
      <TableCell>
        <ButtonGroup
          variant="outlined"
          size="small"
          sx={{ width: "100%", flexWrap: "wrap" }}
        >
          <Button onClick={a.openPreview}>معاينة</Button>
          <Button onClick={a.print}>طباعة</Button>
          {a.canClose && (
            <Button
              onClick={a.requestClose}
              color="warning"
              disabled={a.isClosing}
            >
              إغلاق
            </Button>
          )}
        </ButtonGroup>
      </TableCell>
      <TableCell>{collection.party_name || NO_PARTY}</TableCell>
      <TableCell>
        <StatusChip closed={collection.is_closed} />
        {/* Rendered inside a cell so the preview never sits directly in <tbody>. */}
        {a.preview}
      </TableCell>
    </TableRow>
  );
};

/** A party's bill collection as a phone card. */
export const CollectionBillCard = ({
  context,
  collection,
}: {
  context: any;
  collection: CollectionBill;
}) => {
  const a = useCollectionActions(collection, context);

  return (
    <Card
      variant="outlined"
      sx={{ mb: 1.25, borderRadius: 3, overflow: "hidden" }}
    >
      {a.preview}
      <Box sx={{ p: 1.5, display: "flex", gap: 1.25 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {collection.party_name || NO_PARTY}
            </Typography>
            <StatusChip closed={collection.is_closed} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {typesText(collection)} · {collection.bills.length} فاتورة
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {new Date(collection.time).toLocaleString("ar-EG", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "left", flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
            {fmt(collection.total)}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            component="div"
            className="selectable"
            dir="ltr"
          >
            #{collection.collection_id.substring(0, 8)}
          </Typography>
        </Box>
      </Box>
      <Divider />
      <Box
        sx={{
          display: "flex",
          "& > button": { flex: 1, borderRadius: 0, minHeight: 44 },
          "& > button + button": {
            borderInlineStart: 1,
            borderColor: "divider",
          },
        }}
      >
        <Button onClick={a.openPreview}>معاينة</Button>
        <Button onClick={a.print}>طباعة</Button>
        {a.canClose && (
          <Button
            onClick={a.requestClose}
            color="warning"
            disabled={a.isClosing}
          >
            إغلاق
          </Button>
        )}
      </Box>
    </Card>
  );
};

export default CollectionBillComponent;

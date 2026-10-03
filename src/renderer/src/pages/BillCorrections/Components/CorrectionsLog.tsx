import {
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Fragment, useState } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import LoadingScreen from "../../Shared/LoadingScreen";
import { BillSnapshot, CorrectionLogEntry, CorrectionResult, billTypeLabels, egp } from "../types";
import ImpactView from "./ImpactView";

const actionLabels: Record<string, { label: string; color: "warning" | "error" | "info" }> = {
  edit: { label: "تصحيح", color: "warning" },
  delete: { label: "حذف", color: "error" },
  revert: { label: "تراجع", color: "info" },
};

const LinesTable = ({ bill }: { bill: BillSnapshot }) => (
  <Table size="small">
    <TableHead>
      <TableRow>
        <TableCell>المنتج</TableCell>
        <TableCell>الكمية</TableCell>
        <TableCell>التكلفة</TableCell>
        <TableCell>البيع</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {bill.lines.map((l, i) => (
        <TableRow key={i}>
          <TableCell>{l.name ?? `#${l.product_id}`}</TableCell>
          <TableCell>{l.quantity}</TableCell>
          <TableCell>{egp(l.wholesale_price)}</TableCell>
          <TableCell>{egp(l.price)}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const EntryDetails = ({ entry }: { entry: CorrectionLogEntry }) => (
  <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ p: 2 }}>
    {entry.before.bills.map((b) => {
      const after = entry.after?.bills.find((a) => a.store_id === b.store_id && a.bill_id === b.bill_id);
      return (
        <Box key={`${b.store_id}-${b.bill_id}`} sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            فاتورة #{b.bill_id} ({billTypeLabels[b.type] ?? b.type}، متجر {b.store_id})
          </Typography>
          <Typography variant="caption">قبل — الإجمالي {egp(Math.abs(b.total))}</Typography>
          <LinesTable bill={b} />
          <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
            بعد — {after ? `الإجمالي ${egp(Math.abs(after.total))}` : "محذوفة"}
          </Typography>
          {after && <LinesTable bill={after} />}
        </Box>
      );
    })}
  </Stack>
);

const CorrectionsLog = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [open, setOpen] = useState<number | null>(null);
  const [revertEntry, setRevertEntry] = useState<CorrectionLogEntry | null>(null);
  const [revertPreview, setRevertPreview] = useState<CorrectionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: log, isFetching, refetch } = useQuery({
    queryKey: ["bill-corrections", "log"],
    queryFn: async () => (await axios.get<CorrectionLogEntry[]>("/bill-corrections/log")).data,
    initialData: [],
  });

  const startRevert = async (entry: CorrectionLogEntry) => {
    setBusy(true);
    try {
      const { data } = await axios.post<CorrectionResult>(`/bill-corrections/log/${entry.id}/revert`, null, {
        params: { dry_run: true },
      });
      setRevertEntry(entry);
      setRevertPreview(data);
    } catch (e: any) {
      setMsg({ type: "error", text: e?.response?.data?.detail || "تعذرت معاينة التراجع" });
    } finally {
      setBusy(false);
    }
  };

  const confirmRevert = async () => {
    if (!revertEntry) return;
    setBusy(true);
    try {
      await axios.post(`/bill-corrections/log/${revertEntry.id}/revert`, null, { params: { dry_run: false } });
      setMsg({ type: "success", text: "تم التراجع عن التصحيح" });
      setRevertEntry(null);
      setRevertPreview(null);
      refetch();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.response?.data?.detail || "تعذر التراجع" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ position: "relative" }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={busy || isFetching} />
      {log.length === 0 ? (
        <Typography color="text.secondary">لا توجد تصحيحات بعد.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>#</TableCell>
              <TableCell>الوقت</TableCell>
              <TableCell>المستخدم</TableCell>
              <TableCell>الإجراء</TableCell>
              <TableCell>الفاتورة</TableCell>
              <TableCell>السبب</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {log.map((e) => (
              <Fragment key={e.id}>
                <TableRow>
                  <TableCell>
                    <IconButton size="small" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      {open === e.id ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{e.id}</TableCell>
                  <TableCell>{new Date(e.created_at).toLocaleString("ar-EG")}</TableCell>
                  <TableCell>{e.username}</TableCell>
                  <TableCell>
                    <Chip size="small" label={actionLabels[e.action]?.label ?? e.action} color={actionLabels[e.action]?.color} />
                    {e.reverted_by && <Chip size="small" label={`تم التراجع (#${e.reverted_by})`} sx={{ mx: 0.5 }} />}
                    {e.reverts_id && <Chip size="small" variant="outlined" label={`عن #${e.reverts_id}`} sx={{ mx: 0.5 }} />}
                  </TableCell>
                  <TableCell>
                    #{e.bill_id} ({e.store_name})
                    {e.pair_bill_id && ` ↔ #${e.pair_bill_id} (متجر ${e.pair_store_id})`}
                  </TableCell>
                  <TableCell>{e.note}</TableCell>
                  <TableCell>
                    {e.action === "edit" && !e.reverted_by && (
                      <Button size="small" onClick={() => startRevert(e)}>
                        تراجع
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={8} sx={{ p: 0, borderBottom: open === e.id ? undefined : "none" }}>
                    <Collapse in={open === e.id} unmountOnExit>
                      <EntryDetails entry={e} />
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={Boolean(revertEntry)} onClose={() => setRevertEntry(null)} maxWidth="md" fullWidth>
        <DialogTitle>التراجع عن التصحيح #{revertEntry?.id}</DialogTitle>
        <DialogContent>{revertPreview && <ImpactView result={revertPreview} />}</DialogContent>
        <DialogActions>
          <Button onClick={() => setRevertEntry(null)}>إلغاء</Button>
          <Button color="error" variant="contained" onClick={confirmRevert} disabled={busy}>
            تأكيد التراجع
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CorrectionsLog;

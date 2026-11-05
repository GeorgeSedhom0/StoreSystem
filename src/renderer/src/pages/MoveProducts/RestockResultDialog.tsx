import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiError } from "../utils/errors";
import { fmtQty, restockApi } from "../Restock/api";

export interface RestockOutcome {
  id: number;
  sent_now?: number;
  closed?: boolean;
  remaining_lines?: number;
  remaining?: { product_id: number; name: string; remaining: number }[];
  skipped?: boolean;
}

/** After a linked transfer: what's done, and for what's still missing an
 * explicit choice — keep the request open (fill later) or close it short. */
const RestockResultDialog = ({
  outcome,
  storeId,
  onClose,
  onError,
}: {
  outcome: RestockOutcome[] | null;
  storeId: number;
  onClose: () => void;
  onError: (text: string) => void;
}) => {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(""), [outcome]);

  const open =
    outcome?.filter((o) => !o.closed && (o.remaining_lines || 0) > 0) || [];
  const done =
    outcome?.filter((o) => o.closed || !(o.remaining_lines || 0)) || [];

  const closeShort = async () => {
    setBusy(true);
    try {
      for (const o of open)
        await restockApi.close(o.id, storeId, note || "غير متوفر حاليًا");
      queryClient.invalidateQueries({ queryKey: ["restock"] });
      onClose();
    } catch (e) {
      onError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!outcome} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>تم النقل</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {done.map((o) => (
            <Alert key={o.id} severity="success">
              الطلب #{o.id} اكتمل وأُغلق ✅
            </Alert>
          ))}
          {open.map((o) => (
            <Alert key={o.id} severity="warning">
              <Typography fontWeight={700}>
                الطلب #{o.id}: بقي {o.remaining_lines} صنف لم يُرسل
              </Typography>
              <Typography variant="body2">
                {(o.remaining || [])
                  .slice(0, 12)
                  .map((r) => `${r.name} (${fmtQty(r.remaining)})`)
                  .join("، ")}
                {(o.remaining || []).length > 12 ? "…" : ""}
              </Typography>
            </Alert>
          ))}
          {open.length > 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                أبقِ الطلب مفتوحًا لتكمله لاحقًا عند توفر البضاعة، أو أغلقه
                فيظهر الناقص للمتجر الطالب ليطلبه من جديد.
              </Typography>
              <TextField
                size="small"
                fullWidth
                label="سبب الإغلاق (عند الإغلاق)"
                placeholder="غير متوفر حاليًا"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: "wrap" }}>
        {open.length > 0 ? (
          <>
            <Button color="error" onClick={closeShort} disabled={busy}>
              إغلاق بالناقص
            </Button>
            <Button
              variant="contained"
              onClick={onClose}
              autoFocus
              disabled={busy}
            >
              إبقاء مفتوح
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={onClose} autoFocus>
            تم
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RestockResultDialog;

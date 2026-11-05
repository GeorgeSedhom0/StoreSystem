import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useContext, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "@renderer/StoreDataProvider";
import { AlertMsg } from "../../Shared/AlertMessage";
import { apiError } from "../../utils/errors";
import {
  RestockRequest,
  STATE_COLOR,
  STATE_LABEL,
  fmtQty,
  fmtWhen,
  moveProductsLink,
  qtyLabel,
  restockApi,
} from "../api";
import { canExportPdf, exportRestockPdf, printRestockReceipt } from "../print";

const closedByLabel = (r: RestockRequest) =>
  r.closed_side === "auto"
    ? "اكتمل تلقائيًا"
    : r.closed_side === "supplier"
      ? `أغلقه ${r.to_store_name}`
      : `أغلقه ${r.from_store_name}`;

const RequestDetail = ({
  requestId,
  onClose,
  onEdit,
  onCopy,
  canMove,
  setMsg,
}: {
  requestId: number | null;
  onClose: () => void;
  onEdit: (r: RestockRequest) => void;
  onCopy: (r: RestockRequest, what: "remaining" | "all") => void;
  canMove: boolean;
  setMsg: (m: AlertMsg) => void;
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { storeId, store } = useContext(StoreContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: r,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["restock", "detail", requestId, storeId],
    queryFn: () => restockApi.get(requestId as number, storeId),
    enabled: requestId != null,
  });

  const side = r?.side ?? "requester";
  const supplier = side === "supplier";

  // The supplier opening it is what "تم الاطلاع" means for the requester.
  const markedSeen = useRef<number | null>(null);
  useEffect(() => {
    if (r && supplier && !r.seen_at && markedSeen.current !== r.id) {
      markedSeen.current = r.id;
      restockApi
        .seen(r.id, storeId)
        .then(() => queryClient.invalidateQueries({ queryKey: ["restock"] }))
        .catch(() => undefined);
    }
  }, [r, supplier, storeId, queryClient]);

  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["restock"] });

  const doClose = async () => {
    if (!r) return;
    setBusy(true);
    try {
      await restockApi.close(r.id, storeId, closeNote);
      setMsg({
        type: "success",
        text: supplier ? "تم إغلاق الطلب" : "تم إلغاء الطلب",
      });
      setClosing(false);
      setCloseNote("");
      refresh();
    } catch (e) {
      setMsg({ type: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const doReopen = async () => {
    if (!r) return;
    setBusy(true);
    try {
      await restockApi.reopen(r.id, storeId);
      setMsg({ type: "success", text: "أُعيد فتح الطلب" });
      refresh();
    } catch (e) {
      setMsg({ type: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  const doPrint = async () => {
    if (!r) return;
    const err = await printRestockReceipt(r, side);
    if (err) setMsg({ type: "error", text: "حدث خطأ أثناء الطباعة" });
  };
  const doPdf = async () => {
    if (!r) return;
    try {
      await exportRestockPdf(r, side, store);
    } catch (e) {
      setMsg({ type: "error", text: apiError(e, "تعذر تصدير PDF") });
    }
  };

  const pct =
    r && r.totals.requested
      ? Math.min(100, (r.totals.sent / r.totals.requested) * 100)
      : 0;
  // Nothing sent yet: the requester cancels; otherwise either side closes.
  const closeLabel =
    supplier || (r?.totals.sent ?? 0) > 0 ? "إغلاق الطلب" : "إلغاء الطلب";
  const canReopen =
    !!r &&
    r.status === "closed" &&
    r.totals.lines_open > 0 &&
    !r.followup_request_id;
  const canCopyRemaining =
    !!r && !supplier && r.status === "closed" && r.totals.lines_open > 0;
  const shortLines = r?.lines.filter(
    (l) => supplier && l.remaining > 0 && (l.available ?? 0) < l.remaining,
  ).length;

  return (
    <Dialog
      open={requestId != null}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <span>طلب بضاعة #{requestId}</span>
            {r && (
              <Chip
                size="small"
                color={STATE_COLOR[r.state]}
                label={STATE_LABEL[r.state]}
              />
            )}
          </Stack>
          {r && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {r.from_store_name} ← {r.to_store_name} · {fmtWhen(r.created_at)}
              {r.created_by_name ? ` · ${r.created_by_name}` : ""}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="إغلاق">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && <LinearProgress />}
        {error && <Alert severity="error">{apiError(error)}</Alert>}
        {r && (
          <Stack spacing={2}>
            {r.note && (
              <Alert severity="info" icon={false}>
                <strong>ملاحظة: </strong>
                {r.note}
              </Alert>
            )}

            <Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ mb: 0.5 }}
              >
                <Typography variant="body2">
                  أُرسل {fmtQty(r.totals.sent)} من {fmtQty(r.totals.requested)}{" "}
                  قطعة
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {r.totals.lines - r.totals.lines_open} / {r.totals.lines} صنف
                  مكتمل
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={pct}
                color={
                  r.state === "short"
                    ? "error"
                    : pct >= 100
                      ? "success"
                      : "primary"
                }
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>

            {r.status === "closed" && (
              <Alert
                severity={
                  r.state === "done"
                    ? "success"
                    : r.state === "short"
                      ? "warning"
                      : "info"
                }
              >
                {closedByLabel(r)}
                {r.closed_at ? ` — ${fmtWhen(r.closed_at)}` : ""}
                {r.close_note ? ` — ${r.close_note}` : ""}
                {r.followup_request_id
                  ? ` · نُقل الناقص إلى الطلب #${r.followup_request_id}`
                  : r.followed_up_at && r.totals.lines_open > 0
                    ? " · تم تجاهل الناقص"
                    : ""}
              </Alert>
            )}

            {supplier && r.status === "open" && !!shortLines && (
              <Alert severity="warning">
                {shortLines} صنف المتاح منه هنا أقل من المطلوب
              </Alert>
            )}

            {isMobile ? (
              <Stack divider={<Divider />} sx={{ mx: -1 }}>
                {r.lines.map((l) => (
                  <Box key={l.id} sx={{ px: 1, py: 1 }}>
                    <Typography fontWeight={600}>{l.name}</Typography>
                    <Stack
                      direction="row"
                      gap={0.75}
                      flexWrap="wrap"
                      sx={{ mt: 0.5 }}
                    >
                      <Chip
                        size="small"
                        label={`المطلوب ${qtyLabel(l.quantity, l)}`}
                      />
                      {l.sent > 0 && (
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          label={`أُرسل ${fmtQty(l.sent)}`}
                        />
                      )}
                      {l.remaining > 0 && (
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label={`متبقي ${fmtQty(l.remaining)}`}
                        />
                      )}
                      {supplier && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={
                            (l.available ?? 0) < l.remaining
                              ? "error"
                              : "default"
                          }
                          label={`متاح هنا ${fmtQty(l.available ?? 0)}`}
                        />
                      )}
                      {!supplier && l.own_stock != null && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`عندك ${fmtQty(l.own_stock)}`}
                        />
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>المنتج</TableCell>
                    <TableCell align="center">المطلوب</TableCell>
                    <TableCell align="center">أُرسل</TableCell>
                    <TableCell align="center">المتبقي</TableCell>
                    <TableCell align="center">
                      {supplier ? "المتاح هنا" : "عندك"}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {r.lines.map((l) => (
                    <TableRow
                      key={l.id}
                      sx={{ opacity: l.remaining === 0 ? 0.6 : 1 }}
                    >
                      <TableCell>
                        {l.name}
                        {l.bar_code && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                          >
                            {l.bar_code}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {qtyLabel(l.quantity, l)}
                      </TableCell>
                      <TableCell align="center">{fmtQty(l.sent)}</TableCell>
                      <TableCell align="center">
                        {l.remaining > 0 ? (
                          <strong>{fmtQty(l.remaining)}</strong>
                        ) : (
                          "✓"
                        )}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          color:
                            supplier &&
                            l.remaining > 0 &&
                            (l.available ?? 0) < l.remaining
                              ? "error.main"
                              : undefined,
                        }}
                      >
                        {fmtQty((supplier ? l.available : l.own_stock) ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {!!r.transfers?.length && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  التحويلات المرتبطة
                </Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {r.transfers.map((t) => (
                    <Chip
                      key={`${t.store_id}-${t.bill_id}`}
                      icon={<LocalShippingIcon />}
                      variant="outlined"
                      label={`فاتورة #${t.bill_id} · ${fmtWhen(t.time || t.created_at)} · ${fmtQty(t.quantity)} قطعة`}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      {r && (
        <DialogActions
          sx={{
            flexWrap: "wrap",
            gap: 1,
            px: 2,
            py: 1.5,
            justifyContent: "flex-start",
          }}
        >
          {supplier && r.status === "open" && canMove && (
            <Button
              variant="contained"
              startIcon={<LocalShippingIcon />}
              onClick={() => navigate(moveProductsLink([r.id]))}
            >
              تجهيز في نقل المنتجات
            </Button>
          )}
          {!supplier && r.status === "open" && (
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              onClick={() => onEdit(r)}
            >
              تعديل
            </Button>
          )}
          {canCopyRemaining && (
            <Button
              variant="contained"
              color="secondary"
              startIcon={<ContentCopyIcon />}
              onClick={() => onCopy(r, "remaining")}
            >
              نسخ الناقص لطلب جديد
            </Button>
          )}
          {!supplier && (
            <Button
              startIcon={<ContentCopyIcon />}
              onClick={() => onCopy(r, "all")}
            >
              نسخ الكل
            </Button>
          )}
          <Button startIcon={<PrintIcon />} onClick={doPrint}>
            {supplier ? "طباعة للتجهيز" : "طباعة"}
          </Button>
          {canExportPdf() && (
            <Button startIcon={<PictureAsPdfIcon />} onClick={doPdf}>
              PDF
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          {r.status === "open" && (
            <Button
              color="error"
              startIcon={<LockIcon />}
              onClick={() => setClosing(true)}
              disabled={busy}
            >
              {closeLabel}
            </Button>
          )}
          {canReopen && (
            <Button
              startIcon={<LockOpenIcon />}
              onClick={doReopen}
              disabled={busy}
            >
              إعادة فتح
            </Button>
          )}
        </DialogActions>
      )}

      <Dialog
        open={closing}
        onClose={() => setClosing(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{closeLabel}</DialogTitle>
        <DialogContent>
          {r && r.totals.lines_open > 0 && (
            <Typography sx={{ mb: 2 }}>
              {supplier
                ? `لم يُرسل ${r.totals.lines_open} صنف. سيظهر الناقص لـ ${r.from_store_name} ليطلبه لاحقًا.`
                : r.totals.sent > 0
                  ? `أُرسل جزء من الطلب. سيُغلق بالباقي (${r.totals.lines_open} صنف).`
                  : "سيُلغى الطلب بالكامل."}
            </Typography>
          )}
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={supplier ? "السبب (مثال: غير متوفر)" : "السبب (اختياري)"}
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setClosing(false)}>رجوع</Button>
          <Button
            variant="contained"
            color="error"
            onClick={doClose}
            disabled={busy}
          >
            {supplier ? "إغلاق" : "إلغاء الطلب"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default RequestDetail;

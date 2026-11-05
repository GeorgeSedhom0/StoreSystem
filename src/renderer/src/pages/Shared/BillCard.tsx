import {
  Box,
  Card,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ReactNode, useEffect, useState } from "react";
import { Bill } from "../utils/types";
import { lineView } from "./packages";

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

const TYPE_COLORS: Record<
  string,
  "success" | "warning" | "error" | "info" | "secondary" | "default"
> = {
  sell: "success",
  buy: "info",
  return: "error",
  "buy-return": "warning",
  BNPL: "warning",
  reserve: "secondary",
  installment: "secondary",
};

/** A bill as a phone card: number, type, time, party, total and payment
 * methods up front; the lines fold out; actions sit along the bottom. */
const BillCard = ({
  bill,
  typeLabel,
  actions,
  defaultExpanded = false,
}: {
  bill: Bill;
  typeLabel: string;
  actions: ReactNode;
  defaultExpanded?: boolean;
}) => {
  const [open, setOpen] = useState(defaultExpanded);
  useEffect(() => setOpen(defaultExpanded), [defaultExpanded]);
  const isBuy = bill.type === "buy" || bill.type === "buy-return";
  const payments = bill.payments || [];

  return (
    <Card
      variant="outlined"
      sx={{ mb: 1.25, borderRadius: 3, overflow: "hidden" }}
    >
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{ p: 1.5, display: "flex", gap: 1.25, cursor: "pointer" }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography sx={{ fontWeight: 700 }} className="selectable">
              #{bill.id}
            </Typography>
            <Chip
              size="small"
              color={TYPE_COLORS[bill.type] || "default"}
              variant="outlined"
              label={typeLabel}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" noWrap>
            {new Date(bill.time).toLocaleString("ar-EG", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Typography>
          <Typography variant="body2" noWrap>
            {bill.party_name || "بدون طرف ثانٍ"}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "left", flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
            {fmt(Math.abs(bill.total))}
          </Typography>
          {bill.discount ? (
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
            >
              خصم {fmt(Math.abs(bill.discount))}
            </Typography>
          ) : null}
          {payments.length > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
            >
              {payments.length === 1
                ? payments[0].name
                : payments
                    .map((p) => `${p.name} ${fmt(Math.abs(p.amount))}`)
                    .join(" · ")}
            </Typography>
          )}
          <IconButton
            size="small"
            aria-label={open ? "إخفاء المنتجات" : "عرض المنتجات"}
            sx={{
              transform: open ? "rotate(180deg)" : "none",
              transition: "0.2s",
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>
      </Box>

      <Collapse in={open} unmountOnExit>
        <Divider />
        <Box sx={{ px: 1.5, py: 1 }}>
          {bill.products.map((l, i) => {
            const v = lineView(l);
            return (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  gap: 1,
                  py: 0.75,
                  borderBottom: i < bill.products.length - 1 ? 1 : 0,
                  borderColor: "divider",
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {v.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {v.qty} × {fmt(isBuy ? v.wholesale : v.price)}
                    {v.unitLabel ? ` · ${v.unitLabel}` : ""}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {fmt(isBuy ? v.wholesaleTotal : v.total)}
                </Typography>
              </Box>
            );
          })}
          {bill.note && bill.note.trim() && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1, whiteSpace: "pre-wrap" }}
            >
              ملاحظة: {bill.note}
            </Typography>
          )}
        </Box>
      </Collapse>

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
        {actions}
      </Box>
    </Card>
  );
};

export default BillCard;

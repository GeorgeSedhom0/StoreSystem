import { Box, Card, Chip, Grid2, TextField, Typography } from "@mui/material";
import { ReactNode } from "react";
import { ProductPackage } from "../utils/types";
import { PackageChips } from "./PackagesDialog";
import { stockBreakdown } from "./packages";

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

export type EditableProductField = "name" | "bar_code" | "category" | "stock";

/** A product row as a phone card (the Products / Products-admin tables). The
 * same fields stay editable; changes go through the page's edit buffer. */
const ProductMobileCard = ({
  name,
  barCode,
  category,
  price,
  wholesalePrice,
  stock,
  stocks,
  reserved,
  packages,
  changed,
  editStock,
  onChange,
  onOpenPackages,
  actions,
}: {
  name: string;
  barCode: string;
  category: string;
  price: number;
  wholesalePrice: number;
  /** Single-store stock (editable when editStock). */
  stock?: number;
  /** Per-store stock (admin, read-only). */
  stocks?: { store: string; stock: number; reserved: number }[];
  reserved?: number;
  packages?: ProductPackage[];
  changed?: boolean;
  editStock?: boolean;
  onChange: (field: EditableProductField, value: string) => void;
  onOpenPackages?: () => void;
  actions?: ReactNode;
}) => {
  const breakdown =
    stock !== undefined ? stockBreakdown(stock, packages) : null;
  return (
    <Card
      variant="outlined"
      sx={{
        p: 1.5,
        mb: 1.25,
        borderRadius: 3,
        borderColor: changed ? "warning.main" : "divider",
      }}
    >
      <Grid2 container spacing={1.25}>
        <Grid2 size={12}>
          <TextField
            fullWidth
            size="small"
            label="اسم المنتج"
            value={name}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </Grid2>
        <Grid2 size={7}>
          <TextField
            fullWidth
            size="small"
            label="الباركود"
            value={barCode}
            onChange={(e) => onChange("bar_code", e.target.value)}
          />
        </Grid2>
        <Grid2 size={5}>
          <TextField
            fullWidth
            size="small"
            label="المجموعة"
            value={category}
            onChange={(e) => onChange("category", e.target.value)}
          />
        </Grid2>
        <Grid2 size={12}>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Chip size="small" color="primary" label={`السعر ${fmt(price)}`} />
            <Chip
              size="small"
              variant="outlined"
              label={`الشراء ${fmt(wholesalePrice)}`}
            />
            {reserved ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`محجوز ${reserved}`}
              />
            ) : null}
            {changed && <Chip size="small" color="warning" label="معدّل" />}
          </Box>
        </Grid2>
        {stock !== undefined && (
          <Grid2
            size={12}
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <TextField
              size="small"
              label="الكمية"
              type="number"
              value={stock}
              disabled={!editStock}
              onChange={(e) => onChange("stock", e.target.value)}
              sx={{ width: 120 }}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
            />
            {breakdown && (
              <Typography variant="body2" color="text.secondary">
                = {breakdown}
              </Typography>
            )}
          </Grid2>
        )}
        {stocks && stocks.length > 0 && (
          <Grid2 size={12}>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
              {stocks.map((s) => (
                <Chip
                  key={s.store}
                  size="small"
                  variant="outlined"
                  label={`${s.store}: ${fmt(s.stock)}${s.reserved ? ` (محجوز ${s.reserved})` : ""}`}
                />
              ))}
            </Box>
          </Grid2>
        )}
        <Grid2
          size={12}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            العبوات:
          </Typography>
          <PackageChips
            packages={packages}
            onClick={onOpenPackages}
            emptyLabel="إضافة"
          />
          <Box sx={{ flex: 1 }} />
          {actions}
        </Grid2>
      </Grid2>
    </Card>
  );
};

export default ProductMobileCard;

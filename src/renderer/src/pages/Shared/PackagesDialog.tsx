import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid2,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PrintIcon from "@mui/icons-material/Print";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import axios from "axios";
import { useEffect, useState } from "react";
import { ProductPackage } from "../utils/types";
import PrintBarCode from "./PrintBarCode";
import { packageLabel, round2 } from "./packages";

const NAME_SUGGESTIONS = [
  "كرتونة",
  "علبة",
  "باكو",
  "شرينك",
  "دستة",
  "صندوق",
  "شوال",
];

interface Row {
  key: string;
  id?: number;
  name: string;
  units: number | "";
  price: number | "";
  bar_code: string;
}

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

/** Small inline summary of a product's packages: "كرتونة (10) · 95". */
export const PackageChips = ({
  packages,
  onClick,
  emptyLabel,
}: {
  packages?: ProductPackage[];
  onClick?: () => void;
  emptyLabel?: string;
}) => {
  const list = packages || [];
  if (!list.length) {
    return onClick ? (
      <Button
        size="small"
        startIcon={<Inventory2OutlinedIcon />}
        onClick={onClick}
      >
        {emptyLabel ?? "عبوات"}
      </Button>
    ) : (
      <Typography variant="body2" color="text.secondary">
        -
      </Typography>
    );
  }
  return (
    <Box
      sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}
    >
      {list.map((p) => (
        <Chip
          key={p.id}
          size="small"
          variant="outlined"
          color="secondary"
          label={`${packageLabel(p)} · ${fmt(p.price)}`}
          onClick={onClick}
        />
      ))}
    </Box>
  );
};

/** Add / edit / remove the packages of one product. */
const PackagesDialog = ({
  open,
  onClose,
  onSaved,
  product,
  readOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (packages: ProductPackage[]) => void;
  product: {
    id: number;
    name: string;
    price: number;
    wholesale_price: number;
    bar_code?: string;
  };
  readOnly?: boolean;
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState<Row | null>(null);
  const [keySeq, setKeySeq] = useState(0);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    axios
      .get<ProductPackage[]>(`/products/${product.id}/packages`)
      .then(({ data }) =>
        setRows(
          data.map((p) => ({
            key: `p${p.id}`,
            id: p.id,
            name: p.name,
            units: p.units,
            price: p.price,
            bar_code: p.bar_code || "",
          })),
        ),
      )
      .catch(() => setError("تعذر تحميل العبوات"))
      .finally(() => setLoading(false));
  }, [open, product.id]);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );

  const addRow = () => {
    const usedUnits = new Set(rows.map((r) => Number(r.units)));
    const units =
      [10, 12, 6, 20, 24, 5, 50].find((u) => !usedUnits.has(u)) ?? 2;
    const usedNames = new Set(rows.map((r) => r.name));
    const name = NAME_SUGGESTIONS.find((n) => !usedNames.has(n)) ?? "";
    setRows((prev) => [
      ...prev,
      {
        key: `n${keySeq}`,
        name,
        units,
        price: round2(product.price * units),
        bar_code: "",
      },
    ]);
    setKeySeq((k) => k + 1);
  };

  const generateBarcode = async (key: string) => {
    try {
      const { data } = await axios.get<string>("/barcode");
      // The server returns the first free code; skip ones already typed here.
      let code = Number(data);
      const taken = new Set(rows.map((r) => r.bar_code));
      while (taken.has(code.toString())) code += 1;
      update(key, { bar_code: code.toString() });
    } catch {
      setError("تعذر توليد باركود");
    }
  };

  const save = async () => {
    setError("");
    for (const r of rows) {
      if (!r.name.trim()) return setError("اكتب اسم كل عبوة");
      if (!r.units || Number(r.units) < 2)
        return setError(`«${r.name}»: عدد الوحدات يجب أن يكون 2 أو أكثر`);
      if (r.price === "" || Number(r.price) < 0)
        return setError(`«${r.name}»: اكتب السعر`);
    }
    setSaving(true);
    try {
      const { data } = await axios.put<ProductPackage[]>(
        `/products/${product.id}/packages`,
        {
          packages: rows.map((r) => ({
            id: r.id,
            name: r.name.trim(),
            units: Number(r.units),
            price: Number(r.price),
            bar_code: r.bar_code.trim() || null,
          })),
        },
      );
      onSaved?.(data);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "تعذر حفظ العبوات");
    }
    setSaving(false);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
    >
      <DialogTitle>
        عبوات «{product.name}»
        <Typography variant="body2" color="text.secondary">
          سعر الوحدة {fmt(product.price)} · تكلفة الوحدة{" "}
          {fmt(product.wholesale_price)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {printing && (
          <PrintBarCode
            code={printing.bar_code}
            name={`${product.name} - ${printing.name}`}
            price={Number(printing.price) || undefined}
            setOpen={(v) => {
              if (!v) setPrinting(null);
            }}
          />
        )}
        <Alert severity="info" sx={{ mb: 2 }}>
          العبوة مجموعة من وحدات المنتج بسعر خاص (مثلاً كرتونة = 10 علب).
          المخزون يُحسب دائماً بالوحدة، وبيع كرتونة يخصم 10 وحدات. يمكن أن يكون
          للعبوة باركود خاص بها.
        </Alert>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Typography color="text.secondary">جارٍ التحميل…</Typography>
        ) : (
          <Stack spacing={1.5}>
            {rows.length === 0 && (
              <Box sx={{ textAlign: "center", py: 3, color: "text.secondary" }}>
                <Inventory2OutlinedIcon sx={{ fontSize: 40, opacity: 0.5 }} />
                <Typography>لا توجد عبوات لهذا المنتج</Typography>
              </Box>
            )}
            {rows.map((r) => {
              const units = Number(r.units) || 0;
              const price = Number(r.price) || 0;
              const unitInPkg = units ? price / units : 0;
              const full = product.price * units;
              const saving = full - price;
              const cost = product.wholesale_price * units;
              return (
                <Card
                  key={r.key}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 2 }}
                >
                  <Grid2 container spacing={1.25} alignItems="center">
                    <Grid2 size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="اسم العبوة"
                        value={r.name}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(r.key, { name: e.target.value })
                        }
                      />
                    </Grid2>
                    <Grid2 size={{ xs: 6, sm: 2 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="عدد الوحدات"
                        value={r.units}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(r.key, {
                            units:
                              e.target.value === ""
                                ? ""
                                : parseInt(e.target.value) || 0,
                          })
                        }
                        slotProps={{
                          htmlInput: { inputMode: "numeric", min: 2 },
                        }}
                      />
                    </Grid2>
                    <Grid2 size={{ xs: 6, sm: 2 }}>
                      <TextField
                        fullWidth
                        size="small"
                        type="number"
                        label="سعر العبوة"
                        value={r.price}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(r.key, {
                            price:
                              e.target.value === ""
                                ? ""
                                : parseFloat(e.target.value) || 0,
                          })
                        }
                        slotProps={{
                          htmlInput: { inputMode: "decimal", min: 0 },
                        }}
                      />
                    </Grid2>
                    <Grid2 size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="باركود العبوة (اختياري)"
                        value={r.bar_code}
                        disabled={readOnly}
                        onChange={(e) =>
                          update(r.key, { bar_code: e.target.value })
                        }
                        slotProps={{
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">
                                {!readOnly && (
                                  <Tooltip title="توليد باركود">
                                    <IconButton
                                      size="small"
                                      onClick={() => generateBarcode(r.key)}
                                    >
                                      <AutoAwesomeIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                {r.bar_code && (
                                  <Tooltip title="طباعة الباركود">
                                    <IconButton
                                      size="small"
                                      onClick={() => setPrinting(r)}
                                    >
                                      <PrintIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </InputAdornment>
                            ),
                          },
                        }}
                      />
                    </Grid2>
                    {!readOnly && (
                      <Grid2
                        size={12}
                        sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}
                      >
                        {NAME_SUGGESTIONS.filter((n) => n !== r.name)
                          .slice(0, 5)
                          .map((n) => (
                            <Chip
                              key={n}
                              size="small"
                              label={n}
                              onClick={() => update(r.key, { name: n })}
                            />
                          ))}
                      </Grid2>
                    )}
                    <Grid2 size={12}>
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          flexWrap: "wrap",
                          alignItems: "center",
                          color: "text.secondary",
                          fontSize: 13,
                        }}
                      >
                        {units >= 2 && (
                          <>
                            <span>
                              سعر الوحدة داخل العبوة: {fmt(unitInPkg)}
                            </span>
                            <span>·</span>
                            {saving > 0.001 ? (
                              <Chip
                                size="small"
                                color="success"
                                variant="outlined"
                                label={`أرخص من ${units} وحدة بـ ${fmt(saving)} (${fmt((saving / full) * 100)}%)`}
                              />
                            ) : (
                              <Chip
                                size="small"
                                color="warning"
                                variant="outlined"
                                label="ليست أرخص من شراء الوحدات منفردة"
                              />
                            )}
                            {price < cost - 0.001 && (
                              <Chip
                                size="small"
                                color="error"
                                label={`أقل من التكلفة (${fmt(cost)})`}
                              />
                            )}
                          </>
                        )}
                        <Box sx={{ flex: 1 }} />
                        {!readOnly && (
                          <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={() =>
                              setRows((prev) =>
                                prev.filter((x) => x.key !== r.key),
                              )
                            }
                          >
                            حذف
                          </Button>
                        )}
                      </Box>
                    </Grid2>
                  </Grid2>
                </Card>
              );
            })}
            {!readOnly && (
              <Button
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={addRow}
                sx={{ alignSelf: "flex-start" }}
              >
                إضافة عبوة
              </Button>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose}>{readOnly ? "إغلاق" : "إلغاء"}</Button>
        {!readOnly && (
          <Button
            variant="contained"
            onClick={save}
            disabled={saving || loading}
          >
            حفظ العبوات
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default PackagesDialog;

import {
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  IconButton,
  MenuItem,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { SCProduct, BatchInfo } from "../utils/types";
import {
  Dispatch,
  SetStateAction,
  memo,
  useState,
  useEffect,
  useContext,
} from "react";
import PrintBarCode from "./PrintBarCode";
import NumberField from "./NumberField";
import ExpirationModal from "./ExpirationModal";
import BatchSelectionModal from "./BatchSelectionModal";
import axios from "axios";
import { StoreContext } from "@renderer/StoreDataProvider";
import {
  CartMode,
  PackagesPolicy,
  applyConversion,
  bestConversion,
  changeLineUnit,
  isPackageLine,
  lineUnits,
  packageLabel,
  printableLine,
  round2,
  sameLine,
  stockBreakdown,
} from "./packages";

export type CartType = "buy" | "sell" | "sell-admin" | "transfer";
type SetCart = React.Dispatch<React.SetStateAction<SCProduct[]>>;

const modeOf = (type: CartType): CartMode =>
  type === "buy" || type === "transfer" ? "buy" : "sell";

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

const updateLine = (
  setCart: SetCart,
  line: SCProduct,
  patch: Partial<SCProduct>,
) =>
  setCart((prev) =>
    prev.map((i) => (sameLine(i, line) ? { ...i, ...patch } : i)),
  );

const removeLine = (setCart: SetCart, line: SCProduct) =>
  setCart((prev) => prev.filter((i) => !sameLine(i, line)));

// ─── Unit switcher + "convert to package" suggestion ──────────────────────

/** "الوحدة" select for a product that has packages. Transfers move units only. */
export const UnitSwitcher = ({
  product,
  setShoppingCart,
  type,
}: {
  product: SCProduct;
  setShoppingCart: SetCart;
  type: CartType;
}) => {
  if (!product.packages?.length || type === "transfer") return null;
  return (
    <TextField
      select
      size="small"
      variant="standard"
      value={product.package_id ?? 0}
      onChange={(e) => {
        const id = Number(e.target.value);
        const pkg = product.packages?.find((p) => p.id === id) || null;
        setShoppingCart((prev) =>
          changeLineUnit(prev, product, pkg, modeOf(type)),
        );
      }}
      sx={{ minWidth: 96 }}
      slotProps={{ htmlInput: { "aria-label": "الوحدة" } }}
    >
      <MenuItem value={0}>وحدة</MenuItem>
      {product.packages.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {packageLabel(p)}
        </MenuItem>
      ))}
    </TextField>
  );
};

export const ConversionChip = ({
  product,
  setShoppingCart,
  type,
  policy,
}: {
  product: SCProduct;
  setShoppingCart: SetCart;
  type: CartType;
  policy?: PackagesPolicy;
}) => {
  if (policy !== "suggest" || modeOf(type) !== "sell") return null;
  const conv = bestConversion(product);
  if (!conv) return null;
  return (
    <Chip
      size="small"
      color="success"
      icon={<AutoAwesomeIcon />}
      label={`حوّل ${conv.count * conv.pkg.units} إلى ${conv.count} ${conv.pkg.name} — وفّر ${fmt(conv.saving)}`}
      onClick={() =>
        setShoppingCart((prev) => {
          const current = prev.find((i) => sameLine(i, product));
          return current ? applyConversion(prev, current, conv) : prev;
        })
      }
      sx={{
        maxWidth: "100%",
        "& .MuiChip-label": { whiteSpace: "normal" },
        height: "auto",
        py: 0.25,
      }}
    />
  );
};

/** "متاح 125 (12 كرتونة + 5)", red when the line needs more than the stock. */
export const StockInfo = ({ product }: { product: SCProduct }) => {
  const breakdown = stockBreakdown(product.stock, product.packages);
  const short = lineUnits(product) > product.stock;
  return (
    <Typography
      variant="body2"
      color={short ? "error" : "text.secondary"}
      component="span"
    >
      {fmt(product.stock)}
      {breakdown ? ` (${breakdown})` : ""}
    </Typography>
  );
};

// ─── Table columns (desktop) ──────────────────────────────────────────────

const CheckboxColumn = ({
  isSelected,
  onSelectionChange,
}: {
  isSelected: boolean;
  onSelectionChange: (selected: boolean) => void;
}) => (
  <TableCell padding="checkbox">
    <Checkbox
      checked={isSelected}
      onChange={(e) => onSelectionChange(e.target.checked)}
    />
  </TableCell>
);

const NameColumn = ({
  product,
  setShoppingCart,
  type,
  policy,
}: {
  product: SCProduct;
  setShoppingCart: SetCart;
  type: CartType;
  policy?: PackagesPolicy;
}) => (
  <TableCell sx={{ minWidth: 160 }}>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
      >
        <Typography component="span">{product.name}</Typography>
        <UnitSwitcher
          product={product}
          setShoppingCart={setShoppingCart}
          type={type}
        />
      </Box>
      <ConversionChip
        product={product}
        setShoppingCart={setShoppingCart}
        type={type}
        policy={policy}
      />
    </Box>
  </TableCell>
);

const QuantityColumn = ({
  setShoppingCart,
  product,
}: {
  setShoppingCart: SetCart;
  product: SCProduct;
}) => (
  <TableCell>
    <NumberField
      integer
      label={
        isPackageLine(product) ? `الكمية (${product.package_name})` : "الكمية"
      }
      value={product.quantity}
      variant="standard"
      onValueChange={(v) =>
        updateLine(setShoppingCart, product, { quantity: v })
      }
      slotProps={{ htmlInput: { inputMode: "numeric", min: 0 } }}
    />
  </TableCell>
);

const PriceColumn = ({
  setShoppingCart,
  product,
  type,
  disabled,
}: {
  setShoppingCart: SetCart;
  product: SCProduct;
  type: CartType;
  disabled?: boolean;
}) => {
  const pkg = isPackageLine(product);
  const label =
    pkg && modeOf(type) === "buy"
      ? "سعر بيع الوحدة"
      : pkg
        ? `سعر ${product.package_name}`
        : "السعر";
  return (
    <TableCell>
      <NumberField
        label={label}
        value={product.price}
        variant="standard"
        onValueChange={(v) =>
          updateLine(setShoppingCart, product, { price: v })
        }
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
        disabled={disabled}
      />
    </TableCell>
  );
};

const WholesalePriceColumn = ({
  setShoppingCart,
  product,
}: {
  setShoppingCart: SetCart;
  product: SCProduct;
}) => (
  <TableCell>
    <NumberField
      label={
        isPackageLine(product) ? `تكلفة ${product.package_name}` : "سعر الجملة"
      }
      value={product.wholesale_price}
      variant="standard"
      onValueChange={(v) =>
        updateLine(setShoppingCart, product, { wholesale_price: v })
      }
      helperText={
        isPackageLine(product)
          ? `للوحدة ${fmt(product.wholesale_price / (product.package_units as number))}`
          : undefined
      }
      slotProps={{ htmlInput: { inputMode: "decimal" } }}
    />
  </TableCell>
);

const WholesalePriceDisplayColumn = ({
  wholesalePrice,
}: {
  wholesalePrice: number;
}) => (
  <TableCell>
    <TextField
      label="سعر الشراء"
      type="number"
      value={wholesalePrice}
      variant="standard"
      disabled={true}
      slotProps={{ input: { readOnly: true } }}
    />
  </TableCell>
);

const lineTotal = (product: SCProduct, type: CartType) =>
  round2(
    (type === "buy" || type === "transfer"
      ? product.wholesale_price
      : product.price) * product.quantity,
  );

const TotalPriceColumn = ({
  product,
  type,
}: {
  product: SCProduct;
  type: CartType;
}) => <TableCell>{fmt(lineTotal(product, type))}</TableCell>;

const DeleteColumn = ({
  product,
  setShoppingCart,
}: {
  product: SCProduct;
  setShoppingCart: SetCart;
}) => (
  <TableCell>
    <Button
      variant="contained"
      color="error"
      onClick={() => removeLine(setShoppingCart, product)}
    >
      حذف
    </Button>
  </TableCell>
);

const StockColumn = ({ product }: { product: SCProduct }) => (
  <TableCell>
    <StockInfo product={product} />
  </TableCell>
);

const printTarget = (product: SCProduct) => {
  const l = printableLine(product);
  return { code: l.barCode || "", name: l.name, price: l.price };
};

const PrintBarCodeColumn = ({
  product,
  isPrintingCode,
  setIsPrintingCode,
}: {
  product: SCProduct;
  isPrintingCode: boolean;
  setIsPrintingCode: Dispatch<SetStateAction<boolean>>;
}) => {
  const t = printTarget(product);
  return (
    <TableCell>
      {isPrintingCode && (
        <PrintBarCode
          code={t.code}
          name={t.name}
          price={t.price}
          initialQuantity={product.quantity}
          setOpen={setIsPrintingCode}
        />
      )}
      <Button
        variant="contained"
        color="primary"
        onClick={() => setIsPrintingCode(true)}
      >
        طباعة باركود
      </Button>
    </TableCell>
  );
};

const ExpirationButton = ({
  product,
  setShoppingCart,
}: {
  product: SCProduct;
  setShoppingCart: SetCart;
}) => {
  const [open, setOpen] = useState(false);
  const hasBatches = product.batches && product.batches.length > 0;
  const hasExpDates = product.batches?.some((b) => b.expiration_date);
  return (
    <>
      {open && (
        <ExpirationModal
          open={open}
          onClose={() => setOpen(false)}
          product={
            isPackageLine(product)
              ? {
                  ...product,
                  name: `${product.name} (${product.package_name})`,
                }
              : product
          }
          onSave={(batches: BatchInfo[]) =>
            updateLine(setShoppingCart, product, {
              batches: batches.length > 0 ? batches : undefined,
            })
          }
        />
      )}
      <Tooltip
        title={
          hasExpDates ? "تم تحديد تواريخ الصلاحية" : "تحديد تواريخ الصلاحية"
        }
      >
        <Button
          variant={hasBatches ? "contained" : "outlined"}
          color={hasExpDates ? "success" : "primary"}
          onClick={() => setOpen(true)}
          size="small"
          startIcon={<CalendarMonthIcon />}
        >
          صلاحية
        </Button>
      </Tooltip>
    </>
  );
};

// Batch picker when selling. A package line is consumed earliest-expiry-first
// automatically (batch quantities are in units, the line in packages).
const ExpirationInfo = ({
  product,
  storeId,
  setShoppingCart,
}: {
  product: SCProduct;
  storeId: number | null;
  setShoppingCart: SetCart;
}) => {
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [displayInfo, setDisplayInfo] = useState<string>("-");
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [hasBatches, setHasBatches] = useState(false);
  const [loading, setLoading] = useState(true);
  const packageLine = isPackageLine(product);

  useEffect(() => {
    let active = true;
    const loadBatchInfo = async () => {
      if (!product.id || storeId === null || storeId === undefined) {
        setLoading(false);
        return;
      }
      try {
        const response = await axios.get(`/product/${product.id}/batches`, {
          params: { store_id: storeId },
        });
        if (!active) return;
        const batches = response.data.batches || [];
        const batchesWithQty = batches.filter(
          (b: { quantity: number }) => b.quantity > 0,
        );
        setHasBatches(batchesWithQty.length > 0);

        if (product.batches && product.batches.length > 0) {
          const hasExpiring = product.batches.some((b) => {
            if (!b.expiration_date) return false;
            const days = Math.ceil(
              (new Date(b.expiration_date).getTime() - Date.now()) / 86400000,
            );
            return days <= 14;
          });
          setIsExpiringSoon(hasExpiring);
          setDisplayInfo(`${product.batches.length} دفعة`);
        } else if (batchesWithQty.length > 0) {
          const sorted = batchesWithQty
            .filter(
              (b: { expiration_date: string | null }) => b.expiration_date,
            )
            .sort(
              (
                a: { expiration_date: string },
                b: { expiration_date: string },
              ) =>
                new Date(a.expiration_date).getTime() -
                new Date(b.expiration_date).getTime(),
            );
          if (sorted.length > 0) {
            const expDate = new Date(sorted[0].expiration_date);
            const days = Math.ceil((expDate.getTime() - Date.now()) / 86400000);
            setDisplayInfo(expDate.toLocaleDateString("en-GB"));
            setIsExpiringSoon(days <= 14);
          } else {
            setDisplayInfo("تلقائي");
          }
        }
      } catch (error) {
        console.error("Error loading batch info:", error);
      }
      if (active) setLoading(false);
    };
    loadBatchInfo();
    return () => {
      active = false;
    };
  }, [product.id, product.batches, storeId]);

  if (loading) return <>...</>;

  const canPick = hasBatches && !packageLine;
  const selected = !!product.batches && product.batches.length > 0;
  return (
    <>
      {isBatchModalOpen && (
        <BatchSelectionModal
          open={isBatchModalOpen}
          onClose={() => setIsBatchModalOpen(false)}
          product={product}
          onSave={(batches: BatchInfo[]) =>
            updateLine(setShoppingCart, product, {
              batches: batches.length > 0 ? batches : undefined,
            })
          }
        />
      )}
      <Tooltip
        title={
          packageLine && hasBatches
            ? "العبوات تُصرف تلقائياً من الأقرب انتهاءً"
            : hasBatches
              ? "انقر لاختيار الدفعات"
              : "لا توجد دفعات مسجلة"
        }
      >
        <Chip
          size="small"
          label={displayInfo}
          color={selected ? "success" : isExpiringSoon ? "warning" : "default"}
          variant={selected || isExpiringSoon ? "filled" : "outlined"}
          onClick={canPick ? () => setIsBatchModalOpen(true) : undefined}
          sx={{ cursor: canPick ? "pointer" : "default" }}
        />
      </Tooltip>
    </>
  );
};

type ColumnName =
  | "checkbox"
  | "name"
  | "quantity"
  | "price"
  | "wholesalePrice"
  | "wholesalePriceDisplay"
  | "totalPrice"
  | "delete"
  | "stock"
  | "printBarCode"
  | "expiration"
  | "expirationInfo";

const typeToColumns: Record<CartType, ColumnName[]> = {
  buy: [
    "checkbox",
    "name",
    "quantity",
    "wholesalePrice",
    "price",
    "totalPrice",
    "expiration",
    "delete",
    "printBarCode",
  ],
  sell: [
    "name",
    "quantity",
    "price",
    "totalPrice",
    "delete",
    "stock",
    "expirationInfo",
  ],
  "sell-admin": [
    "name",
    "quantity",
    "price",
    "totalPrice",
    "delete",
    "stock",
    "expirationInfo",
  ],
  transfer: [
    "name",
    "quantity",
    "wholesalePriceDisplay",
    "totalPrice",
    "delete",
    "stock",
    "expirationInfo",
  ],
};

const ProductInCart = ({
  product,
  setShoppingCart,
  type,
  isSelected,
  onSelectionChange,
  packagesPolicy,
}: {
  product: SCProduct;
  setShoppingCart: SetCart;
  type: CartType;
  isSelected?: boolean;
  onSelectionChange?: (selected: boolean) => void;
  packagesPolicy?: PackagesPolicy;
}) => {
  const [isPrintingCode, setIsPrintingCode] = useState(false);
  const { storeId } = useContext(StoreContext);

  const cell = (column: ColumnName, index: number) => {
    switch (column) {
      case "checkbox":
        return (
          <CheckboxColumn
            key={index}
            isSelected={isSelected || false}
            onSelectionChange={onSelectionChange || (() => {})}
          />
        );
      case "name":
        return (
          <NameColumn
            key={index}
            product={product}
            setShoppingCart={setShoppingCart}
            type={type}
            policy={packagesPolicy}
          />
        );
      case "quantity":
        return (
          <QuantityColumn
            key={index}
            setShoppingCart={setShoppingCart}
            product={product}
          />
        );
      case "price":
        return (
          <PriceColumn
            key={index}
            setShoppingCart={setShoppingCart}
            product={product}
            type={type}
            disabled={type === "sell"}
          />
        );
      case "wholesalePrice":
        return (
          <WholesalePriceColumn
            key={index}
            setShoppingCart={setShoppingCart}
            product={product}
          />
        );
      case "wholesalePriceDisplay":
        return (
          <WholesalePriceDisplayColumn
            key={index}
            wholesalePrice={product.wholesale_price}
          />
        );
      case "totalPrice":
        return <TotalPriceColumn key={index} product={product} type={type} />;
      case "delete":
        return (
          <DeleteColumn
            key={index}
            product={product}
            setShoppingCart={setShoppingCart}
          />
        );
      case "stock":
        return <StockColumn key={index} product={product} />;
      case "printBarCode":
        return (
          <PrintBarCodeColumn
            key={index}
            product={product}
            isPrintingCode={isPrintingCode}
            setIsPrintingCode={setIsPrintingCode}
          />
        );
      case "expiration":
        return (
          <TableCell key={index}>
            <ExpirationButton
              product={product}
              setShoppingCart={setShoppingCart}
            />
          </TableCell>
        );
      case "expirationInfo":
        return (
          <TableCell key={index}>
            <ExpirationInfo
              product={product}
              storeId={storeId}
              setShoppingCart={setShoppingCart}
            />
          </TableCell>
        );
      default:
        return null;
    }
  };

  return <TableRow>{typeToColumns[type].map(cell)}</TableRow>;
};

export default memo(ProductInCart);

// ─── Phone cart card ──────────────────────────────────────────────────────

/** Stacked card used instead of the wide table row on phones. */
export const CartLineCard = memo(
  ({
    product,
    setShoppingCart,
    type,
    packagesPolicy,
    isSelected,
    onSelectionChange,
  }: {
    product: SCProduct;
    setShoppingCart: SetCart;
    type: CartType;
    packagesPolicy?: PackagesPolicy;
    isSelected?: boolean;
    onSelectionChange?: (selected: boolean) => void;
  }) => {
    const { storeId } = useContext(StoreContext);
    const [isPrintingCode, setIsPrintingCode] = useState(false);
    const mode = modeOf(type);
    const setQty = (q: number) =>
      updateLine(setShoppingCart, product, { quantity: Math.max(0, q) });
    const canEditPrice = type === "sell-admin" || type === "buy";
    const t = printTarget(product);

    return (
      <Card variant="outlined" sx={{ p: 1.5, mb: 1.25, borderRadius: 2 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          {onSelectionChange && (
            <Checkbox
              checked={!!isSelected}
              onChange={(e) => onSelectionChange(e.target.checked)}
              sx={{ p: 0.5 }}
            />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, wordBreak: "break-word" }}>
              {product.name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
            >
              متاح: <StockInfo product={product} />
            </Typography>
          </Box>
          <IconButton
            color="error"
            onClick={() => removeLine(setShoppingCart, product)}
            aria-label="حذف"
          >
            <DeleteOutlineIcon />
          </IconButton>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            mt: 1,
            flexWrap: "wrap",
          }}
        >
          <IconButton
            onClick={() => setQty(product.quantity - 1)}
            aria-label="إنقاص"
            sx={{ border: 1, borderColor: "divider" }}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
          <NumberField
            integer
            size="small"
            value={product.quantity}
            onValueChange={setQty}
            sx={{ width: 72 }}
            slotProps={{
              htmlInput: {
                style: { textAlign: "center" },
                inputMode: "numeric",
                min: 0,
              },
            }}
          />
          <IconButton
            onClick={() => setQty(product.quantity + 1)}
            aria-label="زيادة"
            sx={{ border: 1, borderColor: "divider" }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
          <Box sx={{ mx: 0.5 }}>
            <UnitSwitcher
              product={product}
              setShoppingCart={setShoppingCart}
              type={type}
            />
          </Box>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontWeight: 700 }}>
            {fmt(lineTotal(product, type))}
          </Typography>
        </Box>

        {(canEditPrice || type === "transfer") && (
          <Box sx={{ display: "flex", gap: 1, mt: 1.25 }}>
            {mode === "buy" && (
              <NumberField
                fullWidth
                size="small"
                label={
                  isPackageLine(product)
                    ? `تكلفة ${product.package_name}`
                    : "سعر الشراء"
                }
                value={product.wholesale_price}
                disabled={type === "transfer"}
                onValueChange={(v) =>
                  updateLine(setShoppingCart, product, { wholesale_price: v })
                }
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
              />
            )}
            {type !== "transfer" && (
              <NumberField
                fullWidth
                size="small"
                label={
                  isPackageLine(product)
                    ? mode === "buy"
                      ? "سعر بيع الوحدة"
                      : `سعر ${product.package_name}`
                    : mode === "buy"
                      ? "سعر البيع"
                      : "السعر"
                }
                value={product.price}
                onValueChange={(v) =>
                  updateLine(setShoppingCart, product, { price: v })
                }
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
              />
            )}
          </Box>
        )}

        {type === "sell" && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            السعر: {fmt(product.price)}
            {isPackageLine(product) ? ` / ${product.package_name}` : ""}
          </Typography>
        )}

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 1,
            flexWrap: "wrap",
          }}
        >
          <ConversionChip
            product={product}
            setShoppingCart={setShoppingCart}
            type={type}
            policy={packagesPolicy}
          />
          {type === "buy" ? (
            <>
              <ExpirationButton
                product={product}
                setShoppingCart={setShoppingCart}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={() => setIsPrintingCode(true)}
              >
                باركود
              </Button>
              {isPrintingCode && (
                <PrintBarCode
                  code={t.code}
                  name={t.name}
                  price={t.price}
                  initialQuantity={product.quantity}
                  setOpen={setIsPrintingCode}
                />
              )}
            </>
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                الصلاحية:
              </Typography>
              <ExpirationInfo
                product={product}
                storeId={storeId}
                setShoppingCart={setShoppingCart}
              />
            </Box>
          )}
        </Box>
      </Card>
    );
  },
);

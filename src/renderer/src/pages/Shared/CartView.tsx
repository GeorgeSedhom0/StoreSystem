import {
  Box,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { forwardRef, ReactNode } from "react";
import { SCProduct } from "../utils/types";
import ProductInCart, { CartLineCard, CartType } from "./ProductInCart";
import { lineKey, PackagesPolicy } from "./packages";

const HEADERS: Record<CartType, string[]> = {
  buy: [
    "المنتج",
    "الكمية",
    "سعر الشراء",
    "السعر",
    "الإجمالي",
    "الصلاحية",
    "",
    "",
  ],
  sell: [
    "المنتج",
    "الكمية",
    "السعر",
    "الإجمالي",
    "حذف",
    "المتاح بالمخزن",
    "الصلاحية",
  ],
  "sell-admin": [
    "المنتج",
    "الكمية",
    "السعر",
    "الإجمالي",
    "حذف",
    "المتاح بالمخزن",
    "الصلاحية",
  ],
  transfer: [
    "المنتج",
    "الكمية",
    "سعر الشراء",
    "الإجمالي",
    "حذف",
    "المتاح بالمخزن",
    "الصلاحية",
  ],
};

/** The cart of a POS page: a table on desktop, stacked cards on phones. */
const CartView = forwardRef<
  HTMLDivElement,
  {
    cart: SCProduct[];
    setCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
    type: CartType;
    packagesPolicy?: PackagesPolicy;
    scrollSx?: object;
    /** Line selection (buy page bulk tools), keyed by lineKey. */
    selected?: Set<string>;
    onToggle?: (key: string, checked: boolean) => void;
    onToggleAll?: () => void;
    emptyHint?: ReactNode;
  }
>(
  (
    {
      cart,
      setCart,
      type,
      packagesPolicy,
      scrollSx,
      selected,
      onToggle,
      onToggleAll,
      emptyHint,
    },
    ref,
  ) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const selectable = !!selected && !!onToggle;
    const allSelected =
      selectable && cart.length > 0 && selected!.size === cart.length;
    const someSelected =
      selectable && selected!.size > 0 && selected!.size < cart.length;

    const empty = (
      <Box sx={{ py: 6, textAlign: "center", color: "text.secondary" }}>
        <ShoppingCartOutlinedIcon sx={{ fontSize: 44, opacity: 0.4 }} />
        <Typography sx={{ mt: 1 }}>السلة فارغة</Typography>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {emptyHint ?? "امسح باركود أو ابحث عن منتج لإضافته"}
        </Typography>
      </Box>
    );

    if (isMobile) {
      // Phones: no nested scroll area (the page scrolls) and the newest line
      // first, right under the search box where it was just added.
      return (
        <Box ref={ref} sx={{ p: 1.25 }}>
          {cart.length === 0
            ? empty
            : [...cart].reverse().map((product) => {
                const key = lineKey(product);
                return (
                  <CartLineCard
                    key={key}
                    product={product}
                    setShoppingCart={setCart}
                    type={type}
                    packagesPolicy={packagesPolicy}
                    isSelected={selected?.has(key)}
                    onSelectionChange={
                      selectable ? (c) => onToggle!(key, c) : undefined
                    }
                  />
                );
              })}
        </Box>
      );
    }

    return (
      <TableContainer
        ref={ref}
        sx={{ ...scrollSx, overflowY: "auto", overflowX: "auto" }}
      >
        <Table
          stickyHeader
          size="small"
          sx={{
            "& .MuiTableCell-head": {
              bgcolor: "background.paper",
              fontWeight: 600,
            },
          }}
        >
          <TableHead>
            <TableRow>
              {type === "buy" && (
                <TableCell padding="checkbox">
                  {selectable && (
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={onToggleAll}
                      disabled={cart.length === 0}
                    />
                  )}
                </TableCell>
              )}
              {HEADERS[type].map((h, i) => (
                <TableCell key={i}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {cart.map((product) => {
              const key = lineKey(product);
              return (
                <ProductInCart
                  key={key}
                  product={product}
                  setShoppingCart={setCart}
                  type={type}
                  packagesPolicy={packagesPolicy}
                  isSelected={selected?.has(key)}
                  onSelectionChange={
                    selectable ? (c) => onToggle!(key, c) : undefined
                  }
                />
              );
            })}
            {cart.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={HEADERS[type].length + (type === "buy" ? 1 : 0)}
                  sx={{ border: 0 }}
                >
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    );
  },
);

export default CartView;

import { memo, useDeferredValue, useMemo, useState } from "react";
import { Autocomplete, Box, Chip, TextField, Typography } from "@mui/material";
import { Product, ProductPackage } from "../utils/types";
import { packageLabel, stockBreakdown } from "./packages";

// Search is on name or barcode, ignoring Arabic letter variants (أ/إ/آ → ا,
// ة → ه, ى → ي) and diacritics, so "احمد" finds "أحمد".
export const normalizeArabic = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();

// Rendering thousands of options is what makes the dropdown slow on phones;
// nobody scrolls past the first matches anyway.
const MAX_OPTIONS = 100;

interface Option {
  product: Product;
  pkg: ProductPackage | null;
  key: string;
  haystack: string;
}

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

const ProductAutocomplete = ({
  onProductSelect,
  products,
  withPackages = false,
  label = "المنتج",
  autoFocus,
  size,
}: {
  onProductSelect: (
    product: Product | null,
    pkg?: ProductPackage | null,
  ) => void;
  products: Product[];
  /** List each product's packages as their own options. */
  withPackages?: boolean;
  label?: string;
  autoFocus?: boolean;
  size?: "small" | "medium";
}) => {
  const [query, setQuery] = useState<string>("");
  const deferredQuery = useDeferredValue(query);

  const allOptions = useMemo<Option[]>(() => {
    const out: Option[] = [];
    for (const product of products) {
      const base =
        normalizeArabic(product.name) +
        " " +
        (product.bar_code || "").toLowerCase();
      out.push({ product, pkg: null, key: `${product.id}:0`, haystack: base });
      if (withPackages) {
        for (const pkg of product.packages || []) {
          out.push({
            product,
            pkg,
            key: `${product.id}:${pkg.id}`,
            haystack:
              base +
              " " +
              normalizeArabic(pkg.name) +
              " " +
              (pkg.bar_code || "").toLowerCase(),
          });
        }
      }
    }
    return out;
  }, [products, withPackages]);

  const options = useMemo(() => {
    const q = normalizeArabic(deferredQuery);
    if (!q) return allOptions.filter((o) => !o.pkg).slice(0, 50);
    const words = q.split(/\s+/).filter(Boolean);
    const out: Option[] = [];
    for (const o of allOptions) {
      if (words.every((w) => o.haystack.includes(w))) {
        out.push(o);
        if (out.length >= MAX_OPTIONS) break;
      }
    }
    return out;
  }, [deferredQuery, allOptions]);

  return (
    <Autocomplete<Option, false, false, false>
      options={options}
      getOptionLabel={(o) =>
        o.pkg ? `${o.product.name} — ${packageLabel(o.pkg)}` : o.product.name
      }
      getOptionKey={(o) => o.key}
      isOptionEqualToValue={(a, b) => a.key === b.key}
      filterOptions={(x) => x}
      value={null}
      onChange={(_, o) => {
        if (o) onProductSelect(o.product, o.pkg);
        setQuery("");
      }}
      autoHighlight
      inputValue={query}
      onInputChange={(_, v, reason) => {
        if (reason !== "reset") setQuery(v);
      }}
      noOptionsText="لا توجد نتائج"
      size={size}
      renderOption={(props, o) => {
        const { key, ...rest } = props as typeof props & { key: string };
        const breakdown = !o.pkg
          ? stockBreakdown(o.product.stock, o.product.packages)
          : null;
        return (
          <Box
            component="li"
            key={key}
            {...rest}
            sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.75 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 500 }}>
                {o.product.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                component="div"
              >
                متاح {fmt(o.product.stock)}
                {breakdown ? ` (${breakdown})` : ""}
              </Typography>
            </Box>
            {o.pkg && (
              <Chip
                size="small"
                color="secondary"
                variant="outlined"
                label={packageLabel(o.pkg)}
              />
            )}
            <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              {fmt(o.pkg ? o.pkg.price : o.product.price)}
            </Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} autoFocus={autoFocus} />
      )}
    />
  );
};

export default memo(ProductAutocomplete);

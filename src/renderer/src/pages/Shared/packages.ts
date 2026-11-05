// ─── Product packages (عبوات) in carts and bills ────────────────────────────
//
// Stock and bill lines are always in a product's BASE unit. A package is a
// named multiple of it (a carton of 10) with its own price/barcode.
//
// In a cart, a package line keeps `quantity` in packages and its prices per
// package, so every existing total (price × quantity) works unchanged. The one
// conversion to base units happens on submit (cartLineToFlow). Bill lines from
// the API carry a snapshot (package_units/package_name) that lineView() turns
// back into "2 × كرتونة".
//
// Buy/transfer carts ("buy" mode): the cost column is per package, but `price`
// (the sell price the buy sets on the product) stays the UNIT price, so buying
// a carton never re-prices the single unit to the carton rate.

import { BillLine, Product, ProductPackage, SCProduct } from "../utils/types";

export type CartMode = "sell" | "buy";
/** What happens when a unit line reaches a package size. */
export type PackagesPolicy = "suggest" | "auto" | "off";

export const round2 = (x: number) =>
  Math.round((x + Number.EPSILON) * 100) / 100;

export const isPackageLine = (l: { package_units?: number | null }): boolean =>
  !!l.package_units && l.package_units > 1;

/** Identity of a cart line: the same product can be in the cart as units and
 * as one or more package sizes at the same time. */
export const lineKey = (l: { id: number; package_id?: number | null }) =>
  `${l.id}:${l.package_id ?? 0}`;

export const sameLine = (
  a: { id: number; package_id?: number | null },
  b: { id: number; package_id?: number | null },
) => a.id === b.id && (a.package_id ?? null) === (b.package_id ?? null);

const activePackages = (packages?: ProductPackage[] | null) =>
  (packages || []).filter((p) => p && p.units > 1);

/** A new cart line for a product, as units (pkg = null) or as a package. */
export const makeCartLine = (
  product: Product,
  pkg: ProductPackage | null,
  mode: CartMode,
  quantity = 1,
): SCProduct => {
  const base = {
    id: product.id as number,
    name: product.name,
    stock: product.stock,
    barCode: product.bar_code,
    quantity,
    packages: activePackages(product.packages),
    unit_price: product.price,
    unit_wholesale_price: product.wholesale_price,
  };
  if (!pkg) {
    return {
      ...base,
      price: product.price,
      wholesale_price: product.wholesale_price,
      package_id: null,
      package_units: null,
      package_name: null,
    };
  }
  return {
    ...base,
    price: mode === "sell" ? pkg.price : product.price,
    wholesale_price: round2(product.wholesale_price * pkg.units),
    package_id: pkg.id,
    package_units: pkg.units,
    package_name: pkg.name,
  };
};

/** Add one product (or package) to a cart: bump the matching line or append. */
export const addToCartLines = (
  prev: SCProduct[],
  product: Product,
  pkg: ProductPackage | null,
  mode: CartMode,
  quantity = 1,
): SCProduct[] => {
  if (!product.id) return prev;
  const probe = { id: product.id, package_id: pkg?.id ?? null };
  if (prev.some((i) => sameLine(i, probe))) {
    return prev.map((i) =>
      sameLine(i, probe) ? { ...i, quantity: i.quantity + quantity } : i,
    );
  }
  return [...prev, makeCartLine(product, pkg, mode, quantity)];
};

/** The cart line as the API wants it: quantity and prices in base units. */
export const cartLineToFlow = (item: SCProduct, mode: CartMode) => {
  if (!isPackageLine(item)) {
    return {
      id: item.id,
      quantity: item.quantity,
      price: item.price,
      wholesale_price: item.wholesale_price,
      batches: item.batches,
      batch_id: item.batch_id,
    };
  }
  const u = item.package_units as number;
  return {
    id: item.id,
    quantity: item.quantity * u,
    price: mode === "sell" ? item.price / u : item.price,
    // Sales can't edit the cost: use the exact catalogue unit cost.
    wholesale_price:
      mode === "sell" && item.unit_wholesale_price != null
        ? item.unit_wholesale_price
        : item.wholesale_price / u,
    batches: item.batches?.map((b) => ({ ...b, quantity: b.quantity * u })),
    package_id: item.package_id ?? null,
    package_units: u,
    package_name: item.package_name ?? null,
  };
};

/** Units the cart line takes out of stock. */
export const lineUnits = (item: SCProduct) =>
  item.quantity * (isPackageLine(item) ? (item.package_units as number) : 1);

/** "12 كرتونة + 5" for a stock count, using the largest package. */
export const stockBreakdown = (
  stock: number,
  packages?: ProductPackage[] | null,
): string | null => {
  const pk = activePackages(packages).sort((a, b) => b.units - a.units)[0];
  if (!pk || stock < pk.units) return null;
  const n = Math.floor(stock / pk.units);
  const r = stock % pk.units;
  return r ? `${n} ${pk.name} + ${r}` : `${n} ${pk.name}`;
};

/** Human label of a package: "كرتونة (10)". */
export const packageLabel = (p: {
  name?: string | null;
  units?: number | null;
}) => `${p.name || "عبوة"} (${p.units})`;

/** A suggested unit → package conversion for a line (sell carts only). Only
 * offered when it is cheaper for the customer and the line still has its
 * catalogue price (a cashier's manual price is never overridden). */
export interface Conversion {
  pkg: ProductPackage;
  count: number;
  remainder: number;
  saving: number;
}

export const bestConversion = (line: SCProduct): Conversion | null => {
  if (isPackageLine(line)) return null;
  const pkgs = activePackages(line.packages);
  if (!pkgs.length) return null;
  if (
    line.unit_price !== undefined &&
    Math.abs(line.price - line.unit_price) > 1e-9
  ) {
    return null;
  }
  const pkg = pkgs
    .filter((p) => p.units <= line.quantity && p.price > 0)
    .sort((a, b) => b.units - a.units)[0];
  if (!pkg) return null;
  const count = Math.floor(line.quantity / pkg.units);
  const remainder = line.quantity % pkg.units;
  const saving = round2(count * (pkg.units * line.price - pkg.price));
  if (saving <= 0.001) return null;
  return { pkg, count, remainder, saving };
};

/** Apply a conversion: the unit line keeps the remainder, the package line
 * gets the packages (merged into an existing line of that package). */
export const applyConversion = (
  prev: SCProduct[],
  line: SCProduct,
  conv: Conversion,
): SCProduct[] => {
  const pkgProbe = { id: line.id, package_id: conv.pkg.id };
  let next = prev
    .map((i) =>
      sameLine(i, line)
        ? // Batch picks were for the whole line; the remainder re-picks (FEFO).
          {
            ...i,
            quantity: conv.remainder,
            batches: undefined,
            batch_id: undefined,
          }
        : i,
    )
    .filter((i) => !(sameLine(i, line) && i.quantity <= 0));
  if (next.some((i) => sameLine(i, pkgProbe))) {
    next = next.map((i) =>
      sameLine(i, pkgProbe) ? { ...i, quantity: i.quantity + conv.count } : i,
    );
  } else {
    const pkgLine: SCProduct = {
      ...line,
      batches: undefined,
      batch_id: undefined,
      quantity: conv.count,
      price: conv.pkg.price,
      wholesale_price: round2(
        (line.unit_wholesale_price ?? line.wholesale_price) * conv.pkg.units,
      ),
      package_id: conv.pkg.id,
      package_units: conv.pkg.units,
      package_name: conv.pkg.name,
    };
    // Keep the package line right after the unit line (or where it was).
    const idx = next.findIndex((i) => sameLine(i, line));
    if (idx >= 0) next.splice(idx + 1, 0, pkgLine);
    else {
      const at = prev.findIndex((i) => sameLine(i, line));
      next.splice(Math.max(0, at), 0, pkgLine);
    }
  }
  return next;
};

/** Auto policy: convert every eligible unit line (sell carts). */
export const autoConvert = (cart: SCProduct[]): SCProduct[] => {
  let next = cart;
  for (const line of cart) {
    const conv = bestConversion(line);
    if (conv) {
      const current = next.find((i) => sameLine(i, line));
      if (current) next = applyConversion(next, current, conv);
    }
  }
  return next;
};

/** Switch a line between the base unit and a package, keeping the count. */
export const changeLineUnit = (
  prev: SCProduct[],
  line: SCProduct,
  pkg: ProductPackage | null,
  mode: CartMode,
): SCProduct[] => {
  if ((line.package_id ?? null) === (pkg?.id ?? null)) return prev;
  const oldUnits = isPackageLine(line) ? (line.package_units as number) : 1;
  const newUnits = pkg ? pkg.units : 1;
  const unitCost = line.wholesale_price / oldUnits;
  const unitPrice = line.unit_price ?? line.price / oldUnits;
  const updated: SCProduct = {
    ...line,
    batches: undefined,
    batch_id: undefined,
    price: mode === "sell" ? (pkg ? pkg.price : unitPrice) : line.price,
    wholesale_price:
      mode === "sell" && line.unit_wholesale_price != null
        ? round2(line.unit_wholesale_price * newUnits)
        : round2(unitCost * newUnits),
    package_id: pkg?.id ?? null,
    package_units: pkg?.units ?? null,
    package_name: pkg?.name ?? null,
  };
  const target = { id: line.id, package_id: pkg?.id ?? null };
  if (prev.some((i) => sameLine(i, target))) {
    return prev
      .map((i) =>
        sameLine(i, target)
          ? { ...i, quantity: i.quantity + line.quantity }
          : i,
      )
      .filter((i) => !sameLine(i, line));
  }
  return prev.map((i) => (sameLine(i, line) ? updated : i));
};

/** Re-attach live product data to a restored cart (package lines get the
 * current package price; vanished packages fall back to units). */
export const refreshCartLine = (
  saved: SCProduct,
  product: Product,
  mode: CartMode,
): SCProduct => {
  if (!isPackageLine(saved)) {
    return {
      ...makeCartLine(product, null, mode, saved.quantity),
      batches: saved.batches,
    };
  }
  const pkg = activePackages(product.packages).find(
    (p) => p.id === saved.package_id,
  );
  if (!pkg) {
    return makeCartLine(
      product,
      null,
      mode,
      saved.quantity * (saved.package_units as number),
    );
  }
  return {
    ...makeCartLine(product, pkg, mode, saved.quantity),
    batches: saved.batches,
  };
};

/** One bill line from the API, as the customer sees it. */
export interface LineView {
  name: string;
  /** "كرتونة (10)" for a package line, else null. */
  unitLabel: string | null;
  qty: number;
  price: number;
  wholesale: number;
  total: number;
  wholesaleTotal: number;
  isPackage: boolean;
}

export const lineView = (l: BillLine): LineView => {
  const units = Math.abs(l.amount);
  if (isPackageLine(l) && units % (l.package_units as number) === 0) {
    const u = l.package_units as number;
    return {
      name: l.name,
      unitLabel: packageLabel({ name: l.package_name, units: u }),
      qty: units / u,
      price: round2(l.price * u),
      wholesale: round2(l.wholesale_price * u),
      total: round2(l.price * units),
      wholesaleTotal: round2(l.wholesale_price * units),
      isPackage: true,
    };
  }
  return {
    name: l.name,
    unitLabel: null,
    qty: units,
    price: l.price,
    wholesale: l.wholesale_price,
    total: round2(l.price * units),
    wholesaleTotal: round2(l.wholesale_price * units),
    isPackage: false,
  };
};

/** Name + package for one-line displays: "مارلبورو — كرتونة (10)". */
export const lineTitle = (l: BillLine) => {
  const v = lineView(l);
  return v.unitLabel ? `${v.name} — ${v.unitLabel}` : v.name;
};

/** Barcode → product (+ package) lookup, built once per product list. */
export interface BarcodeHit {
  product: Product;
  pkg: ProductPackage | null;
}

export const buildBarcodeIndex = (products: Product[]) => {
  const map = new Map<string, BarcodeHit>();
  for (const product of products) {
    for (const pkg of activePackages(product.packages)) {
      if (pkg.bar_code) map.set(pkg.bar_code, { product, pkg });
    }
  }
  // Products win over packages (barcodes are unique server-side anyway).
  for (const product of products) {
    if (product.bar_code) map.set(product.bar_code, { product, pkg: null });
  }
  return map;
};

/** The line as a barcode label: a package line prints the package's own
 * barcode, name and price (falls back to the product's). */
export const printableLine = (line: SCProduct): SCProduct => {
  if (!isPackageLine(line)) return line;
  const pkg = (line.packages || []).find((p) => p.id === line.package_id);
  return {
    ...line,
    barCode: pkg?.bar_code || line.barCode,
    name: `${line.name} - ${line.package_name}`,
    price: pkg ? pkg.price : line.price,
  };
};

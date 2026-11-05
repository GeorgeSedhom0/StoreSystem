import axios from "axios";

// ─── Restock requests (طلبات البضاعة) — v27 ──────────────────────────────────
// Spec: docs/specs/v27-restock-requests.md
// Quantities are base units; a package is only a display snapshot.

export type RestockState =
  | "new"
  | "seen"
  | "partial"
  | "done"
  | "cancelled"
  | "short";

export interface RestockLine {
  id: number;
  product_id: number;
  name: string;
  bar_code: string | null;
  quantity: number;
  sent: number;
  remaining: number;
  package_id: number | null;
  package_units: number | null;
  package_name: string | null;
  /** Supplier view only: this store's stock. */
  available?: number;
  /** Requester view only: the requester's own stock. */
  own_stock?: number;
}

export interface RestockTransfer {
  bill_id: number;
  store_id: number;
  created_at: string;
  time: string | null;
  quantity: number;
  lines: number;
}

export interface RestockRequest {
  id: number;
  from_store_id: number;
  from_store_name: string;
  to_store_id: number;
  to_store_name: string;
  status: "open" | "closed";
  state: RestockState;
  note: string;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  seen_at: string | null;
  closed_at: string | null;
  closed_side: "requester" | "supplier" | "auto" | null;
  closed_by_name: string;
  close_note: string;
  followed_up_at: string | null;
  followup_request_id: number | null;
  totals: {
    lines: number;
    lines_open: number;
    requested: number;
    sent: number;
    remaining: number;
  };
  lines: RestockLine[];
  side?: "requester" | "supplier";
  transfers?: RestockTransfer[];
}

export interface PendingInfo {
  pending: { product_id: number; remaining: number; requests: number[] }[];
  followups: RestockRequest[];
  untouched: { id: number; to_store_id: number; to_store_name: string }[];
}

export interface PlanStore {
  store_id: number;
  store_name: string;
  remaining: number;
  requests: { id: number; remaining: number }[];
  stock: number;
  daily: number;
  allocation: number;
  cover_days: number | null;
}

export interface PlanProduct {
  product_id: number;
  name: string;
  bar_code: string | null;
  available: number;
  total_remaining: number;
  short: boolean;
  contested: boolean;
  method: "full" | "usage" | "proportional";
  stores: PlanStore[];
}

export interface SupplyPlan {
  usage_days: number;
  requests: number;
  products: PlanProduct[];
}

export interface LineInput {
  product_id: number;
  quantity: number; // base units
  package_id?: number | null;
}

export const STATE_LABEL: Record<RestockState, string> = {
  new: "جديد",
  seen: "تم الاطلاع",
  partial: "جزئي",
  done: "مكتمل",
  cancelled: "ملغي",
  short: "مغلق بنقص",
};

export const STATE_COLOR: Record<
  RestockState,
  "info" | "primary" | "warning" | "success" | "default" | "error"
> = {
  new: "info",
  seen: "primary",
  partial: "warning",
  done: "success",
  cancelled: "default",
  short: "error",
};

export const METHOD_LABEL: Record<PlanProduct["method"], string> = {
  full: "يكفي الجميع",
  usage: "حسب الاستهلاك",
  proportional: "بنسبة الطلب",
};

export const fmtQty = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

/** "3 كرتونة" when the quantity is whole packages, else "30". */
export const qtyLabel = (
  units: number,
  pkg?: { package_units?: number | null; package_name?: string | null },
) => {
  const u = pkg?.package_units || 0;
  if (u >= 2 && units > 0 && units % u === 0)
    return `${fmtQty(units / u)} ${pkg?.package_name || "عبوة"}`;
  return fmtQty(units);
};

export const fmtWhen = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `اليوم ${time}`;
  if (d.toDateString() === yest.toDateString()) return `أمس ${time}`;
  return `${d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })} ${time}`;
};

export const restockApi = {
  list: async (
    storeId: number,
    box: "mine" | "incoming",
    state: "open" | "closed" | "all" = "all",
  ) =>
    (
      await axios.get<RestockRequest[]>("/restock/requests", {
        params: { store_id: storeId, box, state },
      })
    ).data,
  get: async (id: number, storeId: number) =>
    (
      await axios.get<RestockRequest>(`/restock/requests/${id}`, {
        params: { store_id: storeId },
      })
    ).data,
  create: async (body: {
    store_id: number;
    to_store_id: number;
    note?: string;
    lines: LineInput[];
    carry_from?: number[];
    merge_into?: number | null;
  }) =>
    (
      await axios.post<{ request: RestockRequest; merged: boolean }>(
        "/restock/requests",
        body,
      )
    ).data,
  edit: async (
    id: number,
    body: {
      store_id: number;
      to_store_id?: number;
      note?: string;
      lines: LineInput[];
    },
  ) => (await axios.put<RestockRequest>(`/restock/requests/${id}`, body)).data,
  close: async (id: number, storeId: number, note?: string) =>
    (
      await axios.post<RestockRequest>(`/restock/requests/${id}/close`, {
        store_id: storeId,
        note,
      })
    ).data,
  reopen: async (id: number, storeId: number) =>
    (
      await axios.post<RestockRequest>(`/restock/requests/${id}/reopen`, {
        store_id: storeId,
      })
    ).data,
  seen: async (id: number, storeId: number) =>
    axios.post(`/restock/requests/${id}/seen`, null, {
      params: { store_id: storeId },
    }),
  dismiss: async (storeId: number, ids: number[]) =>
    axios.post("/restock/followups/dismiss", { store_id: storeId, ids }),
  pending: async (storeId: number) =>
    (
      await axios.get<PendingInfo>("/restock/pending", {
        params: { store_id: storeId },
      })
    ).data,
  usage: async (storeId: number) =>
    (
      await axios.get<{ days: number; rates: Record<string, number> }>(
        "/restock/usage",
        { params: { store_id: storeId } },
      )
    ).data,
  plan: async (storeId: number) =>
    (
      await axios.get<SupplyPlan>("/restock/plan", {
        params: { store_id: storeId },
      })
    ).data,
};

/** Shared "draft" key so «نسخ الناقص» from طلباتي lands in طلب جديد. */
export const draftKey = (storeId: number) => `restockDraft_${storeId}`;

export interface DraftLine {
  product_id: number;
  /** Base units. */
  units: number;
  /** Shown/entered in this package when set (units stay whole packages). */
  package_id: number | null;
}

export interface Draft {
  to_store_id: number | null;
  note: string;
  lines: DraftLine[];
  carry_from: number[];
}

export const emptyDraft = (): Draft => ({
  to_store_id: null,
  note: "",
  lines: [],
  carry_from: [],
});

export const loadDraft = (storeId: number): Draft => {
  try {
    const raw = localStorage.getItem(draftKey(storeId));
    if (!raw) return emptyDraft();
    const d = JSON.parse(raw);
    return {
      ...emptyDraft(),
      ...d,
      lines: Array.isArray(d.lines) ? d.lines : [],
      carry_from: Array.isArray(d.carry_from) ? d.carry_from : [],
    };
  } catch {
    return emptyDraft();
  }
};

export const saveDraft = (storeId: number, d: Draft) => {
  try {
    localStorage.setItem(draftKey(storeId), JSON.stringify(d));
  } catch {
    // storage full / blocked: the draft just isn't kept
  }
};

/** Add lines (base units) to a draft, merging per product. A package unit
 * is kept only while the merged amount is still whole packages. */
export const addToDraft = (
  d: Draft,
  lines: { product_id: number; units: number; package_id?: number | null }[],
  packUnits: (productId: number, packageId: number) => number,
): Draft => {
  const out = [...d.lines];
  for (const l of lines) {
    if (!(l.units > 0)) continue;
    let j = out.findIndex((x) => x.product_id === l.product_id);
    if (j < 0) {
      out.push({
        product_id: l.product_id,
        units: l.units,
        package_id: l.package_id ?? null,
      });
      j = out.length - 1;
    } else {
      out[j] = { ...out[j], units: out[j].units + l.units };
    }
    const pk = out[j].package_id;
    if (pk) {
      const u = packUnits(l.product_id, pk);
      if (!(u >= 2) || out[j].units % u !== 0)
        out[j] = { ...out[j], package_id: null };
    }
  }
  return { ...d, lines: out };
};

/** Where the "start a transfer from these requests" deep link points. */
export const moveProductsLink = (ids: number[]) =>
  `/admin/move-products?restock=${ids.join(",")}`;

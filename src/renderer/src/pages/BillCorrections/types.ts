import { PaymentLine } from "../utils/types";

export interface CorrectionLine {
  flow_id: number | null;
  product_id: number;
  name: string;
  quantity: number;
  wholesale_price: number;
  price: number;
}

export interface BillSnapshot {
  store_id: number;
  store_name?: string;
  bill_id: number;
  type: string;
  time: string;
  party_id: number | null;
  party_name: string | null;
  party_type?: string | null;
  discount: number;
  total: number;
  payments: PaymentLine[] | null;
  lines: CorrectionLine[];
}

export interface CorrectionHistoryItem {
  id: number;
  created_at: string;
  username: string | null;
  action: string;
  note: string | null;
  reverted_by: number | null;
}

export interface LegacyCandidate {
  id: number;
  store_id: number;
  type: string;
  time: string;
  total: number;
}

export interface CorrectionBillResponse {
  bill: BillSnapshot;
  pair: BillSnapshot | null;
  legacy_pair_candidates: LegacyCandidate[];
  correctable: boolean;
  reason: string | null;
  state_token: string;
  history: CorrectionHistoryItem[];
}

export interface BeforeAfter {
  before: number;
  after: number;
}

export interface CorrectionWarning {
  kind:
    | "legacy_transfer"
    | "cascade_skipped"
    | "negative_stock"
    | "price_unknown"
    | "total_mismatch"
    | "batches_untracked";
  text: string;
  bills: Record<string, unknown>[];
}

export interface CorrectionImpact {
  cash: (BeforeAfter & { store_id: number; store_name: string })[];
  accounts: (BeforeAfter & {
    store_id: number;
    store_name: string;
    method_id: number;
    method_name: string;
  })[];
  interstore: (BeforeAfter & {
    store_id: number;
    store_name: string;
    other_store_id: number;
    other_store_name: string;
  })[];
  stock: (BeforeAfter & {
    store_id: number;
    store_name: string;
    product_id: number;
    name: string;
  })[];
  satellites: (BeforeAfter & { store_id: number; kind: string })[];
  cascade: {
    done: {
      product_id: number;
      name?: string;
      old_cost: number;
      new_cost: number;
      until: string | null;
      rows: [number, number][];
    }[];
    skipped: {
      product_id: number;
      store_id: number;
      bill_id: number;
      type: string | null;
      transfer: boolean;
    }[];
    price_updates: {
      product_id: number;
      name?: string;
      old_cost: number;
      new_cost: number;
      old_price: number;
      new_price: number;
    }[];
    unknown?: { product_id: number }[];
  };
  warnings: CorrectionWarning[];
}

export interface CorrectionResult {
  correction_id: number | null;
  before: BillSnapshot[];
  after: BillSnapshot[];
  pair: { store_id: number; bill_id: number } | null;
  impact: CorrectionImpact;
  token: string;
}

export interface CorrectionLogEntry {
  id: number;
  created_at: string;
  username: string | null;
  action: "edit" | "delete" | "revert";
  store_id: number;
  store_name: string | null;
  bill_id: number;
  pair_store_id: number | null;
  pair_bill_id: number | null;
  note: string | null;
  reverts_id: number | null;
  reverted_by: number | null;
  before: { bills: BillSnapshot[] };
  after: { bills: BillSnapshot[] } | null;
}

export const billTypeLabels: Record<string, string> = {
  sell: "بيع",
  buy: "شراء",
  return: "مرتجع",
  "buy-return": "مرتجع شراء",
  BNPL: "بيع آجل",
  installment: "تقسيط",
  reserve: "حجز",
};

export const egp = (v: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(v || 0);

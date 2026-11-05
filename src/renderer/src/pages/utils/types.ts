/** A named multiple of a product's base unit (e.g. a carton of 10 packs). */
export interface ProductPackage {
  id: number;
  name: string;
  units: number;
  price: number;
  bar_code?: string | null;
}

export interface Product {
  id?: number;
  name: string;
  wholesale_price: number;
  price: number;
  category: string;
  stock: number;
  bar_code: string;
  packages?: ProductPackage[];
}

export interface DBProducts {
  products: Product[];
  reserved_products: { [key: number]: Product };
}

export interface AdminProduct {
  id: number;
  name: string;
  bar_code: string;
  wholesale_price: number;
  price: number;
  category: string;
  stock_by_store: {
    [key: string]: number;
  };
  packages?: ProductPackage[];
}

export interface DBAdminProducts {
  products: AdminProduct[];
  reserved_products: { [key: number]: { [key: string | number]: number } };
}

export interface BatchInfo {
  quantity: number;
  expiration_date: string | null;
  batch_id?: number;
}

/**
 * A cart line. A package line (package_units set) keeps quantity in packages
 * and price/wholesale_price per package, so every cart total (price ×
 * quantity) is unchanged; see Shared/packages.ts for the conversion to units.
 * In buy/transfer carts, `price` of a package line stays the UNIT sell price.
 */
export interface SCProduct {
  id: number;
  name: string;
  wholesale_price: number;
  price: number;
  quantity: number;
  stock: number;
  barCode?: string;
  batches?: BatchInfo[];
  batch_id?: number;
  package_id?: number | null;
  package_units?: number | null;
  package_name?: string | null;
  /** Packages available for this product (for the unit switcher). */
  packages?: ProductPackage[];
  /** The catalogue unit price/cost when the line was added. */
  unit_price?: number;
  unit_wholesale_price?: number;
}

/** A bill line as returned by the API (amount/prices in base units). */
export interface BillLine {
  id: number;
  name: string;
  price: number;
  wholesale_price: number;
  amount: number;
  bar_code: string;
  package_id?: number | null;
  package_units?: number | null;
  package_name?: string | null;
}

export interface PaymentMethod {
  id: number;
  name: string;
  is_default?: boolean;
  home_store_id?: number | null;
}

export interface PaymentLine {
  method_id: number | null;
  name?: string;
  amount: number;
}

export interface Account {
  id: number;
  name: string;
  is_default?: boolean;
  is_deleted?: boolean;
  balance: number;
}

export interface AccountTransaction {
  id: number;
  time: string;
  amount: number;
  source: string;
  balance_after: number;
  description: string | null;
  cash_flow_type: string | null;
  party_name: string | null;
}

export interface Bill {
  id: string;
  time: string;
  discount: number;
  total: number;
  type: string;
  note?: string | null;
  payments?: PaymentLine[] | null;
  party_id?: number | null;
  party_name: string | null;
  installment_details?: {
    id: number;
    paid: number;
    installments_count: number;
    installment_interval: number;
    total_paid: number;
    flow: {
      id: number;
      amount: number;
      time: string;
    }[];
  } | null;
  products: BillLine[];
  isExpanded?: boolean;
}

export interface CollectionBill {
  collection_id: string;
  time: string;
  total: number;
  party_id: number;
  party_name: string | null;
  bills: Bill[];
  isExpanded?: boolean;
  is_closed: boolean;
}

export interface CashFlow {
  time: string;
  amount: number;
  type: string;
  description: string;
  total: number;
  party_name: string | null;
  accounts?: { name: string; amount: number }[];
}

export interface Scope {
  id: number;
  name: string;
  pages: number[];
}

export interface Party {
  id: number | null;
  name: string;
  phone: string;
  address: string;
  type: string;
  extra_info: { [key: string]: string };
  bar_code?: string;
}

export interface Employee {
  id: number;
  name: string;
  phone: string;
  address: string;
  salary: number;
  started_on: string;
  stopped_on?: string;
}

export type SelectedEmployeeType =
  | (Employee & { purpose: "edit" | "del" | "pay" })
  | null;

export interface StoreData {
  id: number;
  name: string;
  address: string;
  phone: string;
}

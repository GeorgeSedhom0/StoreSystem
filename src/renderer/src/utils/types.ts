export interface Product {
  id?: number;
  name: string;
  wholesale_price: number;
  price: number;
  category: string;
  stock: number;
  bar_code: string;
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
}

export interface DBAdminProducts {
  products: AdminProduct[];
  reserved_products: { [key: number]: { [key: string | number]: number } };
}

export interface SCProduct {
  id: number;
  name: string;
  wholesale_price: number;
  price: number;
  quantity: number;
  stock: number;
  barCode?: string;
}

export interface Bill {
  id: string;
  time: string;
  discount: number;
  total: number;
  type: string;
  party_name: string | null;
  products: {
    id: number;
    name: string;
    price: number;
    wholesale_price: number;
    amount: number;
    bar_code: string;
  }[];
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

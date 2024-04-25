export interface Product {
  id?: number;
  name: string;
  wholesale_price: number;
  price: number;
  category: string;
  stock: number;
  bar_code: string;
}

export interface SCProduct {
  id: number;
  name: string;
  wholesale_price: number;
  price: number;
  quantity: number;
}

export interface Bill {
  id: string;
  time: string;
  discount: number;
  total: number;
  products: {
    id: number;
    name: string;
    price: number;
    wholesale_price: number;
    amount: number;
  }[];
}

export interface CashFlow {
  time: string;
  amount: number;
  type: string;
  description: string;
  total: number;
}

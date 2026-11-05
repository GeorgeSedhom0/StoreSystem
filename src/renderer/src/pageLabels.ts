// Display names by path (the stored page names have inconsistent spelling;
// they stay untouched in the DB and anywhere they're used as keys).
export const PAGE_LABELS: Record<string, string> = {
  "/sell": "بيع",
  "/admin/sell": "بيع (أدمن)",
  "/buy": "شراء",
  "/add-to-storage": "إضافة منتجات",
  "/admin/move-products": "نقل منتجات (أدمن)",
  "/bills": "الفواتير",
  "/parties-bills": "فواتير العملاء والموردين",
  "/admin/bills": "الفواتير (أدمن)",
  "/products": "المنتجات",
  "/admin/products": "المنتجات (أدمن)",
  "/cash": "الحركات المالية",
  "/analytics": "التقارير",
  "/settings": "الإعدادات",
  "/installments": "إدارة الأقساط",
  "/employees": "الموظفين",
  "/notifications": "الإشعارات",
  "/accounts": "الحسابات",
  "/bill-corrections": "تصحيح الفواتير",
  "/restock-requests": "طلبات البضاعة",
};

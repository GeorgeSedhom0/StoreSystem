/** Money as shown on the installments screens: "1,234.5 ج.م". */
export const fmtMoney = (n: number) => {
  const v = Number.isFinite(n) ? n : 0;
  const s = v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  // LTR isolate keeps the minus on the left inside RTL text.
  return `${v < 0 ? `⁦${s}⁩` : s} ج.م`;
};

import * as xlsx from "xlsx";

type Cell = string | number | boolean | null | undefined;

/** "مبيعات" → "مبيعات-2026-11-05.xlsx"; strips characters Windows rejects. */
export const excelFileName = (name: string, date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const safe = (name || "تصدير").replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `${safe}-${stamp}.xlsx`;
};

/**
 * Write rows to an .xlsx file. Numbers stay numbers (so Excel can sum/sort
 * them); pass strings only for text such as names and barcodes.
 *
 * @param name  Arabic base name for the file, e.g. "المنتجات" — the date is
 *              appended automatically.
 */
export const exportToExcel = (data: Cell[][], name = "تصدير"): void => {
  const rows = data.map((row) =>
    row.map((cell) =>
      typeof cell === "number" && !Number.isFinite(cell)
        ? null
        : (cell ?? null),
    ),
  );
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  // Right-to-left sheet, like the app.
  wb.Workbook = { Views: [{ RTL: true }] };
  // Reasonable column widths from the longest value in each column.
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cell == null ? 0 : String(cell).length;
      widths[i] = Math.min(Math.max(widths[i] ?? 8, len + 2), 50);
    });
  }
  ws["!cols"] = widths.map((wch) => ({ wch }));
  xlsx.utils.book_append_sheet(wb, ws, "البيانات");
  xlsx.writeFile(wb, excelFileName(name));
};

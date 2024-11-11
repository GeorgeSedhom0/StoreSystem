import * as xlsx from "xlsx";

export const exportToExcel = (data: any[][]): void => {
  console.log(data);
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
  xlsx.writeFile(wb, "export.xlsx");
};

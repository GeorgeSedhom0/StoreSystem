import printJS from "print-js";
import { StoreData } from "../utils/types";
import { buildRestockReportHtml, exportPdfDocument } from "../utils/a4Reports";
import { RestockRequest, STATE_LABEL, fmtQty, fmtWhen, qtyLabel } from "./api";

const esc = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Narrow (receipt printer) sheet: the request, or the supplier's pick list
 * with what to send now and a tick box. */
export const buildRestockReceiptHtml = (
  r: RestockRequest,
  side: "requester" | "supplier",
) => {
  const supplier = side === "supplier";
  const open = r.lines.filter((l) =>
    r.status === "open" ? l.remaining > 0 : true,
  );
  const rows = open
    .map(
      (l) => `
      <tr>
        <td style="padding:3px 2px;border-bottom:1px dashed #999;">
          <div style="font-weight:700;">${esc(l.name)}</div>
          ${l.bar_code ? `<div style="font-size:10px;direction:ltr;text-align:right;">${esc(l.bar_code)}</div>` : ""}
        </td>
        <td style="padding:3px 2px;border-bottom:1px dashed #999;text-align:center;white-space:nowrap;font-weight:700;">
          ${esc(qtyLabel(supplier ? l.remaining : l.quantity, l))}
          ${l.sent > 0 ? `<div style="font-size:10px;font-weight:400;">أُرسل ${esc(fmtQty(l.sent))}</div>` : ""}
        </td>
        ${
          supplier
            ? `<td style="padding:3px 2px;border-bottom:1px dashed #999;text-align:center;">${esc(
                fmtQty(l.available ?? 0),
              )}</td><td style="padding:3px 2px;border-bottom:1px dashed #999;width:18px;">☐</td>`
            : ""
        }
      </tr>`,
    )
    .join("");
  return `
  <div style="direction:rtl;font-family:Tahoma,Arial,sans-serif;width:100%;font-size:12px;color:#000;">
    <div style="text-align:center;font-weight:800;font-size:16px;">
      ${supplier ? "تجهيز " : ""}طلب بضاعة #${r.id}
    </div>
    <div style="text-align:center;margin:2px 0 6px;">
      ${esc(r.from_store_name)} ← ${esc(r.to_store_name)}
    </div>
    <div>التاريخ: ${esc(fmtWhen(r.created_at))}${r.created_by_name ? ` · ${esc(r.created_by_name)}` : ""}</div>
    <div>الحالة: ${esc(STATE_LABEL[r.state])}</div>
    ${r.note ? `<div style="margin-top:4px;border:1px solid #000;padding:3px;">ملاحظة: ${esc(r.note)}</div>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:6px;">
      <thead>
        <tr>
          <th style="text-align:right;border-bottom:1px solid #000;">الصنف</th>
          <th style="border-bottom:1px solid #000;">${supplier ? "المطلوب" : "الكمية"}</th>
          ${supplier ? `<th style="border-bottom:1px solid #000;">المتاح</th><th style="border-bottom:1px solid #000;"></th>` : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:6px;text-align:center;">${open.length} صنف</div>
  </div>`;
};

export const printRestockReceipt = async (
  r: RestockRequest,
  side: "requester" | "supplier",
): Promise<string | null> => {
  const html = buildRestockReceiptHtml(r, side);
  try {
    if (window?.electron?.ipcRenderer) {
      const res = await window.electron.ipcRenderer.invoke("print", {
        html,
        type: "bill",
      });
      return res?.success ? null : String(res?.error || "فشلت الطباعة");
    }
    printJS({ printable: html, type: "raw-html", targetStyles: ["*"] });
    return null;
  } catch (e) {
    return String(e);
  }
};

export const canExportPdf = () => !!window?.electron?.ipcRenderer;

export const exportRestockPdf = async (
  r: RestockRequest,
  side: "requester" | "supplier",
  store: Pick<StoreData, "name" | "address" | "phone">,
) =>
  exportPdfDocument({
    fileName: `طلب-بضاعة-${r.id}.pdf`,
    html: buildRestockReportHtml({
      store,
      side,
      request: {
        id: r.id,
        from_store_name: r.from_store_name,
        to_store_name: r.to_store_name,
        created_at: r.created_at,
        created_by_name: r.created_by_name,
        note: r.note,
        stateLabel: STATE_LABEL[r.state],
        lines: r.lines.map((l) => ({
          name: l.name,
          bar_code: l.bar_code,
          quantityLabel: qtyLabel(l.quantity, l),
          sent: l.sent,
          remaining: l.remaining,
          available: l.available,
        })),
      },
    }),
  });

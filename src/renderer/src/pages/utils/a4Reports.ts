import type { CashFlow, StoreData } from "./types";

export interface PdfExportPayload {
  fileName: string;
  html: string;
  landscape?: boolean;
}

export interface InstallmentReportItem {
  id: number;
  bill_id: number;
  paid: number;
  time: string;
  installments_count: number;
  installment_interval: number;
  party_name: string;
  flow: {
    id: number;
    amount: number;
    time: string;
  }[];
  total: number;
  products: {
    id: number;
    name: string;
    price: number;
    amount: number;
  }[];
  ended: boolean;
}

interface SummaryItem {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}

interface MetaItem {
  label: string;
  value: string;
}

interface ReportOptions {
  title: string;
  subtitle?: string;
  store: Pick<StoreData, "name" | "address" | "phone">;
  generatedAt?: string;
  meta?: MetaItem[];
  summary?: SummaryItem[];
  content: string;
}

const toneClassMap: Record<NonNullable<SummaryItem["tone"]>, string> = {
  default: "summary-default",
  success: "summary-success",
  warning: "summary-warning",
  danger: "summary-danger",
};

const reportStyles = `
  <style>
    @page {
      size: A4;
      margin: 12mm;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #eef1f4;
      color: #17202a;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      direction: rtl;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      padding: 0;
    }

    .report-shell {
      width: 100%;
      max-width: 186mm;
      margin: 0 auto;
      background: #ffffff;
      min-height: calc(297mm - 24mm);
      padding: 12mm;
    }

    .report-header {
      border-bottom: 2px solid #d9e2ec;
      padding-bottom: 8mm;
      margin-bottom: 8mm;
    }

    .report-title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8mm;
      margin-bottom: 5mm;
    }

    .report-brand h1 {
      font-size: 24px;
      margin: 0 0 3mm;
      color: #0f3d3e;
    }

    .report-brand p,
    .report-subtitle,
    .report-generated,
    .meta-item,
    .summary-label,
    .summary-value,
    .table-cell-muted,
    .section-note,
    .empty-state {
      margin: 0;
    }

    .report-brand p,
    .report-subtitle,
    .report-generated,
    .meta-item,
    .section-note,
    .table-cell-muted,
    .empty-state {
      color: #51606f;
      font-size: 12px;
      line-height: 1.7;
    }

    .report-chip {
      background: #e9f4ef;
      color: #0f5132;
      border: 1px solid #b9ddc7;
      border-radius: 999px;
      padding: 2mm 4mm;
      font-size: 11px;
      white-space: nowrap;
    }

    .meta-grid,
    .summary-grid,
    .two-column-grid {
      display: grid;
      gap: 4mm;
    }

    .meta-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-bottom: 6mm;
    }

    .summary-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 6mm;
    }

    .summary-card,
    .meta-card,
    .panel,
    .installment-card {
      border: 1px solid #d9e2ec;
      border-radius: 4mm;
      background: #ffffff;
    }

    .meta-card,
    .summary-card,
    .panel {
      padding: 4mm;
    }

    .summary-card {
      background: #f8fafc;
    }

    .summary-default {
      border-right: 4px solid #0f3d3e;
    }

    .summary-success {
      border-right: 4px solid #1f7a4f;
    }

    .summary-warning {
      border-right: 4px solid #b7791f;
    }

    .summary-danger {
      border-right: 4px solid #b42318;
    }

    .summary-label {
      color: #51606f;
      font-size: 11px;
      margin-bottom: 2mm;
    }

    .summary-value {
      color: #17202a;
      font-size: 17px;
      font-weight: 700;
    }

    .panel {
      margin-bottom: 6mm;
    }

    .panel h2,
    .installment-card h2,
    .panel h3,
    .installment-card h3 {
      margin: 0 0 3mm;
      color: #0f3d3e;
    }

    .panel h2,
    .installment-card h2 {
      font-size: 17px;
    }

    .panel h3,
    .installment-card h3 {
      font-size: 14px;
    }

    .section-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 4mm;
      margin-bottom: 4mm;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th,
    td {
      border: 1px solid #d9e2ec;
      padding: 3mm;
      text-align: right;
      vertical-align: top;
      font-size: 11px;
      word-break: break-word;
    }

    th {
      background: #0f3d3e;
      color: #ffffff;
      font-weight: 600;
    }

    tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .align-center {
      text-align: center;
    }

    .align-left {
      text-align: left;
    }

    .tag {
      display: inline-block;
      border-radius: 999px;
      padding: 1.5mm 3mm;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tag-success {
      background: #e8f5e9;
      color: #1f7a4f;
    }

    .tag-warning {
      background: #fff4e5;
      color: #b7791f;
    }

    .tag-danger {
      background: #fdecec;
      color: #b42318;
    }

    .tag-default {
      background: #edf2f7;
      color: #364152;
    }

    .installment-card {
      padding: 5mm;
      margin-bottom: 5mm;
      page-break-inside: avoid;
    }

    .installment-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 4mm;
      margin-bottom: 4mm;
    }

    .installment-subhead {
      color: #51606f;
      font-size: 11px;
      line-height: 1.8;
    }

    .two-column-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-bottom: 4mm;
    }

    .mini-stat {
      background: #f8fafc;
      border: 1px solid #d9e2ec;
      border-radius: 3mm;
      padding: 3mm;
    }

    .mini-stat .label {
      color: #51606f;
      font-size: 10px;
      margin-bottom: 1.5mm;
    }

    .mini-stat .value {
      color: #17202a;
      font-size: 14px;
      font-weight: 700;
    }

    @media print {
      html, body {
        background: #ffffff;
      }

      .report-shell {
        max-width: none;
        min-height: auto;
        padding: 0;
      }
    }
  </style>
`;

const escapeHtml = (value: string | number | null | undefined) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const formatCurrency = (value: number) => {
  return `${new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ج.م`;
};

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildMetaGrid = (meta: MetaItem[] = []) => {
  if (meta.length === 0) {
    return "";
  }

  return `
    <div class="meta-grid">
      ${meta
        .map(
          (item) => `
            <div class="meta-card">
              <div class="meta-item"><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
};

const buildSummaryGrid = (summary: SummaryItem[] = []) => {
  if (summary.length === 0) {
    return "";
  }

  return `
    <div class="summary-grid">
      ${summary
        .map(
          (item) => `
            <div class="summary-card ${toneClassMap[item.tone || "default"]}">
              <div class="summary-label">${escapeHtml(item.label)}</div>
              <div class="summary-value">${escapeHtml(item.value)}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
};

const buildReportDocument = ({
  title,
  subtitle,
  store,
  generatedAt,
  meta,
  summary,
  content,
}: ReportOptions) => {
  return `
    ${reportStyles}
    <div class="report-shell">
      <div class="report-header">
        <div class="report-title-row">
          <div class="report-brand">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(store.name)}</p>
            <p>${escapeHtml(store.phone || "")}</p>
            <p>${escapeHtml(store.address || "")}</p>
          </div>
          <div class="report-chip">${escapeHtml(generatedAt || formatDateTime(new Date()))}</div>
        </div>
        ${subtitle ? `<p class="report-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${buildMetaGrid(meta)}
      ${buildSummaryGrid(summary)}
      ${content}
    </div>
  `;
};

const getInstallmentStatusLabel = (status: string) => {
  switch (status) {
    case "active":
      return "نشط";
    case "overdue":
      return "متأخر";
    case "completed":
      return "مكتمل";
    case "unknown":
      return "غير معروف";
    default:
      return status;
  }
};

const getCashFlowTypeLabel = (type: string) => {
  return type === "in" ? "دخول" : type === "out" ? "خروج" : "غير محدد";
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return { label: "مكتمل", className: "tag-success" };
    case "overdue":
      return { label: "متأخر", className: "tag-danger" };
    case "active":
      return { label: "نشط", className: "tag-warning" };
    default:
      return { label: "غير معروف", className: "tag-default" };
  }
};

export const exportPdfDocument = async ({
  fileName,
  html,
  landscape,
}: PdfExportPayload) => {
  if (!window?.electron?.ipcRenderer) {
    throw new Error("PDF export is only available in the desktop application");
  }

  return window.electron.ipcRenderer.invoke("export-pdf", {
    fileName,
    html,
    landscape,
  });
};

export const buildCashFlowReportHtml = ({
  store,
  rows,
  startDate,
  endDate,
  totalIn,
  totalOut,
  netFlow,
  showGlobalTotal,
  searchTerm,
  selectedParty,
}: {
  store: Pick<StoreData, "name" | "address" | "phone">;
  rows: CashFlow[];
  startDate: string;
  endDate: string;
  totalIn: number;
  totalOut: number;
  netFlow: number;
  showGlobalTotal: boolean;
  searchTerm: string;
  selectedParty: string;
}) => {
  const tableRows = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(formatDateTime(row.time))}</td>
              <td>${escapeHtml(formatCurrency(Math.abs(row.amount)))}</td>
              <td>${escapeHtml(getCashFlowTypeLabel(row.type))}</td>
              <td>${escapeHtml(row.description || "-")}</td>
              <td>${escapeHtml(formatCurrency(row.total || 0))}</td>
              <td>${escapeHtml(row.party_name || "بدون طرف ثاني")}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6" class="align-center empty-state">لا توجد بيانات مطابقة للفلاتر الحالية</td></tr>`;

  return buildReportDocument({
    title: "تقرير التدفقات النقدية",
    store,
    meta: [
      { label: "من", value: startDate },
      { label: "إلى", value: endDate },
      { label: "الطرف الثاني", value: selectedParty },
      { label: "البحث", value: searchTerm || "بدون" },
      {
        label: "طريقة الإجمالي",
        value: showGlobalTotal ? "إجمالي عام" : "إجمالي تراكمي داخل النتائج",
      },
      { label: "عدد السجلات", value: rows.length.toString() },
    ],
    summary: [
      {
        label: "إجمالي الدخول",
        value: formatCurrency(totalIn),
        tone: "success",
      },
      {
        label: "إجمالي الخروج",
        value: formatCurrency(Math.abs(totalOut)),
        tone: "danger",
      },
      {
        label: "الصافي",
        value: formatCurrency(netFlow),
        tone: netFlow >= 0 ? "default" : "warning",
      },
      {
        label: "عدد المعاملات",
        value: rows.length.toString(),
        tone: "default",
      },
    ],
    content: `
      <div class="panel">
        <div class="section-title-row">
          <h2>تفاصيل السجلات</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 19%;">الوقت</th>
              <th style="width: 14%;">المبلغ</th>
              <th style="width: 12%;">النوع</th>
              <th style="width: 23%;">الوصف</th>
              <th style="width: 14%;">الإجمالي</th>
              <th style="width: 18%;">الطرف الثاني</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `,
  });
};

export const buildInstallmentsReportHtml = ({
  store,
  installments,
  searchTerm,
  statusFilter,
  showEnded,
  totalBills,
  totalPaid,
  totalRemaining,
  overdueCount,
  completedCount,
  getStatus,
  getTotalPaid,
  getTotalRemaining,
  getPaymentProgress,
}: {
  store: Pick<StoreData, "name" | "address" | "phone">;
  installments: InstallmentReportItem[];
  searchTerm: string;
  statusFilter: string;
  showEnded: boolean;
  totalBills: number;
  totalPaid: number;
  totalRemaining: number;
  overdueCount: number;
  completedCount: number;
  getStatus: (installment: InstallmentReportItem) => string;
  getTotalPaid: (installment: InstallmentReportItem) => number;
  getTotalRemaining: (installment: InstallmentReportItem) => number;
  getPaymentProgress: (installment: InstallmentReportItem) => number;
}) => {
  const cards = installments.length
    ? installments
        .map((installment) => {
          const status = getStatus(installment);
          const totalPaidValue = getTotalPaid(installment);
          const totalRemainingValue = Math.max(
            0,
            getTotalRemaining(installment),
          );
          const progress = Math.min(getPaymentProgress(installment), 100);
          const statusTag = getStatusLabel(status);
          const productsRows = installment.products?.length
            ? installment.products
                .map(
                  (product) => `
                    <tr>
                      <td>${escapeHtml(product.name)}</td>
                      <td class="align-center">${escapeHtml(Math.abs(product.amount))}</td>
                      <td>${escapeHtml(formatCurrency(product.price))}</td>
                      <td>${escapeHtml(formatCurrency(Math.abs(product.amount) * product.price))}</td>
                    </tr>
                  `,
                )
                .join("")
            : `<tr><td colspan="4" class="align-center empty-state">لا توجد منتجات مرتبطة</td></tr>`;
          const paymentsRows = installment.flow?.length
            ? installment.flow
                .map(
                  (flow) => `
                    <tr>
                      <td>${escapeHtml(formatDateTime(flow.time))}</td>
                      <td>${escapeHtml(formatCurrency(flow.amount))}</td>
                    </tr>
                  `,
                )
                .join("")
            : `<tr><td colspan="2" class="align-center empty-state">لا توجد دفعات مسجلة بعد</td></tr>`;

          return `
            <div class="installment-card">
              <div class="installment-head">
                <div>
                  <h2>${escapeHtml(installment.party_name || "عميل غير معروف")}</h2>
                  <div class="installment-subhead">
                    القسط #${escapeHtml(installment.id)} | الفاتورة #${escapeHtml(installment.bill_id)} | تاريخ الإنشاء: ${escapeHtml(formatDateTime(installment.time))}
                  </div>
                </div>
                <span class="tag ${statusTag.className}">${escapeHtml(statusTag.label)}</span>
              </div>

              <div class="two-column-grid">
                <div class="mini-stat">
                  <div class="label">إجمالي الفاتورة</div>
                  <div class="value">${escapeHtml(formatCurrency(Math.abs(installment.total)))}</div>
                </div>
                <div class="mini-stat">
                  <div class="label">المقدم</div>
                  <div class="value">${escapeHtml(formatCurrency(installment.paid))}</div>
                </div>
                <div class="mini-stat">
                  <div class="label">إجمالي المدفوع</div>
                  <div class="value">${escapeHtml(formatCurrency(totalPaidValue))}</div>
                </div>
                <div class="mini-stat">
                  <div class="label">المتبقي</div>
                  <div class="value">${escapeHtml(formatCurrency(totalRemainingValue))}</div>
                </div>
                <div class="mini-stat">
                  <div class="label">عدد الأقساط</div>
                  <div class="value">${escapeHtml(installment.installments_count)}</div>
                </div>
                <div class="mini-stat">
                  <div class="label">الفاصل بين الأقساط</div>
                  <div class="value">${escapeHtml(installment.installment_interval)} يوم</div>
                </div>
              </div>

              <div class="panel">
                <div class="section-title-row">
                  <h3>مؤشر السداد</h3>
                  <div class="section-note">${escapeHtml(progress.toFixed(1))}%</div>
                </div>
                <div style="height: 8px; background: #d9e2ec; border-radius: 999px; overflow: hidden;">
                  <div style="width: ${progress}%; height: 100%; background: ${status === "completed" ? "#1f7a4f" : status === "overdue" ? "#b42318" : "#0f766e"};"></div>
                </div>
              </div>

              <div class="panel">
                <div class="section-title-row">
                  <h3>المنتجات</h3>
                  <div class="section-note">${escapeHtml((installment.products || []).length)} صنف</div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style="width: 40%;">الصنف</th>
                      <th style="width: 15%;">الكمية</th>
                      <th style="width: 20%;">السعر</th>
                      <th style="width: 25%;">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>${productsRows}</tbody>
                </table>
              </div>

              <div class="panel">
                <div class="section-title-row">
                  <h3>سجل الدفعات</h3>
                  <div class="section-note">${escapeHtml((installment.flow || []).length)} دفعة</div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th style="width: 65%;">التاريخ</th>
                      <th style="width: 35%;">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>${paymentsRows}</tbody>
                </table>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="panel"><div class="empty-state align-center">لا توجد أقساط مطابقة للفلاتر الحالية</div></div>`;

  return buildReportDocument({
    title: "تقرير الأقساط",
    store,
    meta: [
      {
        label: "الحالة",
        value:
          statusFilter === "all"
            ? "الكل"
            : getInstallmentStatusLabel(statusFilter),
      },
      { label: "عرض المكتملة", value: showEnded ? "نعم" : "لا" },
      { label: "البحث", value: searchTerm || "بدون" },
      { label: "عدد الأقساط", value: installments.length.toString() },
    ],
    summary: [
      {
        label: "إجمالي الفواتير",
        value: formatCurrency(totalBills),
        tone: "default",
      },
      {
        label: "إجمالي المدفوع",
        value: formatCurrency(totalPaid),
        tone: "success",
      },
      {
        label: "إجمالي المتبقي",
        value: formatCurrency(totalRemaining),
        tone: "warning",
      },
      {
        label: "الأقساط المتأخرة",
        value: overdueCount.toString(),
        tone: "danger",
      },
      {
        label: "الأقساط المكتملة",
        value: completedCount.toString(),
        tone: "success",
      },
    ],
    content: cards,
  });
};

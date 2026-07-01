import { AlertMsg } from "../Shared/AlertMessage";
import type { Dayjs } from "dayjs";
import printJS from "print-js";
import {
  buildBarcodeLabelHtml,
  DEFAULT_BARCODE_SETTINGS,
  type BarcodeSettings,
} from "@renderer/pages/Shared/barcodeUtils";

// Legacy function for fallback (web browser)
const barCodeStyleLegacy = `
      @page {
        margin: 0;
        padding: 0;
        size: {barcodePrinterWidth}px {barcodePrinterHeight}px;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: {barcodePrinterWidth}px;
        height: {barcodePrinterHeight}px;
      }
      .barcode-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 8px;
        box-sizing: border-box;
      }
      .barcode-container svg {
        max-width: 100%;
      }
      .barcode-container .text-line {
        text-align: center;
        font-weight: bold;
      }
      .barcode-container .product-name { font-size: 14px; }
      .barcode-container .price { font-size: 12px; }
      .barcode-container .store-name { font-size: 10px; }
`;

const getBarCodeStyleLegacy = (
  barcodePrinterHeight: number,
  barcodePrinterWidth: number,
) => {
  return barCodeStyleLegacy
    .replaceAll("{barcodePrinterHeight}", barcodePrinterHeight.toString())
    .replaceAll("{barcodePrinterWidth}", barcodePrinterWidth.toString());
};

// THE one canonical way to send any date/datetime to the backend.
//
// Always emits local wall-clock time as "YYYY-MM-DD HH:mm:ss" with ASCII ("English")
// digits, no matter the device language, locale, or timezone. This is the single
// format the backend forwards to PostgreSQL, which parses it unambiguously under any
// `datestyle` setting (the YYYY-MM-DD ordering is ISO-8601, recognized before any
// MDY/DMY rule). Use this for EVERY date value sent to the server (request bodies and
// query params) so we never hit locale/format issues again.
//
// Why not toLocaleString()/toISOString()?
//  - `toLocaleString()` is locale-dependent: en-US Windows emits a parseable date, but
//    an Arabic phone emits "DD/MM/YYYY" (or Arabic-Indic digits) which Postgres rejects.
//  - `toISOString()` is locale-safe but converts to UTC, shifting the stored wall-clock
//    by the timezone offset — inconsistent with the rest of the app, which stores local.
//
// Accepts a JS Date, a dayjs object, a parseable string/number, or nothing (= now).
export const localTimestamp = (
  input?: Date | Dayjs | string | number | null,
): string => {
  let d: Date;
  if (input == null) d = new Date();
  else if (input instanceof Date) d = input;
  else if (
    typeof input === "object" &&
    typeof (input as Dayjs).toDate === "function"
  )
    d = (input as Dayjs).toDate(); // dayjs -> Date (keeps local wall-clock)
  else d = new Date(input as string | number);

  const pad = (n: number) => String(n).padStart(2, "0"); // ASCII digits always
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

// Date-only counterpart of localTimestamp: "YYYY-MM-DD" (local, ASCII digits) for
// fields backed by a DATE column (e.g. product batch expiration dates, analytics
// day boundaries). Same locale/timezone guarantees as localTimestamp — use this for
// every date-only value sent to the backend. (Avoids `.toISOString()`, which would
// shift to UTC and can land on the wrong calendar day near midnight.)
export const localDate = (
  input?: Date | Dayjs | string | number | null,
): string => localTimestamp(input).slice(0, 10);

export const handlePrintError = (
  error: string,
  setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>,
) => {
  console.error(error);
  setMsg({ type: "error", text: "حدث خطأ أثناء الطباعة" });
};

export const printBill = async (
  billRef: React.RefObject<HTMLDivElement>,
  setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>,
  setBillPreviewOpen?: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  try {
    if (!billRef.current) return;

    if (window?.electron?.ipcRenderer) {
      const result = await window.electron.ipcRenderer.invoke("print", {
        html: billRef.current.outerHTML,
        type: "bill",
      });

      if (!result.success) {
        handlePrintError(result.error, setMsg);
      } else if (setBillPreviewOpen) {
        setBillPreviewOpen(false);
      }
    } else {
      // Fallback for web browser
      printJS({
        printable: billRef.current.outerHTML,
        type: "raw-html",
        targetStyles: ["*"],
      });
      if (setBillPreviewOpen) setBillPreviewOpen(false);
    }
  } catch (e) {
    handlePrintError(e as string, setMsg);
  }
};

// Dynamic delay calculation based on job size for batch printing
function calculatePrintDelay(
  totalProducts: number,
  currentProductCopies: number,
): number {
  let baseDelay: number;
  if (totalProducts <= 5) baseDelay = 300;
  else if (totalProducts <= 15) baseDelay = 600;
  else if (totalProducts <= 30) baseDelay = 1000;
  else baseDelay = 1500;

  // Add extra delay for high-copy products (100ms per 10 copies)
  const copyDelay = Math.floor(currentProductCopies / 10) * 100;
  return baseDelay + copyDelay;
}

// Utility delay function
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Batch print barcodes with progress tracking and cancellation support
export const printBatchBarcodes = async (
  products: Array<{
    barCode?: string;
    name: string;
    price: number;
    quantity: number;
  }>,
  onProgress: (current: number, total: number, productName: string) => void,
  shouldCancel: () => boolean,
): Promise<{ completed: number; cancelled: boolean }> => {
  const productsWithBarcode = products.filter((p) => p.barCode);
  const total = productsWithBarcode.length;
  let completed = 0;

  for (let i = 0; i < productsWithBarcode.length; i++) {
    if (shouldCancel()) {
      return { completed, cancelled: true };
    }

    const product = productsWithBarcode[i];
    onProgress(i + 1, total, product.name);

    const priceText =
      product.price > 0 ? product.price.toString() + " " + "جنية " : "";

    await printCode(
      product.barCode || "",
      product.name,
      priceText,
      product.quantity,
    );

    completed++;

    // Add dynamic delay between products (not after the last one)
    if (i < productsWithBarcode.length - 1) {
      const delayMs = calculatePrintDelay(total, product.quantity);
      await delay(delayMs);
    }
  }

  return { completed, cancelled: false };
};

export const printCode = async (
  code: string,
  productName: string,
  priceText: string,
  quantity: number = 1,
) => {
  if (window?.electron?.ipcRenderer) {
    const printerSettings =
      await window.electron.ipcRenderer.invoke("getPrinterSettings");
    const { barcodePrinterWidth, barcodePrinterHeight } = printerSettings;

    if (!barcodePrinterWidth || !barcodePrinterHeight) {
      console.error("Barcode printer width and height not found");
      alert("فشلت عملية الطباعة: لم يتم تحديد أبعاد الباركود");
      return;
    }

    // Merge saved settings with defaults
    const barcodeSettings: BarcodeSettings = {
      ...DEFAULT_BARCODE_SETTINGS,
      ...(printerSettings.barcodeSettings || {}),
    };
    const containerHtmlWithStyle = buildBarcodeLabelHtml({
      code,
      productName,
      priceText,
      barcodePrinterWidth,
      barcodePrinterHeight,
      barcodeSettings,
    });

    const result = await window.electron.ipcRenderer.invoke("print", {
      html: containerHtmlWithStyle,
      type: "barcode",
      copies: quantity,
    });

    if (!result.success) {
      console.error(result.error);
      alert("فشلت عملية الطباعة: " + result.error);
    }
  } else {
    printJS({
      printable: buildBarcodeLabelHtml({
        code,
        productName,
        priceText,
        barcodePrinterWidth: 40,
        barcodePrinterHeight: 25,
        barcodeSettings: DEFAULT_BARCODE_SETTINGS,
      }),
      type: "raw-html",
      targetStyles: ["*"],
      scanStyles: false,
      style: getBarCodeStyleLegacy(200, 320),
    });
  }
};

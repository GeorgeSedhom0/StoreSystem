import { AlertMsg } from "../Shared/AlertMessage";
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

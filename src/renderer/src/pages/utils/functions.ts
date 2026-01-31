import { AlertMsg } from "../Shared/AlertMessage";
import JsBarcode from "jsbarcode";
import printJS from "print-js";

// Barcode settings interface matching PrinterSettings
interface BarcodeSettings {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  barcodeWidthPercent: number;
  barcodeHeightPercent: number;
  showProductName: boolean;
  showPrice: boolean;
  showStoreName: boolean;
  showBarcodeNumber: boolean;
  storeName: string;
  productNameFontSize: number;
  priceFontSize: number;
  storeNameFontSize: number;
  barWidth: number;
}

// Default barcode settings (same as in PrinterSettings.tsx)
const DEFAULT_BARCODE_SETTINGS: BarcodeSettings = {
  marginTop: 1,
  marginBottom: 1,
  marginLeft: 2,
  marginRight: 2,
  barcodeWidthPercent: 90,
  barcodeHeightPercent: 40,
  showProductName: true,
  showPrice: true,
  showStoreName: false,
  showBarcodeNumber: true,
  storeName: "",
  productNameFontSize: 14,
  priceFontSize: 12,
  storeNameFontSize: 10,
  barWidth: 2,
};

interface StyleParams {
  pageWidthPx: number;
  pageHeightPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  marginRightPx: number;
  productNameFontSize: number;
  priceFontSize: number;
  storeNameFontSize: number;
}

const generateBarCodeStyle = (params: StyleParams) => {
  const {
    pageWidthPx,
    pageHeightPx,
    marginTopPx,
    marginBottomPx,
    marginLeftPx,
    marginRightPx,
    productNameFontSize,
    priceFontSize,
    storeNameFontSize,
  } = params;

  const contentWidth = pageWidthPx - marginLeftPx - marginRightPx;
  const contentHeight = pageHeightPx - marginTopPx - marginBottomPx;

  return `
    @page {
      margin: 0;
      padding: 0;
      size: ${pageWidthPx}px ${pageHeightPx}px;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${pageWidthPx}px !important;
        height: ${pageHeightPx}px !important;
        max-height: ${pageHeightPx}px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        page-break-after: avoid !important;
        page-break-before: avoid !important;
        page-break-inside: avoid !important;
      }
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${pageWidthPx}px;
      height: ${pageHeightPx}px;
      max-height: ${pageHeightPx}px;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: avoid;
      page-break-before: avoid;
      page-break-inside: avoid;
    }
    body {
      padding: ${marginTopPx}px ${marginRightPx}px ${marginBottomPx}px ${marginLeftPx}px;
    }
    .barcode-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      width: ${contentWidth}px;
      height: ${contentHeight}px;
      max-height: ${contentHeight}px;
      box-sizing: border-box;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .barcode-container svg {
      flex-shrink: 1;
      max-width: 100%;
      object-fit: contain;
    }
    .barcode-container .text-line {
      display: block;
      text-align: center;
      direction: rtl;
      font-weight: bold;
      line-height: 1.2;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      flex-shrink: 0;
    }
    .barcode-container .store-name {
      font-size: ${storeNameFontSize}px;
      color: #333;
    }
    .barcode-container .product-name {
      font-size: ${productNameFontSize}px;
      margin-bottom: 2px;
    }
    .barcode-container .price {
      font-size: ${priceFontSize}px;
      margin-top: 2px;
    }
  `;
};

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

    // Convert mm to pixels (203 DPI thermal printer ≈ 8 pixels per mm)
    const MM_TO_PX = 8;
    const pageWidthPx = barcodePrinterWidth * MM_TO_PX;
    const pageHeightPx = barcodePrinterHeight * MM_TO_PX;

    // Calculate margins in pixels
    const marginTopPx = barcodeSettings.marginTop * MM_TO_PX;
    const marginBottomPx = barcodeSettings.marginBottom * MM_TO_PX;
    const marginLeftPx = barcodeSettings.marginLeft * MM_TO_PX;
    const marginRightPx = barcodeSettings.marginRight * MM_TO_PX;

    // Calculate available content area
    const contentWidthPx = pageWidthPx - marginLeftPx - marginRightPx;
    const contentHeightPx = pageHeightPx - marginTopPx - marginBottomPx;

    // Calculate space needed for text elements
    let textHeightPx = 0;
    if (barcodeSettings.showStoreName && barcodeSettings.storeName) {
      textHeightPx += barcodeSettings.storeNameFontSize + 4;
    }
    if (barcodeSettings.showProductName && productName) {
      textHeightPx += barcodeSettings.productNameFontSize + 4;
    }
    if (barcodeSettings.showPrice && priceText) {
      textHeightPx += barcodeSettings.priceFontSize + 4;
    }
    if (barcodeSettings.showBarcodeNumber) {
      textHeightPx += 14; // Space for barcode number below bars
    }

    // Calculate barcode dimensions
    const barcodeWidthPx = (contentWidthPx * barcodeSettings.barcodeWidthPercent) / 100;
    const availableHeightForBarcode = contentHeightPx - textHeightPx;
    const barcodeHeightPx = Math.max(
      20,
      (availableHeightForBarcode * barcodeSettings.barcodeHeightPercent) / 100,
    );

    // Calculate bar width based on code length and available width
    const estimatedSymbols = Math.ceil(code.length / 2) + 3;
    const modulesPerSymbol = 11;
    const totalModules = estimatedSymbols * modulesPerSymbol;
    const calculatedBarWidth = Math.floor(barcodeWidthPx / totalModules);
    const barWidth = Math.max(1, Math.min(calculatedBarWidth, barcodeSettings.barWidth));

    // Build the container
    const container = document.createElement("div");
    container.classList.add("barcode-container");

    // Add store name if enabled
    if (barcodeSettings.showStoreName && barcodeSettings.storeName) {
      const storeNameSpan = document.createElement("span");
      storeNameSpan.classList.add("text-line", "store-name");
      storeNameSpan.innerText = barcodeSettings.storeName;
      container.appendChild(storeNameSpan);
    }

    // Add product name if enabled
    if (barcodeSettings.showProductName && productName) {
      const productNameSpan = document.createElement("span");
      productNameSpan.classList.add("text-line", "product-name");
      productNameSpan.innerText = productName;
      container.appendChild(productNameSpan);
    }

    // Create and add barcode SVG
    const svg = document.createElement("svg");
    JsBarcode(svg, code, {
      format: "CODE128",
      width: barWidth,
      height: barcodeHeightPx,
      fontSize: barcodeSettings.showBarcodeNumber ? 12 : 0,
      displayValue: barcodeSettings.showBarcodeNumber,
      margin: 0,
      textMargin: 2,
    });
    container.appendChild(svg);

    // Add price if enabled
    if (barcodeSettings.showPrice && priceText) {
      const priceSpan = document.createElement("span");
      priceSpan.classList.add("text-line", "price");
      priceSpan.innerText = priceText;
      container.appendChild(priceSpan);
    }

    // Generate style
    const style = generateBarCodeStyle({
      pageWidthPx,
      pageHeightPx,
      marginTopPx,
      marginBottomPx,
      marginLeftPx,
      marginRightPx,
      productNameFontSize: barcodeSettings.productNameFontSize,
      priceFontSize: barcodeSettings.priceFontSize,
      storeNameFontSize: barcodeSettings.storeNameFontSize,
    });

    const containerHtmlWithStyle = `
      <style>${style}</style>
      ${container.outerHTML}
    `;

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
    // Web browser fallback - use basic settings
    const container = document.createElement("div");
    container.classList.add("barcode-container");

    const productNameSpan = document.createElement("span");
    productNameSpan.classList.add("text-line", "product-name");
    productNameSpan.innerText = productName;
    container.appendChild(productNameSpan);

    const svg = document.createElement("svg");
    JsBarcode(svg, code, {
      format: "CODE128",
      width: 2,
      height: 50,
      fontSize: 14,
      displayValue: true,
      margin: 0,
    });
    container.appendChild(svg);

    if (priceText) {
      const priceSpan = document.createElement("span");
      priceSpan.classList.add("text-line", "price");
      priceSpan.innerText = priceText;
      container.appendChild(priceSpan);
    }

    printJS({
      printable: container.outerHTML,
      type: "raw-html",
      targetStyles: ["*"],
      scanStyles: false,
      style: getBarCodeStyleLegacy(200, 320),
    });

    container.remove();
  }
};

import { AlertMsg } from "../Shared/AlertMessage";
import JsBarcode from "jsbarcode";
import printJS from "print-js";

const barCodeStyle = `
      @page {
        margin: 0;
        padding: 0;
        size: {barcodePrinterWidth}px {barcodePrinterHeight}px;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: {barcodePrinterWidth}px !important;
          height: {barcodePrinterHeight}px !important;
          max-height: {barcodePrinterHeight}px !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          page-break-after: avoid !important;
          page-break-before: avoid !important;
          page-break-inside: avoid !important;
        }
        body {
          padding: 16px !important;
        }
      }
      html, body {
        margin: 0;
        padding: 0;
        width: {barcodePrinterWidth}px;
        height: {barcodePrinterHeight}px;
        max-height: {barcodePrinterHeight}px;
        box-sizing: border-box;
        overflow: hidden;
        page-break-after: avoid;
        page-break-before: avoid;
        page-break-inside: avoid;
      }
      body {
        padding: 16px;
      }
      .barcode {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: calc(100% - 32px);
        height: calc(100% - 32px);
        max-height: calc({barcodePrinterHeight}px - 32px);
        box-sizing: border-box;
        overflow: hidden;
        page-break-inside: avoid;
      }
      .barcode svg {
        width: 100%;
        flex-shrink: 2;
        min-height: 30px;
        max-height: 50%;
        object-fit: contain;
      }
      .barcode span {
        display: block;
        text-align: center;
        direction: rtl;
        font-weight: bold;
        line-height: 1;
        word-wrap: break-word;
        overflow-wrap: break-word;
        white-space: normal;
        max-width: 100%;
        flex-shrink: 3;
        overflow: hidden;
      }
      .barcode .title {
        font-size: clamp(18px, 3vw, 50px);
        margin-bottom: 2px;
        padding: 2px 4px;
        max-height: 20%;
      }
      .barcode .footer {
        font-size: clamp(16px, 3vw, 50px);
        margin-top: 2px;
        padding: 2px 4px;
        max-height: 15%;
      }
`;

const getBarCodeStyle = (
  barcodePrinterHeight: number,
  barcodePrinterWidth: number,
) => {
  return barCodeStyle
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
  title: string,
  footer: string,
  quantity: number = 1,
) => {
  const container = document.createElement("div");
  const svg = document.createElement("svg");
  const titleSpan = document.createElement("span");
  const footerSpan = document.createElement("span");
  container.classList.add("barcode");
  titleSpan.classList.add("title");
  footerSpan.classList.add("footer");
  titleSpan.innerText = title;
  footerSpan.innerText = footer;

  if (window?.electron?.ipcRenderer) {
    const printerSettings =
      await window.electron.ipcRenderer.invoke("getPrinterSettings");
    const { barcodePrinterWidth, barcodePrinterHeight } = printerSettings;

    if (!barcodePrinterWidth || !barcodePrinterHeight) {
      console.error("Barcode printer width and height not found");
      alert("فشلت عملية الطباعة");
      return;
    }

    // Convert mm to pixels (203 DPI thermal printer ≈ 8 pixels per mm)
    const MM_TO_PX = 8;
    const pageWidthPx = barcodePrinterWidth * MM_TO_PX;
    const pageHeightPx = barcodePrinterHeight * MM_TO_PX;

    // Add 2mm margin on all sides (16px total: 2mm * 8px/mm on each side)
    const MARGIN_PX = 2 * MM_TO_PX;
    const printerWidthPx = pageWidthPx - MARGIN_PX * 2;
    const printerHeightPx = pageHeightPx - MARGIN_PX * 2;

    // Calculate safe bar width based on code length (numeric codes use CODE128C)
    const estimatedSymbols = Math.ceil(code.length / 2) + 3;
    const modulesPerSymbol = 11;
    const totalModules = estimatedSymbols * modulesPerSymbol;
    const safeBarWidth = Math.floor(printerWidthPx / totalModules);

    // Reserve space for text elements (with conservative sizing to prevent overflow)
    const titleHeight = Math.min(28, printerHeightPx * 0.24);
    const footerHeight = Math.min(22, printerHeightPx * 0.19);
    const barcodeTextHeight = 18; // JsBarcode's human-readable text
    const padding = 8;

    const availableHeightForBars =
      printerHeightPx -
      titleHeight -
      footerHeight -
      barcodeTextHeight -
      padding * 3;

    // Limit barcode height to maximum 42% of available height to ensure everything fits
    const barcodeHeight = Math.max(
      25,
      Math.min(availableHeightForBars * 0.8, printerHeightPx * 0.42),
    );

    JsBarcode(svg, code, {
      format: "CODE128",
      width: safeBarWidth,
      height: barcodeHeight,
      fontSize: 16,
      displayValue: true, // Show human-readable text
      margin: 0,
    });

    container.appendChild(titleSpan);
    container.appendChild(svg);
    container.appendChild(footerSpan);

    // Embed the style in the html (use page dimensions for @page, not barcode dimensions)
    const containerHtmlWithStyle = `
      <style>
        ${getBarCodeStyle(pageHeightPx, pageWidthPx)}
      </style>
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
    // Web browser fallback
    JsBarcode(svg, code, {
      format: "CODE128",
      width: 2,
      height: 50,
      fontSize: 20,
      displayValue: true,
    });

    container.appendChild(titleSpan);
    container.appendChild(svg);
    container.appendChild(footerSpan);

    printJS({
      printable: container.outerHTML,
      type: "raw-html",
      targetStyles: ["*"],
      scanStyles: false,
      style: getBarCodeStyle(100, 200),
    });

    // Clean up
    container.remove();
  }
};

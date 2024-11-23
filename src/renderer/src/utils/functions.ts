import { AlertMsg } from "../pages/Shared/AlertMessage";
import JsBarcode from "jsbarcode";
import printJS from "print-js";

const barCodeStyle = `
      .barcode {
        display: flex;
        flex-direction: column;
        align-items: center
        justify-content: flex-start;
      }
      .barcode svg {
        width: 100%;
        height: {barcodePrinterHeight}px;
      }
      .barcode span {
        display: block;
        font-size: 12px;
        text-align: center;
        direction: rtl;
      }
      .barcode .title {
        max-height: 30px;
      }
      .barcode .footer {
        max-height: 10px;
      }
`;

const getBarCodeStyle = (barcodePrinterHeight: number) => {
  return barCodeStyle.replace(
    "{barcodePrinterHeight}",
    barcodePrinterHeight.toString(),
  );
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
    }
    JsBarcode(svg, code, {
      format: "CODE128",
      width: barcodePrinterWidth / 20,
      height: barcodePrinterHeight,
      fontSize: 20,
    });
    container.appendChild(titleSpan);
    container.appendChild(svg);
    container.appendChild(footerSpan);
    // embed the style in the html
    const containerHtmlWithStyle = `
      <style>
        ${getBarCodeStyle(barcodePrinterHeight)}
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
    }
  } else {
    JsBarcode(svg, code, {
      format: "CODE128",
      width: 2,
      height: 35,
      fontSize: 20,
    });
    container.appendChild(titleSpan);
    container.appendChild(svg);
    container.appendChild(footerSpan);
    printJS({
      printable: container.outerHTML,
      type: "raw-html",
      targetStyles: ["*"],
      scanStyles: false,
      style: getBarCodeStyle(40),
    });
    svg.remove();
  }
};

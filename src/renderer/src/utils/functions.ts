import { AlertMsg } from "../pages/Shared/AlertMessage";
import JsBarcode from "jsbarcode";
import printJS from "print-js";

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
  lang: "ar" | "en",
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
  JsBarcode(svg, code, {
    format: "CODE128",
    width: 2,
    height: 35,
    fontSize: 20,
  });
  container.appendChild(titleSpan);
  container.appendChild(svg);
  container.appendChild(footerSpan);
  const containerHtml = container.outerHTML;

  if (window?.electron?.ipcRenderer) {
    const result = await window.electron.ipcRenderer.invoke("print", {
      html: containerHtml,
      type: "barcode",
    });

    if (!result.success) {
      console.error(result.error);
    }
  } else {
    printJS({
      printable: containerHtml,
      type: "raw-html",
      targetStyles: ["*"],
      scanStyles: false,
      style: `
      .barcode {
        display: flex;
        flex-direction: column;
        align-items: center
        justify-content: flex-start;
      }
      .barcode svg {
        width: 100%;
        height: 40px;
      }
      .barcode span {
        display: block;
        font-size: 12px;
        text-align: center;
        direction: ${lang === "ar" ? "rtl" : "ltr"};
      }
      .barcode .title {
        max-height: 30px;
      }
      .barcode .footer {
        max-height: 10px;
      }
      `,
    });
    svg.remove();
  }
};

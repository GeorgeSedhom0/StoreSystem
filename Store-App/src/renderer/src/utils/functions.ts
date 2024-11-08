import { AlertMsg } from "../pages/Shared/AlertMessage";
import JsBarcode from "jsbarcode";
import printJS from "print-js";

export const printBill = async (
  billRef: React.RefObject<HTMLDivElement>,
  setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>,
  setBillPreviewOpen?: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  try {
    if (!billRef.current) return;
    // Check if running in Electron
    if (window?.electron?.ipcRenderer) {
      // Use IPC to communicate with main process for printing
      try {
        const data = await window.electron.ipcRenderer.invoke("print", {
          html: billRef.current.outerHTML,
          deviceName: "HP LaserJet Professional P1102",
        });
        if (!data.success) {
          console.error(data.error);
          setMsg({ type: "error", text: "حدث خطأ أثناء الطباعة" });
        }
      } catch (error) {
        console.error(error);
        setMsg({ type: "error", text: "حدث خطأ أثناء الطباعة" });
      }
    } else {
      // Fallback to printJS for web browser
      printJS({
        printable: billRef.current.outerHTML,
        type: "raw-html",
        targetStyles: ["*"],
        scanStyles: true,
        maxWidth: 800,
      });
      if (setBillPreviewOpen) setBillPreviewOpen(false);
    }
  } catch (e) {
    setMsg({ type: "error", text: "حدث خطأ أثناء الطباعة" });
  }
};

export const printCode = (
  code: string,
  title: string,
  footer: string,
  lang: "ar" | "en",
) => {
  const containter = document.createElement("div");
  const svg = document.createElement("svg");
  const titleSpan = document.createElement("span");
  const footerSpan = document.createElement("span");
  containter.classList.add("barcode");
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
  containter.appendChild(titleSpan);
  containter.appendChild(svg);
  containter.appendChild(footerSpan);
  const containterHtml = containter.outerHTML;
  printJS({
    printable: containterHtml,
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
};

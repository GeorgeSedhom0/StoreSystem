import domtoimage from "dom-to-image";
import { AlertMsg } from "../pages/Shared/AlertMessage";
import JsBarcode from "jsbarcode";
import printJS from "print-js";

export const printBill = async (
  billRef: React.RefObject<HTMLDivElement>,
  setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>,
  setLastBillOpen: React.Dispatch<React.SetStateAction<boolean>>,
  usbDevice: any
) => {
  if (!billRef.current) return;

  await usbDevice.clearHalt("out", 2);
  await usbDevice.releaseInterface(0);
  await usbDevice.close();
  await usbDevice.open();
  await usbDevice.selectConfiguration(1);
  await usbDevice.claimInterface(0);
  // console.log(usbDevice);
  // return;

  try {
    const dataUrl = await domtoimage.toPng(billRef.current, {
      bgcolor: "white",
    });
    const iimg = new Image();
    iimg.src = dataUrl;

    iimg.onload = async function () {
      const canvas = document.createElement("canvas");
      canvas.width = iimg.width;
      canvas.height = iimg.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(iimg, 0, 0, iimg.width, iimg.height);
      const data = ctx?.getImageData(0, 0, iimg.width, iimg.height).data;
      if (!data) return;
      const bitmapData = new Uint8Array(canvas.width * canvas.height);
      let bitmapDataIndex = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luminance = data[i] >= 255 ? 0 : 1; // Ensure black pixels are set to 1
        bitmapData[bitmapDataIndex++] = luminance;
      }

      const width = canvas.width;
      const height = canvas.height;
      const buffer = new ArrayBuffer(bitmapData.length + 16);
      const view = new DataView(buffer);

      // Header
      view.setUint8(0, 0x1b); // Escape code
      view.setUint8(1, 0x40); // Initialize printer
      view.setUint8(2, 0x1b); // Escape code
      view.setUint8(3, 0x33); // Set line spacing
      view.setUint8(4, 24); // 24 dots

      let offset = 16;
      // Bitmap data
      for (let y = 0; y < height; y += 24) {
        view.setUint8(offset++, 0x1b); // Escape code
        view.setUint8(offset++, 0x2a); // Bit image mode
        view.setUint8(offset++, 33); // 24-dot double-density
        view.setUint8(offset++, width & 0xff); // Width low byte
        view.setUint8(offset++, (width >> 8) & 0xff); // Width high byte
        for (let x = 0; x < width; x++) {
          for (let k = 0; k < 3; k++) {
            let slice = 0;
            for (let b = 0; b < 8; b++) {
              const i = (y + k * 8 + b) * width + x;
              slice |= bitmapData[i] << (7 - b);
            }
            view.setUint8(offset++, slice);
          }
        }
        view.setUint8(offset++, 0x0a); // Line feed
      }

      // Footer
      view.setUint8(offset++, 0x1b); // Escape code
      view.setUint8(offset++, 0x33); // Set line spacing
      view.setUint8(offset++, 30); // 30 dots

      // Add some line feeds for spacing before cut
      for (let i = 0; i < 20; i++) {
        view.setUint8(offset++, 0x0a); // Line feed
      }

      // Cutting
      const cutCommand = new Uint8Array([29, 86, 1]);
      for (let i = 0; i < cutCommand.length; i++) {
        view.setUint8(offset++, cutCommand[i]);
      }

      const blob = new Blob([view], { type: "application/octet-stream" });
      const arrayBuffer = await blob.arrayBuffer();

      const res = await usbDevice.transferOut(2, arrayBuffer);
      console.log(res);
    };
  } catch (error) {
    console.log(error);
    setMsg({
      type: "error",
      text: "حدث خطأ ما",
    });
  } finally {
    setLastBillOpen(false);
  }
};


export const printCode =  (code: string) => {
  const svg = document.createElement("svg");
  svg.classList.add("barcode");
  JsBarcode(svg, code, { 
    format: "CODE128",
    width: 2,
    height: 80,
    fontSize: 25,
  });
  const svgHtml = svg.outerHTML;
  printJS({
    printable: svgHtml,
    type: "raw-html",
    targetStyles: ["*"],
    scanStyles: false,
    style: ".barcode { width: 100%; height: 80px; }",
  });
  svg.remove();
}
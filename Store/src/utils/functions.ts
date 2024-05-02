import domtoimage from 'dom-to-image';
import { AlertMsg } from '../pages/Shared/AlertMessage';
// import EscPosEncoder from "esc-pos-encoder";


export const printBill = async (
    billRef: React.RefObject<HTMLDivElement>,
    setMsg: React.Dispatch<React.SetStateAction<AlertMsg>>,
    setLastBillOpen: React.Dispatch<React.SetStateAction<boolean>>
) => {
    if (!billRef.current) return;
    try {
      const dataUrl = await domtoimage.toPng(billRef.current, {
        bgcolor: "white",
      });
      const iimg = new Image();
      iimg.src = dataUrl;

      iimg.onload = function () {
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
          const luminance = data[i] === 255 ? 0 : 1; // Ensure black pixels are set to 1
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

        // Bitmap data
        let offset = 16;
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

        const blob = new Blob([view], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "data.bin";
        link.click();
        // rest of your code
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

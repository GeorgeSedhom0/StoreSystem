import { Dispatch, SetStateAction, useEffect } from "react";
import { Product } from "../../utils/types";
import { AlertMsg } from "../AlertMessage";

const CLIENT_BARCODE_PREFIX = "CL";

const useBarcodeDetection = (
  products: Product[],
  addToCart: (product: Product) => void,
  setMsg: Dispatch<SetStateAction<AlertMsg>>,
) => {
  useEffect(() => {
    let code = "";
    let reading = false;

    const handleKeyPress = (e: any) => {
      // If the target of the event is an input element, ignore the event
      if (e.target.tagName.toLowerCase() === "input") {
        return;
      }

      if (e.key === "Enter") {
        if (code.length >= 2) {
          // Skip client barcodes - they are handled by useClientBarcodeDetection
          if (code.startsWith(CLIENT_BARCODE_PREFIX)) {
            code = "";
            return;
          }

          const product = products.find((prod) => prod.bar_code === code);
          if (product) {
            addToCart(product);
          } else {
            setMsg({
              type: "error",
              text: "المنتج غير موجود",
            });
          }
          code = "";
        }
      } else {
        code += e.key;
      }

      if (!reading) {
        reading = true;
        setTimeout(() => {
          code = "";
          reading = false;
        }, 500);
      }
    };

    window.addEventListener("keypress", handleKeyPress);

    return () => {
      window.removeEventListener("keypress", handleKeyPress);
    };
  }, [products, addToCart, setMsg]);
};

export default useBarcodeDetection;

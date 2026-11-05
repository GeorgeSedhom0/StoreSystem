import { Dispatch, SetStateAction, useEffect, useMemo } from "react";
import { Product, ProductPackage } from "../../utils/types";
import { AlertMsg } from "../AlertMessage";
import { buildBarcodeIndex } from "../packages";

const CLIENT_BARCODE_PREFIX = "CL";

const useBarcodeDetection = (
  products: Product[],
  addToCart: (product: Product, pkg?: ProductPackage | null) => void,
  setMsg: Dispatch<SetStateAction<AlertMsg>>,
) => {
  // O(1) lookup; package barcodes add the package (a carton of 10).
  const index = useMemo(() => buildBarcodeIndex(products), [products]);

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

          const hit = index.get(code);
          if (hit) {
            addToCart(hit.product, hit.pkg);
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
  }, [index, addToCart, setMsg]);
};

export default useBarcodeDetection;

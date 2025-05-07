import { DBProducts, SCProduct } from "@renderer/utils/types";
import { useState, useEffect, useRef } from "react";

export function usePersistentCart(
  page: string,
  defaultState: SCProduct[],
  products: DBProducts["products"],
): [SCProduct[], React.Dispatch<React.SetStateAction<SCProduct[]>>] {
  const [state, setState] = useState<SCProduct[]>(defaultState);
  const isCartLoaded = useRef(false);

  useEffect(() => {
    async function loadCart() {
      try {
        const saved: SCProduct[] = await window.electron.ipcRenderer.invoke(
          "get-cart",
          page,
        );
        if (saved != null && products.length > 0) {
          const updatedCart = saved
            .map((item) => {
              const product = products.find((p) => p.id === item.id);
              if (product) {
                return {
                  id: item.id,
                  quantity: item.quantity,
                  ...product,
                };
              }
              return null;
            })
            .filter((item) => item !== null) as SCProduct[];
          setState(updatedCart);
          isCartLoaded.current = true;
        }
      } catch (error) {
        console.error(error);
      }
    }
    loadCart();
  }, [page, products]);

  useEffect(() => {
    if (!isCartLoaded.current) return; // Prevent saving before the cart is loaded
    async function saveCart() {
      try {
        await window.electron.ipcRenderer.invoke("set-cart", page, state);
      } catch (error) {
        console.error(error);
      }
    }
    saveCart();
  }, [page, state]);

  return [state, setState];
}

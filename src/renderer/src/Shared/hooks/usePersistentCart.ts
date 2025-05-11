import { DBProducts, SCProduct } from "@renderer/utils/types";
import { useState, useEffect, useRef } from "react";

export function usePersistentCart(
  page: string,
  defaultState: SCProduct[],
  products: DBProducts["products"],
): [SCProduct[], React.Dispatch<React.SetStateAction<SCProduct[]>>] {
  const [state, setState] = useState<SCProduct[]>(defaultState);
  const isCartLoaded = useRef(false);
  const [windowId, setWindowId] = useState<number | null>(null);

  // Get window ID once when component mounts
  useEffect(() => {
    async function getWindowId() {
      try {
        // Get window ID from the URL query parameters first
        const urlParams = new URLSearchParams(window.location.search);
        const urlWindowId = urlParams.get("windowId");

        if (urlWindowId && !isNaN(parseInt(urlWindowId))) {
          setWindowId(parseInt(urlWindowId));
        } else {
          // Fallback to asking main process for the ID
          const id = await window.electron.ipcRenderer.invoke("get-window-id");
          setWindowId(id);
        }
      } catch (error) {
        console.error("Failed to get window ID:", error);
      }
    }

    getWindowId();
  }, []);

  // Load cart when windowId and products are available
  useEffect(() => {
    if (windowId === null) return; // Wait until we have a window ID

    async function loadCart() {
      try {
        const saved: SCProduct[] = await window.electron.ipcRenderer.invoke(
          "get-cart",
          page,
          windowId,
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
  }, [page, products, windowId]);

  // Save cart when it changes and we have a window ID
  useEffect(() => {
    if (!isCartLoaded.current || windowId === null) return; // Prevent saving before the cart is loaded or window ID is known

    async function saveCart() {
      try {
        await window.electron.ipcRenderer.invoke(
          "set-cart",
          page,
          windowId,
          state,
        );
      } catch (error) {
        console.error(error);
      }
    }
    saveCart();
  }, [page, state, windowId]);

  return [state, setState];

  return [state, setState];
}

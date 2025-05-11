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
          const id = parseInt(urlWindowId);
          console.log(`[Cart: ${page}] Using window ID from URL: ${id}`);
          setWindowId(id);
        } else {
          // Fallback to asking main process for the ID
          const id = await window.electron.ipcRenderer.invoke("get-window-id");
          console.log(`[Cart: ${page}] Using window ID from main process: ${id}`);
          setWindowId(id);
        }
        
        // Debug: Get all active window IDs
        const activeIds = await window.electron.ipcRenderer.invoke("get-active-window-ids");
        console.log(`[Cart: ${page}] Active window IDs: ${JSON.stringify(activeIds)}`);
      } catch (error) {
        console.error("Failed to get window ID:", error);
      }
    }

    getWindowId();
  }, [page]);

  // Load cart when windowId and products are available
  useEffect(() => {
    if (windowId === null) return; // Wait until we have a window ID

    async function loadCart() {
      try {
        console.log(`[Cart: ${page}] Loading cart for window ID: ${windowId}`);
        const saved: SCProduct[] = await window.electron.ipcRenderer.invoke(
          "get-cart",
          page,
          windowId,
        );
        console.log(`[Cart: ${page}] Loaded cart data:`, saved);
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
          console.log(`[Cart: ${page}] Cart processed and loaded with ${updatedCart.length} items`);
        }
      } catch (error) {
        console.error(`[Cart: ${page}] Error loading cart:`, error);
      }
    }
    loadCart();
  }, [page, products, windowId]);

  // Save cart when it changes and we have a window ID
  useEffect(() => {
    if (!isCartLoaded.current || windowId === null) return; // Prevent saving before the cart is loaded or window ID is known

    async function saveCart() {
      try {
        console.log(`[Cart: ${page}] Saving cart for window ID: ${windowId} with ${state.length} items`);
        await window.electron.ipcRenderer.invoke(
          "set-cart",
          page,
          windowId,
          state,
        );
      } catch (error) {
        console.error(`[Cart: ${page}] Error saving cart:`, error);
      }
    }
    saveCart();
  }, [page, state, windowId]);

  return [state, setState];
}

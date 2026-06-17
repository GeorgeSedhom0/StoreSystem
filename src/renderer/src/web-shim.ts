// ─── Browser web-shim ─────────────────────────────────────────────────────
//
// The renderer talks to all device-local features through
// `window.electron.ipcRenderer.invoke(channel, ...args)`. In a plain browser
// (the app served from FastAPI at "/"), `window.electron` does not exist, so
// the app would throw on boot. This module synthesizes a compatible
// `window.electron` when running outside Electron, routing each IPC channel to
// a browser-friendly equivalent (localStorage, printJS, same-origin, ...).
//
// Keeping the shim here means the ~30 pages need no changes — they keep calling
// the exact same `ipcRenderer.invoke(...)` they always have.
//
// IMPORTANT: import this BEFORE App in main.tsx.

import printJS from "print-js";

// Only activate when there is no real Electron bridge.
if (!(window as any).electron?.ipcRenderer) {
  (window as any).__IS_WEB__ = true;

  const SETTINGS_KEY = "openstore-web-settings";

  const readSettings = (): Record<string, any> => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      return {};
    }
  };

  const writeSettings = (settings: Record<string, any>) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  };

  const getSetting = (key: string): any => {
    const settings = readSettings();
    return key in settings ? settings[key] : null;
  };

  const setSetting = (key: string, value: any) => {
    const settings = readSettings();
    settings[key] = value;
    writeSettings(settings);
  };

  // Default per-device printer config so barcode/bill rendering doesn't bail.
  const DEFAULT_PRINTER_SETTINGS = {
    billPrinterWidth: 80,
    barcodePrinterWidth: 40,
    barcodePrinterHeight: 25,
    barcodeSettings: {},
    billLogos: {},
    billLogoSettings: {},
    billBodyMessages: {},
    billFooterMessages: {},
  };

  const getWindowId = (): number => {
    const fromUrl = new URLSearchParams(window.location.search).get("windowId");
    const parsed = fromUrl ? Number(fromUrl) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const printHtml = (html: string) => {
    printJS({
      printable: html,
      type: "raw-html",
      targetStyles: ["*"],
    });
  };

  const invoke = async (channel: string, ...args: any[]): Promise<any> => {
    switch (channel) {
      // ── Generic settings (theme, zoom, store_id, ...) ──
      case "get": {
        const [key] = args;
        // The web build always talks to the server it was served from.
        if (key === "baseUrl") return window.location.origin;
        return getSetting(key);
      }
      case "set": {
        const [key, value] = args;
        if (key === "baseUrl") return value; // ignored; same-origin in web
        setSetting(key, value);
        return value;
      }

      // ── Deployment mode / first-run wizard ──
      // Web is always a thin client of an existing server: skip the wizard.
      case "get-mode":
        return "remote";
      case "set-mode":
        setSetting("mode", args[0]);
        return { success: true };
      case "get-service-status":
        return { status: "ready", message: "" };

      // ── Multi-window (single tab in the browser) ──
      case "get-window-id":
        return getWindowId();
      case "get-active-window-ids":
        return [getWindowId()];
      case "open-new-window": {
        const path = args[0] || "";
        const base = window.location.href.split("#")[0];
        window.open(path ? base + path : window.location.href, "_blank");
        return null;
      }

      // ── Per-page cart persistence ──
      case "get-cart": {
        const [page, windowId] = args;
        return getSetting(`cart-${page}-window-${windowId}`) || [];
      }
      case "set-cart": {
        const [page, windowId, cart] = args;
        setSetting(`cart-${page}-window-${windowId}`, cart);
        return null;
      }

      // ── Printing (browser print dialog instead of silent printer) ──
      case "print": {
        const { html } = args[0] || {};
        try {
          if (html) printHtml(html);
          return { success: true };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "export-pdf": {
        // No native save dialog in the browser; the print dialog offers
        // "Save as PDF", which is the closest equivalent.
        const { html } = args[0] || {};
        try {
          if (html) printHtml(html);
          return { success: true, cancelled: false };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      }
      case "getPrinters":
        return [];
      case "getPrinterSettings":
        return getSetting("printerSettings") || DEFAULT_PRINTER_SETTINGS;
      case "savePrinterSettings": {
        const current = getSetting("printerSettings") || {};
        setSetting("printerSettings", { ...current, ...(args[0] || {}) });
        return null;
      }

      // ── Bill logo (disk file in Electron) — not supported on web ──
      case "selectBillLogo":
        return { cancelled: true };
      case "saveBillLogo":
      case "getBillLogo":
        return null;
      case "removeBillLogo":
        return { success: true };

      default:
        console.warn(`[web-shim] unhandled IPC channel: ${channel}`);
        return null;
    }
  };

  (window as any).electron = {
    ipcRenderer: {
      invoke,
      // service-status etc. never fire on web; return a no-op unsubscribe.
      on: () => () => {},
      once: () => {},
      send: () => {},
      removeAllListeners: () => {},
      removeListener: () => {},
    },
    process: { platform: "web" },
  };
  (window as any).api = {};
}

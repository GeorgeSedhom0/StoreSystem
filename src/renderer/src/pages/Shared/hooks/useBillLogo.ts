import { useCallback, useEffect, useState } from "react";

interface BillLogoData {
  path: string;
  fileName: string;
  updatedAt: string;
  dataUrl: string;
}

export interface BillLogoAppearance {
  maxHeight: number;
  spacingBottom: number;
}

export const DEFAULT_BILL_LOGO_APPEARANCE: BillLogoAppearance = {
  maxHeight: 85,
  spacingBottom: 6,
};

export const notifyBillLogoUpdated = (storeId: number) => {
  window.dispatchEvent(
    new CustomEvent("bill-logo-updated", {
      detail: { storeId },
    }),
  );
};

export const notifyBillLogoAppearanceUpdated = (storeId: number) => {
  window.dispatchEvent(
    new CustomEvent("bill-logo-appearance-updated", {
      detail: { storeId },
    }),
  );
};

export const useBillLogo = (storeId: number) => {
  const [logo, setLogo] = useState<BillLogoData | null>(null);

  const loadLogo = useCallback(async () => {
    if (!window?.electron?.ipcRenderer || typeof storeId !== "number") {
      setLogo(null);
      return;
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(
        "getBillLogo",
        storeId,
      );
      setLogo(result || null);
    } catch (error) {
      console.error("Failed to load bill logo:", error);
      setLogo(null);
    }
  }, [storeId]);

  useEffect(() => {
    loadLogo();

    const handleLogoUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ storeId?: number }>).detail;
      if (!detail?.storeId || detail.storeId === storeId) {
        loadLogo();
      }
    };

    window.addEventListener("bill-logo-updated", handleLogoUpdated);
    return () => {
      window.removeEventListener("bill-logo-updated", handleLogoUpdated);
    };
  }, [loadLogo, storeId]);

  return {
    logo,
    reloadLogo: loadLogo,
  };
};

export const useBillLogoAppearance = (storeId: number) => {
  const [appearance, setAppearance] = useState<BillLogoAppearance>(
    DEFAULT_BILL_LOGO_APPEARANCE,
  );

  const loadAppearance = useCallback(async () => {
    if (!window?.electron?.ipcRenderer || typeof storeId !== "number") {
      setAppearance(DEFAULT_BILL_LOGO_APPEARANCE);
      return;
    }

    try {
      const printerSettings =
        await window.electron.ipcRenderer.invoke("getPrinterSettings");
      const storeSettings =
        printerSettings?.billLogoSettings?.[String(storeId)] || {};
      setAppearance({
        ...DEFAULT_BILL_LOGO_APPEARANCE,
        ...storeSettings,
      });
    } catch (error) {
      console.error("Failed to load bill logo appearance:", error);
      setAppearance(DEFAULT_BILL_LOGO_APPEARANCE);
    }
  }, [storeId]);

  useEffect(() => {
    loadAppearance();

    const handleAppearanceUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ storeId?: number }>).detail;
      if (!detail?.storeId || detail.storeId === storeId) {
        loadAppearance();
      }
    };

    window.addEventListener(
      "bill-logo-appearance-updated",
      handleAppearanceUpdated,
    );

    return () => {
      window.removeEventListener(
        "bill-logo-appearance-updated",
        handleAppearanceUpdated,
      );
    };
  }, [loadAppearance, storeId]);

  return {
    appearance,
    reloadAppearance: loadAppearance,
  };
};

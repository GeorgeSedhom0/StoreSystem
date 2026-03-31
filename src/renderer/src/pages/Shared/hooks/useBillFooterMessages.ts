import { useCallback, useEffect, useState } from "react";

export const BILL_PRINT_TYPES = [
  "sell",
  "buy",
  "return",
  "BNPL",
  "reserve",
  "installment",
  "buy-return",
] as const;

export type BillPrintType = (typeof BILL_PRINT_TYPES)[number];

export type BillBodyMessages = Record<BillPrintType, string>;
export type BillFooterMessages = Record<BillPrintType, string>;

export type StoredBillBodyMessages = Record<string, Partial<BillBodyMessages>>;

export type StoredBillFooterMessages = Record<
  string,
  Partial<BillFooterMessages>
>;

export const BILL_TYPE_LABELS: Record<BillPrintType, string> = {
  sell: "فاتورة مبيعات",
  buy: "فاتورة شراء",
  return: "فاتورة مرتجع",
  BNPL: "فاتورة بيع اجل",
  reserve: "فاتورة حجز",
  installment: "فاتورة تقسيط",
  "buy-return": "فاتورة مرتجع شراء",
};

export const DEFAULT_BILL_BODY_MESSAGES: BillBodyMessages = {
  sell: "",
  buy: "",
  return: "",
  BNPL: "هذه الفاتورة بيع اجل ويتم سداد المبلغ بالكامل دفعة واحدة عند التحصيل.",
  reserve:
    "هذه الفاتورة حجز والمنتجات محفوظة للعميل ولم يتم تسليمها بعد. يرجى الاحتفاظ بها عند الاستلام.",
  installment: "",
  "buy-return": "",
};

export const DEFAULT_BILL_FOOTER_MESSAGES: BillFooterMessages = {
  sell: "عند ارجاع المنتجات لا تقبل الا من خلال هذة الفاتورة",
  buy: "عند ارجاع المنتجات لا تقبل الا من خلال هذة الفاتورة",
  return: "عند ارجاع المنتجات لا تقبل الا من خلال هذة الفاتورة",
  BNPL: "",
  reserve: "",
  installment: "",
  "buy-return": "عند ارجاع المنتجات لا تقبل الا من خلال هذة الفاتورة",
};

export const getBillBodyMessagesForStore = (
  allMessages: StoredBillBodyMessages | undefined,
  storeId: number,
): BillBodyMessages => ({
  ...DEFAULT_BILL_BODY_MESSAGES,
  ...(allMessages?.[String(storeId)] || {}),
});

export const getBillFooterMessagesForStore = (
  allMessages: StoredBillFooterMessages | undefined,
  storeId: number,
): BillFooterMessages => ({
  ...DEFAULT_BILL_FOOTER_MESSAGES,
  ...(allMessages?.[String(storeId)] || {}),
});

export const notifyBillPrintMessagesUpdated = (storeId: number) => {
  window.dispatchEvent(
    new CustomEvent("bill-print-messages-updated", {
      detail: { storeId },
    }),
  );
};

export const useBillPrintMessages = (storeId: number) => {
  const [bodyMessages, setBodyMessages] = useState<BillBodyMessages>(
    DEFAULT_BILL_BODY_MESSAGES,
  );
  const [footerMessages, setFooterMessages] = useState<BillFooterMessages>(
    DEFAULT_BILL_FOOTER_MESSAGES,
  );

  const loadMessages = useCallback(async () => {
    if (!window?.electron?.ipcRenderer || typeof storeId !== "number") {
      setBodyMessages(DEFAULT_BILL_BODY_MESSAGES);
      setFooterMessages(DEFAULT_BILL_FOOTER_MESSAGES);
      return;
    }

    try {
      const printerSettings =
        await window.electron.ipcRenderer.invoke("getPrinterSettings");
      setBodyMessages(
        getBillBodyMessagesForStore(printerSettings?.billBodyMessages, storeId),
      );
      setFooterMessages(
        getBillFooterMessagesForStore(
          printerSettings?.billFooterMessages,
          storeId,
        ),
      );
    } catch (error) {
      console.error("Failed to load bill print messages:", error);
      setBodyMessages(DEFAULT_BILL_BODY_MESSAGES);
      setFooterMessages(DEFAULT_BILL_FOOTER_MESSAGES);
    }
  }, [storeId]);

  useEffect(() => {
    loadMessages();

    const handleMessagesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ storeId?: number }>).detail;
      if (!detail?.storeId || detail.storeId === storeId) {
        loadMessages();
      }
    };

    window.addEventListener(
      "bill-print-messages-updated",
      handleMessagesUpdated,
    );

    return () => {
      window.removeEventListener(
        "bill-print-messages-updated",
        handleMessagesUpdated,
      );
    };
  }, [loadMessages, storeId]);

  return {
    bodyMessages,
    footerMessages,
    reloadMessages: loadMessages,
  };
};

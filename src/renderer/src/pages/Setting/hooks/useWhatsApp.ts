import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { AlertMsg } from "../../Shared/AlertMessage";

// Types
export interface WhatsAppStatus {
  connected: boolean;
  phone_number: string | null;
}

export interface WhatsAppConfigRequest {
  action: "connect" | "disconnect";
}

export interface WhatsAppTestMessageRequest {
  phone_number: string;
  message: string;
}

export interface WhatsAppStoreNumberRequest {
  store_id: number;
  phone_number: string;
}

export interface WhatsAppApiResponse {
  success: boolean;
  message?: string;
  status?: WhatsAppStatus;
  phone_number?: string | null;
  qr_code?: string | null;
  connected?: boolean;
}

// API Functions
const getWhatsAppStatus = async (): Promise<WhatsAppApiResponse> => {
  const { data } = await axios.get("/whatsapp/status");
  return data;
};

const configureWhatsApp = async (
  request: WhatsAppConfigRequest,
): Promise<WhatsAppApiResponse> => {
  const { data } = await axios.post("/whatsapp/configure", request);
  return data;
};

const sendTestMessage = async (
  request: WhatsAppTestMessageRequest,
): Promise<WhatsAppApiResponse> => {
  const { data } = await axios.post("/whatsapp/test-message", request);
  return data;
};

const setStoreNumber = async (
  request: WhatsAppStoreNumberRequest,
): Promise<WhatsAppApiResponse> => {
  const { data } = await axios.post("/whatsapp/store-number", request);
  return data;
};

const getStoreNumber = async (
  store_id: number,
): Promise<WhatsAppApiResponse> => {
  const { data } = await axios.get(`/whatsapp/store-number/${store_id}`);
  return data;
};

const useWhatsApp = (
  setMsg: Dispatch<SetStateAction<AlertMsg>>,
  store_id?: number,
) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [currentQrCode, setCurrentQrCode] = useState<string | null>(null);

  // Status query with polling
  const {
    data: statusData,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["whatsapp", "status"],
    queryFn: getWhatsAppStatus,
    initialData: {
      success: false,
      status: {
        connected: false,
        phone_number: null,
      },
    },
    refetchInterval: isConnecting || showQrDialog ? 2000 : false, // Poll every 2 seconds if connecting
  });

  const { data: storeNumberData, refetch: refetchStoreNumber } = useQuery({
    queryKey: ["whatsapp", "store-number", store_id],
    queryFn: () =>
      store_id
        ? getStoreNumber(store_id)
        : Promise.resolve({ success: false, phone_number: null }),
    retry: 1,
    enabled: !!store_id,
    initialData: { success: false, phone_number: null },
  });

  const { mutate: configure, isPending: configureLoading } = useMutation({
    mutationFn: (request: WhatsAppConfigRequest) => configureWhatsApp(request),
    onMutate: (data) => {
      if (data.action === "connect") {
        setIsConnecting(true);
        setCurrentQrCode(null);
      }
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        if (variables.action === "disconnect") {
          setIsConnecting(false);
          setShowQrDialog(false);
          setCurrentQrCode(null);
          setMsg({
            type: "success",
            text: "تم قطع الاتصال بنجاح",
          });
        } else {
          // For connect action
          if (data.connected) {
            setIsConnecting(false);
            setMsg({
              type: "success",
              text: "تم الاتصال بواتساب بنجاح",
            });
          } else if (data.qr_code) {
            setCurrentQrCode(data.qr_code);
            setShowQrDialog(true);
            setMsg({
              type: "info",
              text: "امسح رمز QR باستخدام هاتفك لإتمام الاتصال",
            });
          }
        }
      } else {
        setMsg({
          type: "error",
          text: data.message || "حدث خطأ أثناء تكوين واتساب",
        });
        setIsConnecting(false);
      }
      refetchStatus();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ أثناء تكوين واتساب" });
      setIsConnecting(false);
      setCurrentQrCode(null);
    },
  });

  const { mutate: sendTestMessageMutation, isPending: testMessageLoading } =
    useMutation({
      mutationFn: sendTestMessage,
      onSuccess: (data) => {
        if (data.success) {
          setMsg({ type: "success", text: "تم إرسال الرسالة التجريبية بنجاح" });
        } else {
          setMsg({
            type: "error",
            text: "فشل في إرسال الرسالة التجريبية",
          });
        }
      },
      onError: () => {
        setMsg({
          type: "error",
          text: "حدث خطأ أثناء إرسال الرسالة التجريبية",
        });
      },
    });

  const { mutate: setStoreNumberMutation, isPending: setStoreNumberLoading } =
    useMutation({
      mutationFn: setStoreNumber,
      onSuccess: (data) => {
        if (data.success) {
          setMsg({ type: "success", text: "تم تحديد رقم المتجر بنجاح" });
        } else {
          setMsg({
            type: "error",
            text: "فشل في تحديد رقم المتجر",
          });
        }
        refetchStoreNumber();
      },
      onError: () => {
        setMsg({ type: "error", text: "حدث خطأ أثناء تحديد رقم المتجر" });
      },
    });

  // Effect to handle connection status updates from polling
  useEffect(() => {
    if (!statusData || !statusData.status) return;

    const { connected } = statusData.status;
    const { qr_code } = statusData;

    if (connected) {
      if (isConnecting || showQrDialog) {
        setIsConnecting(false);
        setShowQrDialog(false);
        setCurrentQrCode(null);
        setMsg({
          type: "success",
          text: "تم الاتصال بواتساب بنجاح",
        });
      }
      return;
    }

    if (isConnecting || showQrDialog) {
      if (qr_code && qr_code !== currentQrCode) {
        setCurrentQrCode(qr_code);
        if (!showQrDialog) {
          setShowQrDialog(true);
        }
        setMsg({
          type: "info",
          text: "امسح رمز QR باستخدام هاتفك لإتمام الاتصال",
        });
      }
    }
  }, [statusData, isConnecting, showQrDialog, currentQrCode, setMsg]);

  return {
    status: statusData?.status || { connected: false, phone_number: null },
    storeNumber: storeNumberData?.phone_number || null,
    statusLoading,
    isConnecting,
    showQrDialog,
    setShowQrDialog,
    qrCode: currentQrCode,
    configure,
    configureLoading,
    sendTestMessage: sendTestMessageMutation,
    testMessageLoading,
    setStoreNumber: setStoreNumberMutation,
    setStoreNumberLoading,
    refetchStatus,
    refetchStoreNumber,
  };
};

export default useWhatsApp;


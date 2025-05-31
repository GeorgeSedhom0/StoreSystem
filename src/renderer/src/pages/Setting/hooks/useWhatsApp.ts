import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useEffect, useState, useRef } from "react";
import { AlertMsg } from "../../Shared/AlertMessage";

// Types
export interface WhatsAppStatus {
  connected: boolean;
  authenticating?: boolean;
  phone_number: string | null;
  qr_code: string | null;
  qr_timestamp?: number;
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
  const lastQrTimestamp = useRef<number>(0);

  // Status query with polling
  const {
    data: statusData,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["whatsapp", "status"],
    queryFn: getWhatsAppStatus,
    // Poll more frequently when we're in connecting/authenticating state
    refetchInterval: 5000,
    retry: 1,
    initialData: {
      success: false,
      status: {
        connected: false,
        authenticating: false,
        phone_number: null,
        qr_code: null,
        qr_timestamp: 0,
      },
    },
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
      }
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        if (variables.action === "disconnect") {
          setIsConnecting(false);
          setShowQrDialog(false);
          setMsg({
            type: "success",
            text: "تم قطع الاتصال بنجاح",
          });
        } else {
          // For connect, just wait for polling to show QR or connection
          setMsg({
            type: "success",
            text: "جاري الاتصال بواتساب، انتظر للحصول على رمز QR",
          });
        }
      } else {
        setMsg({
          type: "error",
          text: data.message || "حدث خطأ أثناء تكوين واتساب",
        });
        setIsConnecting(false);
      }

      // Poll immediately after configuration
      refetchStatus();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ أثناء تكوين واتساب" });
      setIsConnecting(false);
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

  // Effect to handle QR code and connection status updates
  useEffect(() => {
    const status = statusData?.status;

    if (!status) return;

    // Check if we're connected
    if (status.connected) {
      if (isConnecting) {
        setIsConnecting(false);
        setShowQrDialog(false);

        // Show success message for successful connection
        setMsg({
          type: "success",
          text: "تم الاتصال بواتساب بنجاح",
        });
      }
    }
    // Check if authentication is in progress
    else if (status.authenticating) {
      setIsConnecting(true);

      // Show QR code if available and it's a new QR code
      if (
        status.qr_code &&
        status.qr_timestamp &&
        status.qr_timestamp > lastQrTimestamp.current
      ) {
        lastQrTimestamp.current = status.qr_timestamp;
        setShowQrDialog(true);
      }
    }
    // If not connected and not authenticating, reset state
    else if (isConnecting) {
      setIsConnecting(false);
      setShowQrDialog(false);
    }
  }, [statusData?.status, isConnecting, setMsg]);

  return {
    // Status data
    status: statusData?.status || {
      connected: false,
      authenticating: false,
      phone_number: null,
      qr_code: null,
      qr_timestamp: 0,
    },
    storeNumber: storeNumberData?.phone_number || null,
    statusLoading,
    isConnecting,

    // QR dialog control
    showQrDialog,
    setShowQrDialog,

    // Actions
    configure,
    configureLoading,
    sendTestMessage: sendTestMessageMutation,
    testMessageLoading,
    setStoreNumber: setStoreNumberMutation,
    setStoreNumberLoading,

    // Refresh functions
    refetchStatus,
    refetchStoreNumber,
  };
};

export default useWhatsApp;

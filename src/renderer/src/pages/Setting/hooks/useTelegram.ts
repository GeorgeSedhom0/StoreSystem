import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dispatch, SetStateAction } from "react";
import { AlertMsg } from "../../Shared/AlertMessage";

// Types
export interface TelegramStatus {
  connected: boolean;
  bot_username: string | null;
}

export interface TelegramConfigRequest {
  bot_token: string;
}

export interface TelegramTestMessageRequest {
  chat_id: string;
  message: string;
}

export interface TelegramStoreChatIdRequest {
  store_id: number;
  chat_id: string;
}

export interface TelegramUpdate {
  chat_id: string;
  username: string | null;
  first_name: string;
  last_name: string;
  type: string;
  title: string | null;
}

export interface TelegramApiResponse {
  success: boolean;
  message?: string;
  status?: TelegramStatus;
  chat_id?: string | null;
  bot_info?: { username: string; name: string };
  updates?: TelegramUpdate[];
}

// API Functions
const getTelegramStatus = async (): Promise<TelegramApiResponse> => {
  const { data } = await axios.get("/telegram/status");
  return data;
};

const configureTelegram = async (
  request: TelegramConfigRequest,
): Promise<TelegramApiResponse> => {
  const { data } = await axios.post("/telegram/configure", request);
  return data;
};

const sendTestMessageApi = async (
  request: TelegramTestMessageRequest,
): Promise<TelegramApiResponse> => {
  const { data } = await axios.post("/telegram/test-message", request);
  return data;
};

const setStoreChatIdApi = async (
  request: TelegramStoreChatIdRequest,
): Promise<TelegramApiResponse> => {
  const { data } = await axios.post("/telegram/store-chat-id", request);
  return data;
};

const getStoreChatId = async (
  store_id: number,
): Promise<TelegramApiResponse> => {
  const { data } = await axios.get(`/telegram/store-chat-id/${store_id}`);
  return data;
};

const getTelegramUpdates = async (): Promise<TelegramApiResponse> => {
  const { data } = await axios.get("/telegram/updates");
  return data;
};

const useTelegram = (
  setMsg: Dispatch<SetStateAction<AlertMsg>>,
  store_id?: number,
) => {
  // Status query
  const {
    data: statusData,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["telegram", "status"],
    queryFn: getTelegramStatus,
    initialData: {
      success: false,
      status: {
        connected: false,
        bot_username: null,
      },
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Store chat ID query
  const { data: storeChatIdData, refetch: refetchStoreChatId } = useQuery({
    queryKey: ["telegram", "store-chat-id", store_id],
    queryFn: () =>
      store_id !== undefined && store_id !== null
        ? getStoreChatId(store_id)
        : Promise.resolve({ success: false, chat_id: null }),
    retry: 1,
    enabled: store_id !== undefined && store_id !== null,
    initialData: { success: false, chat_id: null },
  });

  // Configure mutation
  const { mutate: configure, isPending: configureLoading } = useMutation({
    mutationFn: (request: TelegramConfigRequest) => configureTelegram(request),
    onSuccess: (data) => {
      if (data.success) {
        setMsg({
          type: "success",
          text: `تم تكوين البوت بنجاح: @${data.bot_info?.username}`,
        });
      } else {
        setMsg({
          type: "error",
          text: data.message || "رمز البوت غير صالح",
        });
      }
      refetchStatus();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ أثناء تكوين البوت" });
    },
  });

  // Send test message mutation
  const { mutate: sendTestMessage, isPending: testMessageLoading } =
    useMutation({
      mutationFn: sendTestMessageApi,
      onSuccess: (data) => {
        if (data.success) {
          setMsg({ type: "success", text: "تم إرسال الرسالة التجريبية بنجاح" });
        } else {
          setMsg({
            type: "error",
            text: data.message || "فشل في إرسال الرسالة التجريبية",
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

  // Set store chat ID mutation
  const { mutate: setStoreChatId, isPending: setStoreChatIdLoading } =
    useMutation({
      mutationFn: setStoreChatIdApi,
      onSuccess: (data) => {
        if (data.success) {
          setMsg({ type: "success", text: "تم حفظ معرف المحادثة بنجاح" });
        } else {
          setMsg({
            type: "error",
            text: "فشل في حفظ معرف المحادثة",
          });
        }
        refetchStoreChatId();
      },
      onError: () => {
        setMsg({ type: "error", text: "حدث خطأ أثناء حفظ معرف المحادثة" });
      },
    });

  // Fetch updates mutation
  const {
    mutate: fetchUpdates,
    isPending: updatesLoading,
    data: updatesData,
  } = useMutation({
    mutationFn: getTelegramUpdates,
    onSuccess: (data) => {
      if (data.success && data.updates && data.updates.length > 0) {
        setMsg({
          type: "success",
          text: `تم العثور على ${data.updates.length} محادثة`,
        });
      } else if (data.success) {
        setMsg({
          type: "info",
          text: "لم يتم العثور على محادثات. أرسل /start للبوت أولاً",
        });
      } else {
        setMsg({
          type: "error",
          text: "فشل في جلب المحادثات",
        });
      }
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ أثناء جلب المحادثات" });
    },
  });

  return {
    status: statusData?.status || { connected: false, bot_username: null },
    storeChatId: storeChatIdData?.chat_id || null,
    statusLoading,
    configure,
    configureLoading,
    sendTestMessage,
    testMessageLoading,
    setStoreChatId,
    setStoreChatIdLoading,
    fetchUpdates,
    updatesLoading,
    updates: updatesData?.updates || [],
    refetchStatus,
    refetchStoreChatId,
  };
};

export default useTelegram;

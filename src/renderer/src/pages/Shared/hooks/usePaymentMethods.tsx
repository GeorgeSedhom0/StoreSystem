import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dispatch, SetStateAction } from "react";
import { PaymentMethod } from "../../utils/types";
import { AlertMsg } from "../AlertMessage";

const getPaymentMethods = async () => {
  const { data } = await axios.get<PaymentMethod[]>("/payment-methods");
  return data;
};

const addPaymentMethod = async (name: string) => {
  const { data } = await axios.post<{ id: number }>("/payment-methods", null, {
    params: { name },
  });
  return data.id;
};

const updatePaymentMethod = async ({
  id,
  name,
  homeStoreId,
}: {
  id: number;
  name: string;
  homeStoreId?: number | null;
}) => {
  await axios.put("/payment-methods", null, {
    params: {
      id,
      name,
      home_store_id: homeStoreId == null ? undefined : homeStoreId,
    },
  });
};

/**
 * CRUD hook for payment methods. Pass a setMsg from a parent AlertMessage to get
 * success/error feedback; omit it (or pass a noop) for read-only consumers.
 */
const usePaymentMethods = (setMsg?: Dispatch<SetStateAction<AlertMsg>>) => {
  const notify = (msg: AlertMsg) => {
    if (setMsg) setMsg(msg);
  };

  const {
    data: paymentMethods,
    refetch: refetchPaymentMethods,
    isLoading: isPaymentMethodsLoading,
  } = useQuery({
    queryKey: ["paymentMethods"],
    queryFn: getPaymentMethods,
    initialData: [],
  });

  const {
    mutate: addPaymentMethodMutation,
    mutateAsync: addPaymentMethodMutationAsync,
    isPending: addPaymentMethodLoading,
  } = useMutation({
    mutationFn: addPaymentMethod,
    onSuccess: () => {
      notify({ type: "success", text: "تم اضافة طريقة الدفع بنجاح" });
      refetchPaymentMethods();
    },
    onError: (error: any) => {
      notify({
        type: "error",
        text:
          error?.response?.data?.detail || "حدث خطأ اثناء اضافة طريقة الدفع",
      });
    },
  });

  const { mutate: updatePaymentMethodMutation, isPending: updatePaymentMethodLoading } =
    useMutation({
      mutationFn: updatePaymentMethod,
      onSuccess: () => {
        notify({ type: "success", text: "تم تعديل طريقة الدفع بنجاح" });
        refetchPaymentMethods();
      },
      onError: (error: any) => {
        notify({
          type: "error",
          text:
            error?.response?.data?.detail || "حدث خطأ اثناء تعديل طريقة الدفع",
        });
      },
    });

  return {
    paymentMethods,
    refetchPaymentMethods,
    isPaymentMethodsLoading,
    addPaymentMethodMutation,
    addPaymentMethodMutationAsync,
    addPaymentMethodLoading,
    updatePaymentMethodMutation,
    updatePaymentMethodLoading,
  };
};

export default usePaymentMethods;

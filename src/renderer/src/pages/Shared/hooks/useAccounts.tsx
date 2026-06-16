import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dispatch, SetStateAction } from "react";
import { Account, AccountTransaction } from "../../utils/types";
import { AlertMsg } from "../AlertMessage";

interface AccountsResponse {
  accounts: Account[];
  total: number;
}

const getAccounts = async (storeId: number) => {
  const { data } = await axios.get<AccountsResponse>("/accounts", {
    params: { store_id: storeId },
  });
  return data;
};

export const getAccountTransactions = async (
  storeId: number,
  paymentMethodId: number,
): Promise<AccountTransaction[]> => {
  const { data } = await axios.get<AccountTransaction[]>(
    "/account-transactions",
    { params: { store_id: storeId, payment_method_id: paymentMethodId } },
  );
  return data;
};

interface AmountOp {
  paymentMethodId: number;
  amount: number;
  description?: string;
}

const useAccounts = (
  storeId: number,
  setMsg?: Dispatch<SetStateAction<AlertMsg>>,
) => {
  const notify = (msg: AlertMsg) => {
    if (setMsg) setMsg(msg);
  };

  const {
    data,
    refetch: refetchAccounts,
    isLoading: isAccountsLoading,
  } = useQuery({
    queryKey: ["accounts", storeId],
    queryFn: () => getAccounts(storeId),
    initialData: { accounts: [], total: 0 },
  });

  const onErr = (fallback: string) => (error: any) =>
    notify({
      type: "error",
      text: error?.response?.data?.detail || fallback,
    });

  const deposit = useMutation({
    mutationFn: async ({ paymentMethodId, amount, description }: AmountOp) => {
      await axios.post("/account/deposit", null, {
        params: {
          store_id: storeId,
          payment_method_id: paymentMethodId,
          amount,
          description,
          time: new Date().toLocaleString(),
        },
      });
    },
    onSuccess: () => {
      notify({ type: "success", text: "تم إيداع المبلغ بنجاح" });
      refetchAccounts();
    },
    onError: onErr("تعذر تنفيذ الإيداع"),
  });

  const payout = useMutation({
    mutationFn: async ({ paymentMethodId, amount, description }: AmountOp) => {
      await axios.post("/account/payout", null, {
        params: {
          store_id: storeId,
          payment_method_id: paymentMethodId,
          amount,
          description,
          time: new Date().toLocaleString(),
        },
      });
    },
    onSuccess: () => {
      notify({ type: "success", text: "تم سحب المبلغ بنجاح" });
      refetchAccounts();
    },
    onError: onErr("تعذر تنفيذ السحب"),
  });

  const reconcile = useMutation({
    mutationFn: async ({
      paymentMethodId,
      actualAmount,
      description,
    }: {
      paymentMethodId: number;
      actualAmount: number;
      description?: string;
    }) => {
      await axios.post("/account/reconcile", null, {
        params: {
          store_id: storeId,
          payment_method_id: paymentMethodId,
          actual_amount: actualAmount,
          description,
          time: new Date().toLocaleString(),
        },
      });
    },
    onSuccess: () => {
      notify({ type: "success", text: "تم تسوية الحساب بنجاح" });
      refetchAccounts();
    },
    onError: onErr("تعذر تنفيذ التسوية"),
  });

  const transfer = useMutation({
    mutationFn: async ({
      fromMethodId,
      toMethodId,
      amount,
      description,
    }: {
      fromMethodId: number;
      toMethodId: number;
      amount: number;
      description?: string;
    }) => {
      await axios.post("/account/transfer", null, {
        params: {
          store_id: storeId,
          from_method_id: fromMethodId,
          to_method_id: toMethodId,
          amount,
          description,
          time: new Date().toLocaleString(),
        },
      });
    },
    onSuccess: () => {
      notify({ type: "success", text: "تم التحويل بنجاح" });
      refetchAccounts();
    },
    onError: onErr("تعذر تنفيذ التحويل"),
  });

  return {
    accounts: data.accounts,
    total: data.total,
    isAccountsLoading,
    refetchAccounts,
    deposit,
    payout,
    reconcile,
    transfer,
  };
};

export default useAccounts;

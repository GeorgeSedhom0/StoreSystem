import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dispatch, SetStateAction } from "react";
import { Account, AccountTransaction } from "../../utils/types";
import { AlertMsg } from "../AlertMessage";
import { localTimestamp } from "../../utils/functions";

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

export interface StoreBalance {
  store_id: number;
  name: string;
  balance: number; // > 0 => this store owes the other; < 0 => the other owes this store
}

const getStoreBalances = async (storeId: number) => {
  const { data } = await axios.get<StoreBalance[]>("/store-balances", {
    params: { store_id: storeId },
  });
  return data;
};

export const getAccountTransactions = async (
  storeId: number,
  paymentMethodId: number,
  limit: number,
  offset: number,
): Promise<{ transactions: AccountTransaction[]; total: number }> => {
  const { data } = await axios.get<{
    transactions: AccountTransaction[];
    total: number;
  }>("/account-transactions", {
    params: {
      store_id: storeId,
      payment_method_id: paymentMethodId,
      limit,
      offset,
    },
  });
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
          time: localTimestamp(),
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
          time: localTimestamp(),
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
          time: localTimestamp(),
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
          time: localTimestamp(),
        },
      });
    },
    onSuccess: () => {
      notify({ type: "success", text: "تم التحويل بنجاح" });
      refetchAccounts();
    },
    onError: onErr("تعذر تنفيذ التحويل"),
  });

  const { data: storeBalances = [], refetch: refetchStoreBalances } = useQuery({
    queryKey: ["store-balances", storeId],
    queryFn: () => getStoreBalances(storeId),
    initialData: [],
  });

  const storeTransfer = useMutation({
    mutationFn: async ({
      fromStoreId,
      toStoreId,
      amount,
      fromPaymentMethodId,
      toPaymentMethodId,
      description,
    }: {
      fromStoreId: number;
      toStoreId: number;
      amount: number;
      fromPaymentMethodId?: number | "";
      toPaymentMethodId?: number | "";
      description?: string;
    }) => {
      await axios.post("/store-transfer", null, {
        params: {
          from_store_id: fromStoreId,
          to_store_id: toStoreId,
          amount,
          from_payment_method_id:
            fromPaymentMethodId === "" ? undefined : fromPaymentMethodId,
          to_payment_method_id:
            toPaymentMethodId === "" ? undefined : toPaymentMethodId,
          description,
          time: localTimestamp(),
        },
      });
    },
    onSuccess: () => {
      notify({ type: "success", text: "تم تنفيذ التحويل بين المتاجر بنجاح" });
      refetchAccounts();
      refetchStoreBalances();
    },
    onError: onErr("تعذر تنفيذ التحويل بين المتاجر"),
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
    storeBalances,
    refetchStoreBalances,
    storeTransfer,
  };
};

export default useAccounts;

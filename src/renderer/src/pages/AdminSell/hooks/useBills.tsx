import axios from "axios";
import { useMutation } from "@tanstack/react-query";

interface CreateBillParams {
  bill: any;
  billPayment: string;
  newPartyId: number | null;
  paid: number;
  installments: number;
  installmentInterval: number;
  storeId: number;
}

const addBill = async ({
  bill,
  billPayment,
  newPartyId,
  paid,
  installments,
  installmentInterval,
  storeId,
}: CreateBillParams) => {
  const { data } = await axios.post("/bill", bill, {
    params: {
      move_type: billPayment,
      store_id: storeId,
      party_id: newPartyId,
      paid: paid,
      installments: installments,
      installment_interval: installmentInterval,
    },
    
  });

  return data;
};

const useBills = () => {
  const {
    mutateAsync: createBill,
    isPending: isCreatingBill,
    isError: isCreateBillError,
  } = useMutation({
    mutationFn: addBill,
  });

  return {
    createBill,
    isCreatingBill,
    isCreateBillError,
  };
};

export default useBills;

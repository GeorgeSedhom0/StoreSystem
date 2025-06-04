import axios from "axios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dispatch, SetStateAction } from "react";
import { Party } from "../../utils/types";
import { AlertMsg } from "../AlertMessage";

const getParties = async () => {
  const { data } = await axios.get<Party[]>("/parties");
  return data;
};

const addParty = async (party: Party) => {
  const { data } = await axios.post<{ id: number }>("/party", party);
  return data.id;
};

const updateParty = async (party: Party) => {
  await axios.put("/party", party, {
    params: { party_id: party.id },
  });
};

const deleteParty = async (partyId: number) => {
  await axios.delete("/party", {
    params: { party_id: partyId },
  });
};

const useParties = (setMsg: Dispatch<SetStateAction<AlertMsg>>) => {
  const { data: parties, refetch: refetchParties } = useQuery({
    queryKey: ["parties"],
    queryFn: getParties,
    initialData: [],
  });

  const {
    mutate: addPartyMutation,
    mutateAsync: addPartyMutationAsync,
    isPending: addPartyLoading,
  } = useMutation({
    mutationFn: addParty,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم اضافة العميل او المورد بنجاح" });
      refetchParties();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ اثناء اضافة العميل او المورد" });
    },
  });

  const { mutate: updatePartyMutation, isPending: updatePartyLoading } =
    useMutation({
      mutationFn: updateParty,
      onSuccess: () => {
        setMsg({ type: "success", text: "تم تعديل العميل او المورد بنجاح" });
        refetchParties();
      },
      onError: () => {
        setMsg({ type: "error", text: "حدث خطأ اثناء تعديل العميل او المورد" });
      },
    });

  const { mutate: deletePartyMutation, isPending: deletePartyLoading } =
    useMutation({
      mutationFn: deleteParty,
      onSuccess: () => {
        setMsg({ type: "success", text: "تم حذف العميل او المورد بنجاح" });
        refetchParties();
      },
      onError: () => {
        setMsg({ type: "error", text: "حدث خطأ اثناء حذف العميل او المورد" });
      },
    });

  return {
    parties,
    addPartyMutation,
    addPartyMutationAsync,
    addPartyLoading,
    updatePartyMutation,
    updatePartyLoading,
    deletePartyMutation,
    deletePartyLoading,
  };
};

export default useParties;

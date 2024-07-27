import axios from "axios";
import { Party } from "../types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertMsg } from "../../pages/Shared/AlertMessage";
import { Dispatch, SetStateAction } from "react";

const getParties = async () => {
  const { data } = await axios.get<Party[]>(
    import.meta.env.VITE_SERVER_URL + "/parties"
  );
  return data;
};

const addParty = async (party: Party) => {
  const { data } = await axios.post<{ id: number }>(
    import.meta.env.VITE_SERVER_URL + "/party",
    party
  );
  return data.id;
};

const updateParty = async (party: Party) => {
  await axios.put(import.meta.env.VITE_SERVER_URL + "/party", party, {
    params: { party_id: party.id },
  });
};

const deleteParty = async (partyId: number) => {
  await axios.delete(import.meta.env.VITE_SERVER_URL + "/party", {
    params: { party_id: partyId },
  });
};

export const useParties = (
  setMsg: Dispatch<SetStateAction<AlertMsg>>,
  filter: (_: Party[]) => Party[] = (data) => data
) => {
  const { data: parties, refetch: refetchParties } = useQuery({
    queryKey: ["parties"],
    queryFn: getParties,
    initialData: [],
    select: (data: Party[]) => filter(data),
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

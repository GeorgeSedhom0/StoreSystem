import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useContext } from "react";
import { StoreContext } from "@renderer/StoreDataProvider";

interface Shift {
  start_date_time: string;
  end_date_time: string;
}

const getShift = async (storeId: number) => {
  const { data } = await axios.get<Shift>("/current-shift", {
    params: {
      store_id: storeId,
    },
  });
  if (data.start_date_time) {
    return data.start_date_time;
  } else {
    throw new Error("No shift opened");
  }
};

export const useShift = () => {
  const { storeId } = useContext(StoreContext);
  const {
    data: shift,
    isLoading: isShiftLoading,
    isError: isShiftError,
  } = useQuery({
    queryKey: ["shift"],
    queryFn: () => getShift(storeId),
    initialData: "",
    retry: false,
  });

  return {
    shift,
    isShiftLoading,
    isShiftError,
  };
};

import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface Shift {
  start_date_time: string;
  end_date_time: string;
}

const getShift = async () => {
  const { data } = await axios.get<Shift>("/current-shift", {
    params: {
      store_id: import.meta.env.VITE_STORE_ID,
    },
  });
  if (data.start_date_time) {
    return data.start_date_time;
  } else {
    throw new Error("No shift opened");
  }
};

export const useShift = () => {
  const {
    data: shift,
    isLoading: isShiftLoading,
    isError: isShiftError,
  } = useQuery({
    queryKey: ["shift"],
    queryFn: getShift,
    initialData: "",
    retry: false,
  });

  return {
    shift,
    isShiftLoading,
    isShiftError,
  };
};

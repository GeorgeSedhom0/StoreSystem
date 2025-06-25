import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { StoreData } from "../../utils/types";

const getStores = async (): Promise<StoreData[]> => {
  const { data } = await axios.get<StoreData[]>("/admin/stores-data");
  return data;
};

export const useStores = () => {
  const {
    data: stores,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stores"],
    queryFn: getStores,
  });

  return {
    stores: stores || [],
    isLoading,
    error,
  };
};

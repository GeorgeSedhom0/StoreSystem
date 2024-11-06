import axios from "axios";
import { DBProducts } from "../../../utils/types";
import { useQuery } from "@tanstack/react-query";

const getProducts = async ({ queryKey }: { queryKey: [string, boolean] }) => {
  const { data } = await axios.get<DBProducts>(
    import.meta.env.VITE_SERVER_URL + "/products",
    {
      params: { is_deleted: queryKey[1] },
    }
  );
  return data;
};

const useProducts = (getDeleted: boolean = false) => {
  const {
    data: products,
    isLoading,
    refetch: updateProducts,
  } = useQuery({
    queryKey: ["products", getDeleted],
    queryFn: getProducts,
    initialData: { products: [], reserved_products: [] },
  });

  return {
    products: products.products,
    reservedProducts: products.reserved_products,
    isLoading,
    updateProducts,
  };
};

export default useProducts;

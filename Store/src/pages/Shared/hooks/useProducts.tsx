import axios from "axios";
import { DBProducts } from "../../../utils/types";
import { useQuery } from "@tanstack/react-query";

const getProducts = async () => {
  const { data } = await axios.get<DBProducts>(
    import.meta.env.VITE_SERVER_URL + "/products"
  );
  return data;
};

const useProducts = () => {
  const {
    data: products,
    isLoading,
    refetch: updateProducts,
  } = useQuery({
    queryKey: ["products"],
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

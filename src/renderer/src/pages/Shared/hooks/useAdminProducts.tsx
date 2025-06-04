import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { DBAdminProducts } from "../../utils/types";

const getAdminProducts = async ({}) => {
  const { data } = await axios.get<DBAdminProducts>("/admin/products");
  return data;
};

const useAdminProducts = () => {
  const {
    data: products,
    isLoading,
    refetch: updateProducts,
  } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: getAdminProducts,
    initialData: { products: [], reserved_products: {} },
  });

  return {
    products: products.products,
    reservedProducts: products.reserved_products,
    isLoading,
    updateProducts,
  };
};

export default useAdminProducts;

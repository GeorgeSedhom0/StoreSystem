import axios from "axios";
import { DBProducts } from "../../utils/types";
import { useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { StoreContext } from "@renderer/StoreDataProvider";

const getProducts = async ({
  queryKey,
}: {
  queryKey: [string, boolean, number];
}) => {
  const storeId = queryKey[2];
  const { data } = await axios.get<DBProducts>("/products", {
    params: {
      is_deleted: queryKey[1],
      store_id: storeId,
    },
  });
  return data;
};

const useProducts = (getDeleted: boolean = false) => {
  const { storeId } = useContext(StoreContext);
  const {
    data: products,
    isLoading,
    refetch: updateProducts,
  } = useQuery({
    queryKey: ["products", getDeleted, storeId],
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

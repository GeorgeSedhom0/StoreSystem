import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ProductRequest } from "../../utils/types";

const getProductRequests = async (
  storeId: number,
): Promise<ProductRequest[]> => {
  const { data } = await axios.get<ProductRequest[]>(
    `/product-requests?store_id=${storeId}`,
  );
  return data;
};

const createProductRequest = async (request: {
  requested_store_id: number;
  items: { product_id: number; requested_quantity: number }[];
}) => {
  const { data } = await axios.post("/product-requests", request);
  return data;
};

const updateProductRequest = async ({
  requestId,
  status,
}: {
  requestId: number;
  status: string;
}) => {
  const { data } = await axios.put(`/product-requests/${requestId}`, {
    status,
  });
  return data;
};

const updateProductRequestItem = async ({
  requestId,
  itemId,
  status,
}: {
  requestId: number;
  itemId: number;
  status: string;
}) => {
  const { data } = await axios.put(
    `/product-requests/${requestId}/items/${itemId}`,
    { status },
  );
  return data;
};

export const useProductRequests = (storeId: number) => {
  const queryClient = useQueryClient();

  const {
    data: requests,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["product-requests", storeId],
    queryFn: () => getProductRequests(storeId),
    enabled: !!storeId,
  });

  const createRequestMutation = useMutation({
    mutationFn: createProductRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-requests", storeId],
      });
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: updateProductRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-requests", storeId],
      });
    },
  });

  const updateRequestItemMutation = useMutation({
    mutationFn: updateProductRequestItem,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-requests", storeId],
      });
    },
  });

  return {
    requests: requests || [],
    isLoading,
    error,
    refetch,
    createRequest: createRequestMutation.mutateAsync,
    updateRequest: updateRequestMutation.mutateAsync,
    updateRequestItem: updateRequestItemMutation.mutateAsync,
    isCreating: createRequestMutation.isPending,
    isUpdating: updateRequestMutation.isPending,
    isUpdatingItem: updateRequestItemMutation.isPending,
  };
};

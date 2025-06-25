import { useState, useContext, useMemo } from "react";
import { Box, Typography, Paper, Tabs, Tab } from "@mui/material";
import { StoreContext } from "../../StoreDataProvider";
import { useProductRequests } from "./hooks/useProductRequests";
import { useStores } from "./hooks/useStores";
import CreateRequest from "./components/CreateRequest";
import IncomingRequests from "./components/IncomingRequests";
import OutgoingRequests from "./components/OutgoingRequests";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";

const RequestProducts = () => {
  const { storeId } = useContext(StoreContext);
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  // Use custom hooks
  const { stores } = useStores();
  const {
    requests,
    createRequest,
    updateRequest,
    updateRequestItem,
    isCreating,
    isUpdating,
    isUpdatingItem,
  } = useProductRequests(storeId);

  // Handle request creation
  const handleCreateRequest = async (request: {
    requested_store_id: number;
    items: { product_id: number; requested_quantity: number }[];
  }) => {
    try {
      await createRequest(request);
      setMsg({ type: "success", text: "تم إرسال الطلب بنجاح" });
    } catch (error) {
      setMsg({ type: "error", text: "فشل في إرسال الطلب" });
    }
  };

  // Handle request updates
  const handleUpdateRequest = async (requestId: number, status: string) => {
    try {
      await updateRequest({ requestId, status });
      setMsg({ type: "success", text: "تم تحديث الطلب بنجاح" });
    } catch (error) {
      setMsg({ type: "error", text: "فشل في تحديث الطلب" });
    }
  };

  // Handle request item updates
  const handleUpdateRequestItem = async (
    requestId: number,
    itemId: number,
    status: string,
  ) => {
    try {
      await updateRequestItem({ requestId, itemId, status });
      setMsg({ type: "success", text: "تم تحديث المنتج بنجاح" });
    } catch (error) {
      setMsg({ type: "error", text: "فشل في تحديث المنتج" });
    }
  };

  // Filter requests
  const incomingRequests = useMemo(
    () => requests.filter((req) => req.requested_store_id === storeId),
    [requests, storeId],
  );

  const outgoingRequests = useMemo(
    () => requests.filter((req) => req.requesting_store_id === storeId),
    [requests, storeId],
  );

  return (
    <Box>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Typography
        variant="h4"
        gutterBottom
        sx={{ fontWeight: "bold", color: "primary.main" }}
      >
        طلب المنتجات
      </Typography>
      <Paper sx={{ p: 3, borderRadius: 2, boxShadow: 3 }}>
        <Tabs value={tab} onChange={(_, newValue) => setTab(newValue)}>
          <Tab label="إنشاء طلب جديد" />
          <Tab label={`الطلبات الواردة (${incomingRequests.length})`} />
          <Tab label={`الطلبات الصادرة (${outgoingRequests.length})`} />
        </Tabs>

        {tab === 0 && (
          <CreateRequest
            stores={stores}
            onSubmit={handleCreateRequest}
            isSubmitting={isCreating}
          />
        )}

        {tab === 1 && (
          <IncomingRequests
            requests={incomingRequests}
            onUpdateRequest={handleUpdateRequest}
            isUpdating={isUpdating}
          />
        )}

        {tab === 2 && (
          <OutgoingRequests
            requests={outgoingRequests}
            onUpdateRequest={handleUpdateRequest}
            onUpdateRequestItem={handleUpdateRequestItem}
            isUpdating={isUpdating}
            isUpdatingItem={isUpdatingItem}
          />
        )}
      </Paper>
    </Box>
  );
};

export default RequestProducts;

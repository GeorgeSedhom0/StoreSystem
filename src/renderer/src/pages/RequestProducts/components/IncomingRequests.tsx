import { Box, Typography, Paper, Button } from "@mui/material";
import { ProductRequest } from "../../utils/types";
import { useNavigate } from "react-router-dom";

interface IncomingRequestsProps {
  requests: ProductRequest[];
  onUpdateRequest: (requestId: number, status: string) => Promise<void>;
  isUpdating: boolean;
}

const IncomingRequests = ({
  requests,
  onUpdateRequest,
  isUpdating,
}: IncomingRequestsProps) => {
  const navigate = useNavigate();

  const handleMoveProducts = (request: ProductRequest) => {
    navigate("/admin/move-products", { state: { request } });
  };

  return (
    <Box sx={{ mt: 3 }}>
      {requests.length === 0 ? (
        <Typography
          variant="h6"
          color="text.secondary"
          align="center"
          sx={{
            py: 4,
            fontWeight: "medium",
            backgroundColor: "grey.50",
            borderRadius: 2,
            border: "2px dashed",
            borderColor: "grey.300",
          }}
        >
          لا توجد طلبات واردة
        </Typography>
      ) : (
        requests.map((req) => (
          <Paper
            key={req.id}
            sx={{ p: 3, mb: 3, borderRadius: 2, boxShadow: 2 }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: "bold",
                color: "primary.main",
                mb: 1,
              }}
            >
              طلب من: {req.requesting_store_name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              الحالة:{" "}
              {req.status === "pending"
                ? "قيد الانتظار"
                : req.status === "sent"
                  ? "تم الإرسال"
                  : req.status}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              التاريخ: {new Date(req.created_at).toLocaleDateString("ar-SA")}
            </Typography>

            <Box
              sx={{
                mt: 2,
                p: 2,
                backgroundColor: "grey.50",
                borderRadius: 1,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: "bold", mb: 1 }}
              >
                المنتجات المطلوبة:
              </Typography>
              {req.items.map((item) => (
                <Typography key={item.id} variant="body2" sx={{ mb: 0.5 }}>
                  • {item.product_name} - الكمية: {item.requested_quantity}
                </Typography>
              ))}
            </Box>

            {req.status === "pending" && (
              <Box sx={{ mt: 3, display: "flex", gap: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => handleMoveProducts(req)}
                  sx={{ minWidth: "120px" }}
                >
                  نقل المنتجات
                </Button>
                <Button
                  variant="contained"
                  onClick={() => onUpdateRequest(req.id, "sent")}
                  disabled={isUpdating}
                  sx={{ minWidth: "120px" }}
                >
                  تحديد كمرسل
                </Button>
              </Box>
            )}
          </Paper>
        ))
      )}
    </Box>
  );
};

export default IncomingRequests;

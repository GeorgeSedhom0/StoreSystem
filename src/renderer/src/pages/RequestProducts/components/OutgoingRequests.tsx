import { Box, Typography, Paper, Button, IconButton } from "@mui/material";
import { Check, Close } from "@mui/icons-material";
import { ProductRequest } from "../../utils/types";

interface OutgoingRequestsProps {
  requests: ProductRequest[];
  onUpdateRequest: (requestId: number, status: string) => Promise<void>;
  onUpdateRequestItem: (
    requestId: number,
    itemId: number,
    status: string,
  ) => Promise<void>;
  isUpdating: boolean;
  isUpdatingItem: boolean;
}

const OutgoingRequests = ({
  requests,
  onUpdateRequest,
  onUpdateRequestItem,
  isUpdating,
  isUpdatingItem,
}: OutgoingRequestsProps) => {
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
          لا توجد طلبات صادرة
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
              طلب إلى: {req.requested_store_name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              الحالة:{" "}
              {req.status === "pending"
                ? "قيد الانتظار"
                : req.status === "sent"
                  ? "تم الإرسال"
                  : req.status === "received"
                    ? "تم الاستلام"
                    : req.status}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              التاريخ: {new Date(req.created_at).toLocaleDateString("ar-SA")}
            </Typography>

            {req.status === "sent" && (
              <Button
                variant="contained"
                onClick={() => onUpdateRequest(req.id, "received")}
                disabled={isUpdating}
                sx={{ mt: 1, mb: 2 }}
              >
                تحديد كمستلم
              </Button>
            )}

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
                المنتجات:
              </Typography>
              {req.items.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mt: 1,
                    p: 1,
                  }}
                >
                  <Typography sx={{ flexGrow: 1 }} variant="body2">
                    {item.product_name} - الكمية: {item.requested_quantity}
                    {item.status !== "pending" && (
                      <Typography
                        component="span"
                        variant="caption"
                        color={
                          item.status === "accepted"
                            ? "success.main"
                            : "error.main"
                        }
                        sx={{ ml: 1, fontWeight: "bold" }}
                      >
                        (
                        {item.status === "accepted"
                          ? "مقبول"
                          : item.status === "rejected"
                            ? "مرفوض"
                            : item.status}
                        )
                      </Typography>
                    )}
                  </Typography>
                  {req.status === "received" && item.status === "pending" && (
                    <Box>
                      <IconButton
                        color="success"
                        onClick={() =>
                          onUpdateRequestItem(req.id, item.id, "accepted")
                        }
                        disabled={isUpdatingItem}
                        size="small"
                        sx={{ mr: 1 }}
                      >
                        <Check />
                      </IconButton>
                      <IconButton
                        color="error"
                        onClick={() =>
                          onUpdateRequestItem(req.id, item.id, "rejected")
                        }
                        disabled={isUpdatingItem}
                        size="small"
                      >
                        <Close />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Paper>
        ))
      )}
    </Box>
  );
};

export default OutgoingRequests;

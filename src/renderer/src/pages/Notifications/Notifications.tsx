import { useState, useContext } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Button,
  Tabs,
  Tab,
  Chip,
  Tooltip,
  CircularProgress,
  Alert,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import MarkEmailUnreadIcon from "@mui/icons-material/MarkEmailUnread";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../../StoreDataProvider";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import useConfirm from "../Shared/useConfirm";
import { apiError } from "../utils/errors";

interface Notification {
  id: number;
  store_id: number;
  title: string;
  content: string;
  type: string;
  reference_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

const getNotifications = async (
  storeId: number,
  includeRead: boolean = true,
) => {
  const { data } = await axios.get<NotificationsResponse>("/notifications", {
    params: { store_id: storeId, include_read: includeRead },
  });
  return data;
};

const markAsRead = async (notificationId: number, storeId: number) => {
  await axios.put(`/notifications/${notificationId}/read`, null, {
    params: { store_id: storeId },
  });
};

const markAsUnread = async (notificationId: number, storeId: number) => {
  await axios.put(`/notifications/${notificationId}/unread`, null, {
    params: { store_id: storeId },
  });
};

const markAllAsRead = async (storeId: number) => {
  await axios.put("/notifications/read-all", null, {
    params: { store_id: storeId },
  });
};

const deleteNotification = async (notificationId: number, storeId: number) => {
  await axios.delete(`/notifications/${notificationId}`, {
    params: { store_id: storeId },
  });
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getNotificationTypeColor = (type: string) => {
  switch (type) {
    case "expiration":
      return "warning";
    case "alert":
      return "error";
    case "info":
      return "info";
    case "restock":
      return "primary";
    default:
      return "default";
  }
};

const getNotificationTypeLabel = (type: string) => {
  switch (type) {
    case "expiration":
      return "صلاحية";
    case "alert":
      return "تنبيه";
    case "info":
      return "معلومة";
    case "restock":
      return "طلب بضاعة";
    default:
      return "عام";
  }
};

const Notifications = () => {
  const { storeId } = useContext(StoreContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tabValue, setTabValue] = useState(0);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [confirm, confirmDialog] = useConfirm();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
    queryClient.invalidateQueries({ queryKey: ["notificationsPreview"] });
  };
  const onError = (e: unknown) =>
    setMsg({ type: "error", text: apiError(e, "تعذر تنفيذ العملية") });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications", storeId],
    queryFn: () => getNotifications(storeId, true),
    enabled: !!storeId,
  });

  const { mutate: markRead } = useMutation({
    mutationFn: (notificationId: number) => markAsRead(notificationId, storeId),
    onSuccess: invalidate,
    onError,
  });

  const { mutate: markUnread } = useMutation({
    mutationFn: (notificationId: number) =>
      markAsUnread(notificationId, storeId),
    onSuccess: invalidate,
    onError,
  });

  const { mutate: markAllRead } = useMutation({
    mutationFn: () => markAllAsRead(storeId),
    onSuccess: invalidate,
    onError,
  });

  const { mutate: removeNotification } = useMutation({
    mutationFn: (notificationId: number) =>
      deleteNotification(notificationId, storeId),
    onSuccess: invalidate,
    onError,
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unread_count || 0;

  const filteredNotifications =
    tabValue === 0 ? notifications : notifications.filter((n) => !n.is_read);

  const askDelete = async (id: number, title: string) => {
    const ok = await confirm({
      title: "حذف الإشعار؟",
      message: title,
      confirmText: "حذف",
      danger: true,
    });
    if (ok) removeNotification(id);
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ p: { xs: 0, md: 3 } }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          }
        >
          تعذر تحميل الإشعارات
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 0, md: 3 } }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      {confirmDialog}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          mb: { xs: 2, md: 3 },
        }}
      >
        <Typography
          variant="h4"
          fontWeight="bold"
          sx={{ fontSize: { xs: "1.5rem", md: "2.125rem" } }}
        >
          الإشعارات
        </Typography>
        {unreadCount > 0 && (
          <Button
            variant="outlined"
            startIcon={<MarkEmailReadIcon />}
            onClick={() => markAllRead()}
            sx={{ minHeight: 40 }}
          >
            تحديد الكل كمقروء
          </Button>
        )}
      </Box>

      <Tabs
        value={tabValue}
        onChange={(_, newValue) => setTabValue(newValue)}
        variant="fullWidth"
        sx={{ mb: { xs: 2, md: 3 }, maxWidth: { md: 420 } }}
      >
        <Tab label={`الكل (${notifications.length})`} />
        <Tab label={`غير مقروء (${unreadCount})`} />
      </Tabs>

      {filteredNotifications.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            bgcolor: "background.paper",
            borderRadius: 2,
          }}
        >
          <WarningAmberIcon
            sx={{ fontSize: 64, color: "text.disabled", mb: 2 }}
          />
          <Typography variant="h6" color="text.secondary">
            {tabValue === 0 ? "لا توجد إشعارات" : "لا توجد إشعارات غير مقروءة"}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {filteredNotifications.map((notification) => (
            <Card
              key={notification.id}
              sx={{
                bgcolor: notification.is_read
                  ? "background.paper"
                  : "action.hover",
                borderInlineStart: notification.is_read ? "none" : 4,
                borderColor: "primary.main",
              }}
            >
              <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 1,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="h6"
                        fontWeight={notification.is_read ? "normal" : "bold"}
                        sx={{
                          fontSize: { xs: "1.05rem", md: "1.25rem" },
                          wordBreak: "break-word",
                        }}
                      >
                        {notification.title}
                      </Typography>
                      <Chip
                        label={getNotificationTypeLabel(notification.type)}
                        color={
                          getNotificationTypeColor(notification.type) as any
                        }
                        size="small"
                      />
                    </Box>
                    <Typography
                      variant="body1"
                      color="text.secondary"
                      sx={{
                        whiteSpace: "pre-line",
                        mb: 2,
                        wordBreak: "break-word",
                      }}
                    >
                      {notification.content}
                    </Typography>
                    {notification.type === "restock" &&
                      notification.reference_id && (
                        <Button
                          size="small"
                          variant="outlined"
                          sx={{ mb: 2 }}
                          onClick={() =>
                            navigate(
                              `/restock-requests?id=${notification.reference_id}`,
                            )
                          }
                        >
                          فتح الطلب #{notification.reference_id}
                        </Button>
                      )}
                    <Typography variant="caption" color="text.disabled">
                      {formatDate(notification.created_at)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 1 }}>
                    <Tooltip
                      title={
                        notification.is_read
                          ? "تحديد كغير مقروء"
                          : "تحديد كمقروء"
                      }
                    >
                      <IconButton
                        aria-label={
                          notification.is_read
                            ? "تحديد كغير مقروء"
                            : "تحديد كمقروء"
                        }
                        onClick={() =>
                          notification.is_read
                            ? markUnread(notification.id)
                            : markRead(notification.id)
                        }
                      >
                        {notification.is_read ? (
                          <MarkEmailUnreadIcon />
                        ) : (
                          <MarkEmailReadIcon />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="حذف">
                      <IconButton
                        color="error"
                        aria-label="حذف"
                        onClick={() =>
                          askDelete(notification.id, notification.title)
                        }
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                {/* Phones: labelled buttons instead of hover-only tooltips. */}
                <Box
                  sx={{
                    display: { xs: "flex", sm: "none" },
                    gap: 1,
                    mt: 1,
                    "& .MuiButton-root": { flex: 1, minHeight: 40 },
                  }}
                >
                  <Button
                    variant="outlined"
                    startIcon={
                      notification.is_read ? (
                        <MarkEmailUnreadIcon />
                      ) : (
                        <MarkEmailReadIcon />
                      )
                    }
                    onClick={() =>
                      notification.is_read
                        ? markUnread(notification.id)
                        : markRead(notification.id)
                    }
                  >
                    {notification.is_read ? "تحديد كغير مقروء" : "تحديد كمقروء"}
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() =>
                      askDelete(notification.id, notification.title)
                    }
                  >
                    حذف
                  </Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default Notifications;

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
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import MarkEmailUnreadIcon from "@mui/icons-material/MarkEmailUnread";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { StoreContext } from "../../StoreDataProvider";

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

const getNotifications = async (storeId: number, includeRead: boolean = true) => {
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
  return date.toLocaleDateString("en-GB", { // dd/mm/yyyy format
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
    default:
      return "عام";
  }
};

const Notifications = () => {
  const { storeId } = useContext(StoreContext);
  const queryClient = useQueryClient();
  const [tabValue, setTabValue] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", storeId],
    queryFn: () => getNotifications(storeId, true),
    enabled: !!storeId,
  });

  const { mutate: markRead } = useMutation({
    mutationFn: (notificationId: number) => markAsRead(notificationId, storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsPreview"] });
    },
  });

  const { mutate: markUnread } = useMutation({
    mutationFn: (notificationId: number) => markAsUnread(notificationId, storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsPreview"] });
    },
  });

  const { mutate: markAllRead } = useMutation({
    mutationFn: () => markAllAsRead(storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsPreview"] });
    },
  });

  const { mutate: removeNotification } = useMutation({
    mutationFn: (notificationId: number) =>
      deleteNotification(notificationId, storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsPreview"] });
    },
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unread_count || 0;

  const filteredNotifications =
    tabValue === 0
      ? notifications
      : notifications.filter((n) => !n.is_read);

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

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          الإشعارات
        </Typography>
        {unreadCount > 0 && (
          <Button
            variant="outlined"
            startIcon={<MarkEmailReadIcon />}
            onClick={() => markAllRead()}
          >
            تحديد الكل كمقروء
          </Button>
        )}
      </Box>

      <Tabs
        value={tabValue}
        onChange={(_, newValue) => setTabValue(newValue)}
        sx={{ mb: 3 }}
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
            {tabValue === 0
              ? "لا توجد إشعارات"
              : "لا توجد إشعارات غير مقروءة"}
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
                borderRight: notification.is_read ? "none" : 4,
                borderColor: "primary.main",
              }}
            >
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <Typography
                        variant="h6"
                        fontWeight={notification.is_read ? "normal" : "bold"}
                      >
                        {notification.title}
                      </Typography>
                      <Chip
                        label={getNotificationTypeLabel(notification.type)}
                        color={getNotificationTypeColor(notification.type) as any}
                        size="small"
                      />
                    </Box>
                    <Typography
                      variant="body1"
                      color="text.secondary"
                      sx={{ whiteSpace: "pre-line", mb: 2 }}
                    >
                      {notification.content}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {formatDate(notification.created_at)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Tooltip
                      title={
                        notification.is_read
                          ? "تحديد كغير مقروء"
                          : "تحديد كمقروء"
                      }
                    >
                      <IconButton
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
                        onClick={() => removeNotification(notification.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
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

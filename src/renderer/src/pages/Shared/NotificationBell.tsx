import { useState, useContext } from "react";
import {
  Badge,
  IconButton,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
  CircularProgress,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { StoreContext } from "../../StoreDataProvider";
import { useNavigate } from "react-router-dom";

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

const getNotifications = async (storeId: number, limit: number = 5) => {
  const { data } = await axios.get<NotificationsResponse>("/notifications", {
    params: { store_id: storeId, limit },
  });
  return data;
};

const getUnreadCount = async (storeId: number) => {
  const { data } = await axios.get<{ unread_count: number }>(
    "/notifications/unread-count",
    {
      params: { store_id: storeId },
    },
  );
  return data.unread_count;
};

const markAsRead = async (notificationId: number, storeId: number) => {
  await axios.put(`/notifications/${notificationId}/read`, null, {
    params: { store_id: storeId },
  });
};

const markAllAsRead = async (storeId: number) => {
  await axios.put("/notifications/read-all", null, {
    params: { store_id: storeId },
  });
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  return date.toLocaleDateString("en-GB"); // dd/mm/yyyy format
};

const NotificationBell = () => {
  const { storeId } = useContext(StoreContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  // Poll for unread count every 60 seconds
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notificationsUnreadCount", storeId],
    queryFn: () => getUnreadCount(storeId),
    enabled: !!storeId,
    refetchInterval: 60000, // Poll every 60 seconds
  });

  // Fetch notifications when popover is open
  const {
    data: notificationsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["notificationsPreview", storeId],
    queryFn: () => getNotifications(storeId, 5),
    enabled: !!storeId && !!anchorEl,
  });

  const { mutate: markRead } = useMutation({
    mutationFn: (notificationId: number) => markAsRead(notificationId, storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsPreview"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const { mutate: markAllRead } = useMutation({
    mutationFn: () => markAllAsRead(storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notificationsPreview"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    refetch();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markRead(notification.id);
    }
    handleClose();
    // Navigate to notifications page
    navigate("/notifications");
  };

  const handleSeeAll = () => {
    handleClose();
    navigate("/notifications");
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        onClick={handleClick}
        sx={{ color: "text.primary" }}
        aria-label="الإشعارات"
      >
        <Badge
          badgeContent={unreadCount}
          color="error"
          max={99}
          sx={{
            "& .MuiBadge-badge": {
              fontSize: "0.7rem",
              height: "18px",
              minWidth: "18px",
            },
          }}
        >
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        PaperProps={{
          sx: {
            width: 360,
            maxHeight: 450,
          },
        }}
      >
        <Box
          sx={{
            p: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="h6" fontWeight="bold">
            الإشعارات
          </Typography>
          {unreadCount > 0 && (
            <Button size="small" onClick={() => markAllRead()}>
              تحديد الكل كمقروء
            </Button>
          )}
        </Box>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notificationsData?.notifications.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">لا توجد إشعارات</Typography>
          </Box>
        ) : (
          <List sx={{ p: 0, maxHeight: 320, overflow: "auto" }}>
            {notificationsData?.notifications.map((notification, index) => (
              <Box key={notification.id}>
                <ListItem
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    cursor: "pointer",
                    bgcolor: notification.is_read
                      ? "transparent"
                      : "action.hover",
                    "&:hover": {
                      bgcolor: "action.selected",
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        fontWeight={notification.is_read ? "normal" : "bold"}
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {notification.title}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {notification.content?.split("\n")[0] || ""}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          display="block"
                          mt={0.5}
                        >
                          {formatTimeAgo(notification.created_at)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
                {index < (notificationsData?.notifications.length || 0) - 1 && (
                  <Divider />
                )}
              </Box>
            ))}
          </List>
        )}

        <Divider />
        <Box sx={{ p: 1, textAlign: "center" }}>
          <Button fullWidth onClick={handleSeeAll}>
            عرض كل الإشعارات
          </Button>
        </Box>
      </Popover>
    </>
  );
};

export default NotificationBell;

import { useState, useContext, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Alert,
  Card,
  CardContent,
  Chip,
  IconButton,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
} from "@mui/material";
import {
  Telegram as TelegramIcon,
  Send as SendIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Chat as ChatIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from "@mui/icons-material";
import useTelegram from "../hooks/useTelegram";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { StoreContext } from "../../../StoreDataProvider";

const Telegram = () => {
  const [botTokenInput, setBotTokenInput] = useState("");
  const [chatIdInput, setChatIdInput] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  // Get store ID from context
  const { storeId } = useContext(StoreContext);

  // API hook with store ID
  const {
    status,
    storeChatId,
    statusLoading,
    configure,
    configureLoading,
    sendTestMessage,
    testMessageLoading,
    setStoreChatId,
    setStoreChatIdLoading,
    fetchUpdates,
    updatesLoading,
    updates,
    refetchStatus,
  } = useTelegram(setMsg, storeId);

  const isConnected = status?.connected || false;
  const botUsername = status?.bot_username;

  useEffect(() => {
    if (storeChatId) {
      setChatIdInput(storeChatId);
    }
  }, [storeChatId]);

  const handleConfigure = () => {
    if (!botTokenInput.trim()) return;
    configure({ bot_token: botTokenInput });
  };

  const handleSetChatId = () => {
    if (!chatIdInput.trim()) return;
    setStoreChatId({
      store_id: storeId,
      chat_id: chatIdInput,
    });
  };

  const handleSendTestMessage = () => {
    if (!testMessage.trim() || !chatIdInput.trim()) return;
    sendTestMessage({
      chat_id: chatIdInput,
      message: testMessage,
    });
    setTestMessage("");
  };

  const handleAutoDetect = () => {
    fetchUpdates();
  };

  const handleSelectChat = (chatId: string) => {
    setChatIdInput(chatId);
  };

  const ConnectionStatusChip = () => {
    if (statusLoading) {
      return (
        <Chip
          icon={<CircularProgress size={16} />}
          label="جاري التحقق..."
          color="default"
          variant="outlined"
        />
      );
    }

    if (isConnected) {
      return (
        <Chip
          icon={<CheckCircleIcon />}
          label={`متصل ${botUsername ? `(@${botUsername})` : ""}`}
          color="primary"
          variant="filled"
        />
      );
    }

    return (
      <Chip
        icon={<CancelIcon />}
        label="غير مكوّن"
        color="error"
        variant="outlined"
      />
    );
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

      {/* Header */}
      <Paper
        elevation={2}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(0, 136, 204, 0.1) 0%, rgba(0, 136, 204, 0.05) 100%)",
          border: "1px solid",
          borderColor: "primary.light",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <TelegramIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "primary.main" }}
          >
            إعدادات تليجرام
          </Typography>
          <Box sx={{ ml: "auto" }}>
            <ConnectionStatusChip />
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary">
          إعداد وإدارة إشعارات تليجرام للمتجر
        </Typography>
      </Paper>

      <Grid container spacing={3}>
        {/* Bot Configuration */}
        <Grid item xs={12} md={6}>
          <Card
            elevation={1}
            sx={{
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <CardContent>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <SettingsIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  تكوين البوت
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => refetchStatus()}
                  disabled={statusLoading}
                >
                  <RefreshIcon />
                </IconButton>
              </Box>

              <Box sx={{ mb: 3 }}>
                <ConnectionStatusChip />
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  1. افتح تليجرام وابحث عن <b>@BotFather</b>
                  <br />
                  2. أرسل <b>/newbot</b> واتبع التعليمات
                  <br />
                  3. انسخ رمز البوت (Token) والصقه هنا
                </Typography>
              </Alert>

              <TextField
                fullWidth
                label="رمز البوت (Bot Token)"
                value={botTokenInput}
                onChange={(e) => setBotTokenInput(e.target.value)}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                type={showToken ? "text" : "password"}
                sx={{ mb: 2 }}
                dir="ltr"
                InputProps={{
                  endAdornment: (
                    <Button
                      size="small"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? "إخفاء" : "إظهار"}
                    </Button>
                  ),
                }}
              />

              <Button
                variant="contained"
                color="primary"
                startIcon={<TelegramIcon />}
                onClick={handleConfigure}
                disabled={configureLoading || !botTokenInput.trim()}
                fullWidth
              >
                {configureLoading ? "جاري التحقق..." : "تحقق وحفظ"}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Chat ID Configuration */}
        <Grid item xs={12} md={6}>
          <Card
            elevation={1}
            sx={{
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <CardContent>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <ChatIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  معرف المحادثة (Chat ID)
                </Typography>
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  1. افتح تليجرام وابحث عن البوت الخاص بك
                  <br />
                  2. أرسل <b>/start</b> للبوت
                  <br />
                  3. اضغط "كشف تلقائي" أدناه
                </Typography>
              </Alert>

              <TextField
                fullWidth
                label="معرف المحادثة (Chat ID)"
                value={chatIdInput}
                onChange={(e) => setChatIdInput(e.target.value)}
                placeholder="123456789"
                sx={{ mb: 2 }}
                dir="ltr"
              />

              <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<SearchIcon />}
                  onClick={handleAutoDetect}
                  disabled={updatesLoading || !isConnected}
                  sx={{ flex: 1 }}
                >
                  {updatesLoading ? "جاري البحث..." : "كشف تلقائي"}
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSetChatId}
                  disabled={setStoreChatIdLoading || !chatIdInput.trim()}
                  sx={{ flex: 1 }}
                >
                  {setStoreChatIdLoading ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </Box>

              {/* Auto-detected chats list */}
              {updates && updates.length > 0 && (
                <Box
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    maxHeight: 200,
                    overflow: "auto",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ px: 2, pt: 1, fontWeight: 600 }}
                  >
                    المحادثات المكتشفة:
                  </Typography>
                  <List dense>
                    {updates.map((update) => (
                      <ListItem key={update.chat_id} disablePadding>
                        <ListItemButton
                          onClick={() => handleSelectChat(update.chat_id)}
                          selected={chatIdInput === update.chat_id}
                        >
                          <ListItemText
                            primary={
                              update.type === "private"
                                ? `${update.first_name} ${update.last_name || ""}`.trim()
                                : update.title || "مجموعة"
                            }
                            secondary={`${update.type === "private" ? "محادثة خاصة" : "مجموعة"} • ID: ${update.chat_id}${update.username ? ` • @${update.username}` : ""}`}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {!isConnected && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  يجب تكوين البوت أولاً قبل الكشف التلقائي
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Test Message */}
        <Grid item xs={12}>
          <Card
            elevation={1}
            sx={{
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <CardContent>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <SendIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  إرسال رسالة تجريبية
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} md={10}>
                  <TextField
                    fullWidth
                    label="الرسالة"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="رسالة تجريبية..."
                    disabled={!isConnected || !chatIdInput.trim()}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Button
                    variant="contained"
                    startIcon={<SendIcon />}
                    onClick={handleSendTestMessage}
                    disabled={
                      !isConnected ||
                      testMessageLoading ||
                      !testMessage.trim() ||
                      !chatIdInput.trim()
                    }
                    fullWidth
                    sx={{ height: "56px" }}
                  >
                    إرسال
                  </Button>
                </Grid>
              </Grid>

              {!isConnected && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  يجب تكوين البوت وحفظ معرف المحادثة أولاً لإرسال الرسائل
                  التجريبية
                </Alert>
              )}

              {isConnected && !chatIdInput.trim() && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  يجب حفظ معرف المحادثة (Chat ID) أولاً لإرسال الرسائل
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Telegram;

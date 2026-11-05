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
  Terminal as CommandsIcon,
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
    commands,
    worker,
  } = useTelegram(setMsg, storeId);

  const isConnected = status?.connected || false;
  const botUsername = status?.bot_username;

  const workerAlert = (() => {
    if (!worker || !isConnected) return null;
    switch (worker.state) {
      case "polling":
        return {
          severity: "success" as const,
          text: "البوت يستقبل الأوامر الآن. أرسل «مساعدة» أو /start للبوت لعرض القائمة.",
        };
      case "conflict":
      case "rate_limited":
      case "error":
        return {
          severity: "warning" as const,
          text: `البوت لا يستقبل الأوامر حاليًا: ${worker.last_error || "خطأ في الاتصال"}`,
        };
      case "invalid_token":
        return { severity: "error" as const, text: "رمز البوت غير صالح." };
      case "stopped":
        return {
          severity: "warning" as const,
          text: "خدمة أوامر البوت متوقفة، أعد تشغيل البرنامج.",
        };
      default:
        return null;
    }
  })();

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
    if (!chatIdInput.trim()) return;
    sendTestMessage(
      {
        chat_id: chatIdInput.trim(),
        message:
          testMessage.trim() ||
          "✅ رسالة تجريبية من برنامج المتجر — الإشعارات تعمل. أرسل «مساعدة» لعرض الأوامر.",
      },
      // Keep the text if sending failed so it can be retried.
      { onSuccess: (data) => data.success && setTestMessage("") },
    );
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
        label="غير متصل"
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
          p: { xs: 2, sm: 3 },
          mb: 3,
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(0, 136, 204, 0.1) 0%, rgba(0, 136, 204, 0.05) 100%)",
          border: "1px solid",
          borderColor: "primary.light",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mb: 2,
            flexWrap: "wrap",
          }}
        >
          <TelegramIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              color: "primary.main",
              fontSize: { xs: "1.4rem", sm: "2.125rem" },
            }}
          >
            إعدادات تليجرام
          </Typography>
          <Box sx={{ ml: { sm: "auto" } }}>
            <ConnectionStatusChip />
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary">
          إعداد وإدارة إشعارات تليجرام للمتجر
        </Typography>
        {workerAlert && (
          <Alert severity={workerAlert.severity} sx={{ mt: 2 }}>
            {workerAlert.text}
          </Alert>
        )}
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
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}
              >
                <SettingsIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  إعداد البوت
                </Typography>
                <IconButton
                  onClick={() => refetchStatus()}
                  disabled={statusLoading}
                  aria-label="تحديث حالة الاتصال"
                  sx={{ ml: "auto" }}
                >
                  <RefreshIcon />
                </IconButton>
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
                slotProps={{
                  htmlInput: {
                    dir: "ltr",
                    autoComplete: "off",
                    autoCapitalize: "none",
                    spellCheck: false,
                  },
                  input: {
                    endAdornment: (
                      <Button
                        size="small"
                        onClick={() => setShowToken(!showToken)}
                        sx={{ minWidth: 56, flexShrink: 0 }}
                      >
                        {showToken ? "إخفاء" : "إظهار"}
                      </Button>
                    ),
                  },
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
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
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
                slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }}
              />

              <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  startIcon={<SearchIcon />}
                  onClick={handleAutoDetect}
                  disabled={updatesLoading || !isConnected}
                  sx={{ flex: "1 1 140px", minHeight: 40 }}
                >
                  {updatesLoading ? "جاري البحث..." : "كشف تلقائي"}
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSetChatId}
                  disabled={setStoreChatIdLoading || !chatIdInput.trim()}
                  sx={{ flex: "1 1 140px", minHeight: 40 }}
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
                  يجب إعداد البوت أولاً قبل الكشف التلقائي
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
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
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
                    label="الرسالة (اختياري)"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="اتركها فارغة لإرسال رسالة اختبار جاهزة"
                    disabled={!isConnected || !chatIdInput.trim()}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Button
                    variant="contained"
                    startIcon={<SendIcon />}
                    onClick={handleSendTestMessage}
                    disabled={
                      !isConnected || testMessageLoading || !chatIdInput.trim()
                    }
                    fullWidth
                    sx={{ height: { xs: 48, md: 56 } }}
                  >
                    إرسال
                  </Button>
                </Grid>
              </Grid>

              {!isConnected && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  يجب إعداد البوت وحفظ معرف المحادثة أولاً لإرسال الرسائل
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

        {/* What the bot understands */}
        <Grid item xs={12}>
          <Card
            elevation={1}
            sx={{
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}
              >
                <CommandsIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  أوامر البوت
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                اكتب الأمر بالعربي أو الإنجليزي، بشرطة / أو بدونها، والبوت يفهم
                الأخطاء الإملائية البسيطة ويعرض أزرارًا للأوامر الشائعة. الأوامر
                تعمل فقط في المحادثة المحفوظة للمتجر، ولأكثر من متجر أضف «متجر
                رقم» للأمر. الحركات النقدية لا تُسجل إلا بعد الضغط على زر
                التأكيد.
              </Typography>
              {commands.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  ...
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "1fr 1fr",
                      lg: "1fr 1fr 1fr",
                    },
                    gap: 1,
                  }}
                >
                  {commands.map((c) => (
                    <Box
                      key={c.key}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        p: 1.25,
                        minWidth: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography variant="body2" fontWeight={700}>
                          {c.title}
                        </Typography>
                        <Chip
                          size="small"
                          label={c.slash}
                          dir="ltr"
                          sx={{ fontFamily: "monospace" }}
                        />
                      </Box>
                      {c.aliases.length > 0 && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="div"
                          sx={{ mt: 0.5, wordBreak: "break-word" }}
                        >
                          أو: {c.aliases.join("، ")}
                        </Typography>
                      )}
                      {c.example && (
                        <Typography
                          variant="caption"
                          component="div"
                          sx={{ mt: 0.25 }}
                        >
                          مثال: <b>{c.example}</b>
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Telegram;

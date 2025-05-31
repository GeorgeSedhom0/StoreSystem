import React, { useState, useContext, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  WhatsApp as WhatsAppIcon,
  Send as SendIcon,
  QrCode as QrCodeIcon,
  Phone as PhoneIcon,
  Settings as SettingsIcon,
  PowerSettingsNew as PowerIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import useWhatsApp from "../hooks/useWhatsApp";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { StoreContext } from "../../../StoreDataProvider";

const WhatsApp = () => {
  const [testMessage, setTestMessage] = useState("");
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [storeNumberInput, setStoreNumberInput] = useState("");
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  // Get store ID from context
  const { storeId } = useContext(StoreContext);

  // API hook with store ID
  const {
    status,
    storeNumber,
    statusLoading,
    isConnecting,
    showQrDialog,
    setShowQrDialog,
    configure,
    configureLoading,
    sendTestMessage,
    testMessageLoading,
    setStoreNumber,
    setStoreNumberLoading,
    refetchStatus,
  } = useWhatsApp(setMsg, storeId);
  const isConnected = status?.connected || false;
  const phoneNumber = status?.phone_number;
  const qrCode = status?.qr_code;

  useEffect(() => {
    if (storeNumber) {
      setStoreNumberInput(storeNumber);
    }
  }, [storeNumber]);

  // Auto open QR dialog when code becomes available during connection
  useEffect(() => {
    if (qrCode) {
      setShowQrDialog(true);
    }
  }, [qrCode, setShowQrDialog]);

  const handleConnect = () => {
    configure({ action: "connect" });
  };

  const handleDisconnect = () => {
    configure({ action: "disconnect" });
    setShowQrDialog(false);
  };

  const handleSendTestMessage = () => {
    if (!testMessage.trim() || !testPhoneNumber.trim()) {
      return;
    }

    sendTestMessage({
      phone_number: testPhoneNumber,
      message: testMessage,
    });
    setTestMessage("");
    setTestPhoneNumber("");
  };

  const handleSetStoreNumber = () => {
    if (!storeNumberInput.trim()) {
      return;
    }

    setStoreNumber({
      store_id: storeId,
      phone_number: storeNumberInput,
    });
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

    if (isConnecting) {
      return (
        <Chip
          icon={<CircularProgress size={16} />}
          label="جاري الاتصال..."
          color="warning"
          variant="outlined"
        />
      );
    }

    if (isConnected) {
      return (
        <Chip
          icon={<WhatsAppIcon />}
          label={`متصل ${phoneNumber ? `(${phoneNumber})` : ""}`}
          color="success"
          variant="filled"
        />
      );
    }

    return (
      <Chip
        icon={<PowerIcon />}
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
          p: 3,
          mb: 3,
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(37, 211, 102, 0.1) 0%, rgba(37, 211, 102, 0.05) 100%)",
          border: "1px solid",
          borderColor: "success.light",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <WhatsAppIcon sx={{ fontSize: "2rem", color: "success.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "success.main" }}
          >
            إعدادات واتساب
          </Typography>
          <Box sx={{ ml: "auto" }}>
            <ConnectionStatusChip />
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary">
          إعداد وإدارة إشعارات واتساب للمتجر
        </Typography>
      </Paper>

      <Grid container spacing={3}>
        {/* Connection Status & Control */}
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
                  حالة الاتصال
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

              {!isConnected ? (
                <Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    اضغط على "الاتصال" لبدء ربط واتساب. ستحتاج لمسح رمز QR
                    باستخدام هاتفك.
                  </Typography>{" "}
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<WhatsAppIcon />}
                    onClick={handleConnect}
                    disabled={configureLoading}
                    fullWidth
                  >
                    {configureLoading ? "جاري الاتصال..." : "الاتصال بواتساب"}
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    واتساب متصل ومعد بنجاح. يمكنك الآن إرسال الإشعارات.
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<PowerIcon />}
                    onClick={handleDisconnect}
                    disabled={configureLoading}
                    fullWidth
                  >
                    {configureLoading ? "جاري قطع الاتصال..." : "قطع الاتصال"}
                  </Button>
                </Box>
              )}

              {qrCode && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<QrCodeIcon />}
                    onClick={() => setShowQrDialog(true)}
                    fullWidth
                  >
                    عرض رمز QR
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>{" "}
        {/* Store Number Setting */}
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
                <PhoneIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  رقم إشعارات المتجر
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                رقم الهاتف المخصص لتلقي إشعارات هذا المتجر
              </Typography>{" "}
              <TextField
                fullWidth
                label="رقم الهاتف"
                value={storeNumberInput}
                onChange={(e) => setStoreNumberInput(e.target.value)}
                placeholder="+1234567890"
                sx={{ mb: 2 }}
                dir="ltr"
              />
              <Button
                variant="contained"
                onClick={handleSetStoreNumber}
                disabled={setStoreNumberLoading || !storeNumberInput.trim()}
                fullWidth
              >
                {" "}
                {setStoreNumberLoading ? "جاري الحفظ..." : "حفظ رقم المتجر"}
              </Button>
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
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="رقم الهاتف"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    placeholder="+1234567890"
                    disabled={!isConnected}
                    dir="ltr"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="الرسالة"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="رسالة تجريبية..."
                    disabled={!isConnected}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  {" "}
                  <Button
                    variant="contained"
                    startIcon={<SendIcon />}
                    onClick={handleSendTestMessage}
                    disabled={
                      !isConnected ||
                      testMessageLoading ||
                      !testMessage.trim() ||
                      !testPhoneNumber.trim()
                    }
                    fullWidth
                    sx={{ height: "56px" }}
                  >
                    إرسال
                  </Button>{" "}
                </Grid>
              </Grid>

              {!isConnected && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  يجب الاتصال بواتساب أولاً لإرسال الرسائل التجريبية
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* QR Code Dialog */}
      <Dialog
        open={showQrDialog}
        onClose={() => setShowQrDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <QrCodeIcon />
            <Typography variant="h6">مسح رمز QR</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            امسح هذا الرمز باستخدام تطبيق واتساب على هاتفك لربط الحساب
          </Typography>
          {qrCode ? (
            <Box sx={{ textAlign: "center" }}>
              <img
                src={qrCode}
                alt="QR Code"
                style={{
                  maxWidth: "100%",
                  maxHeight: "400px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                سيتم تحديث رمز QR تلقائيًا كل بضع دقائق
              </Typography>
            </Box>
          ) : (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <CircularProgress />
              <Typography variant="body2" sx={{ mt: 2 }}>
                جاري توليد رمز QR...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowQrDialog(false)}>إغلاق</Button>
          <Button
            onClick={() => refetchStatus()}
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={statusLoading}
          >
            تحديث
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WhatsApp;

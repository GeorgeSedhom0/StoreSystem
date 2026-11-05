import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Typography,
} from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import DnsIcon from "@mui/icons-material/Dns";
import { useEffect, useState } from "react";

interface SetupProps {
  onComplete: () => void;
}

const Setup = ({ onComplete }: SetupProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMode, setSelectedMode] = useState<
    "standalone" | "remote" | null
  >(null);

  const handleModeSelect = async (mode: "standalone" | "remote") => {
    setSelectedMode(mode);
    setLoading(true);
    setError("");

    try {
      const result = await window.electron.ipcRenderer.invoke("set-mode", mode);

      if (mode === "remote") {
        // Remote mode: just save the mode and let the user set baseUrl
        onComplete();
        return;
      }

      // Standalone mode: services are started by the main process
      if (result.success) {
        onComplete();
      } else {
        setError(result.error || "فشل تشغيل الخدمات");
        setLoading(false);
        setSelectedMode(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
      setSelectedMode(null);
    }
  };

  if (loading) {
    return <SplashLoading mode={selectedMode!} />;
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        gap: { xs: 2, sm: 4 },
        p: { xs: 2, sm: 4 },
      }}
    >
      <Typography variant="h4" fontWeight="bold">
        OpenStore
      </Typography>
      <Typography variant="h6" color="text.secondary">
        اختر وضع التشغيل
      </Typography>

      {error && (
        <Alert severity="error" sx={{ maxWidth: 480, width: "100%" }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: "flex",
          gap: { xs: 2, sm: 4 },
          flexWrap: "wrap",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <Card
          sx={{
            width: "100%",
            maxWidth: 280,
            transition: "transform 0.2s, box-shadow 0.2s",
            "&:hover": {
              transform: "translateY(-4px)",
              boxShadow: 6,
            },
          }}
        >
          <CardActionArea onClick={() => handleModeSelect("standalone")}>
            <CardContent
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                py: { xs: 3, sm: 4 },
              }}
            >
              <StorefrontIcon
                sx={{ fontSize: { xs: 48, sm: 64 } }}
                color="primary"
              />
              <Typography variant="h6" fontWeight="bold">
                متجر واحد
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                كل شيء يعمل على هذا الجهاز. لا يحتاج لإعداد إضافي.
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>

        <Card
          sx={{
            width: "100%",
            maxWidth: 280,
            transition: "transform 0.2s, box-shadow 0.2s",
            "&:hover": {
              transform: "translateY(-4px)",
              boxShadow: 6,
            },
          }}
        >
          <CardActionArea onClick={() => handleModeSelect("remote")}>
            <CardContent
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                py: { xs: 3, sm: 4 },
              }}
            >
              <DnsIcon sx={{ fontSize: { xs: 48, sm: 64 } }} color="primary" />
              <Typography variant="h6" fontWeight="bold">
                عدة متاجر
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                الاتصال بسيرفر خارجي. يحتاج لرابط السيرفر.
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      </Box>
    </Box>
  );
};

const SplashLoading = ({ mode }: { mode: "standalone" | "remote" }) => {
  const [status, setStatus] = useState({ status: "starting-db", message: "" });

  // Listen for status updates from main process
  useEffect(() => {
    const handler = (
      _event: unknown,
      data: { status: string; message: string },
    ) => {
      setStatus(data);
    };
    window.electron.ipcRenderer.on("service-status", handler);
    return () => {
      window.electron.ipcRenderer.removeListener("service-status", handler);
    };
  }, []);

  const statusMessages: Record<string, string> = {
    "starting-db": "جاري تشغيل قاعدة البيانات...",
    "initializing-db": "جاري إعداد قاعدة البيانات...",
    "starting-backend": "جاري تشغيل السيرفر...",
    ready: "جاهز!",
    error: "حدث خطأ",
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        gap: 3,
        p: 2,
        textAlign: "center",
      }}
    >
      <CircularProgress size={48} />
      <Typography variant="h6">
        {mode === "standalone" ? "جاري إعداد النظام..." : "جاري الاتصال..."}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {status.message || statusMessages[status.status] || ""}
      </Typography>
    </Box>
  );
};

export default Setup;

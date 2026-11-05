import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ViewContainer } from "./pages/Shared/Utils";
import { useEffect, useState } from "react";

/** "192.168.1.10:8000" → "http://192.168.1.10:8000"; null when unusable. */
const normalizeUrl = (raw: string): string | null => {
  let v = raw.trim().replace(/\/+$/, "");
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  try {
    const u = new URL(v);
    return u.host ? v : null;
  } catch {
    return null;
  }
};

const SetBaseUrl = () => {
  const [baseUrl, setBaseUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    const getBaseUrl = async () => {
      const url = await window.electron.ipcRenderer.invoke("get", "baseUrl");
      setBaseUrl(url || "");
    };
    getBaseUrl();
  }, []);

  const normalized = normalizeUrl(baseUrl);
  const invalid = touched && !normalized;

  const save = async () => {
    setTouched(true);
    if (!normalized) return;
    await window.electron.ipcRenderer.invoke("set", "baseUrl", normalized);
    window.location.reload();
  };

  return (
    <ViewContainer>
      <Dialog open={true} fullScreen={fullScreen} fullWidth maxWidth="xs">
        <DialogTitle>رابط السيرفر</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            أدخل عنوان السيرفر الذي يعمل عليه النظام، مثال:
            http://192.168.1.10:8000
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="الرابط"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            error={invalid}
            helperText={invalid ? "الرابط غير صحيح" : " "}
            placeholder="http://192.168.1.10:8000"
            slotProps={{
              htmlInput: {
                dir: "ltr",
                inputMode: "url",
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: false,
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={save} disabled={!baseUrl.trim()}>
            حفظ واتصال
          </Button>
        </DialogActions>
      </Dialog>
    </ViewContainer>
  );
};

export default SetBaseUrl;

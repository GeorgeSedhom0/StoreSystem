import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { ViewContainer } from "./pages/Shared/Utils";
import { useEffect, useState } from "react";

const SetBaseUrl = () => {
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    const getBaseUrl = async () => {
      const url = await window.electron.ipcRenderer.invoke("get", "baseUrl");
      setBaseUrl(url);
    };
    getBaseUrl();
  }, []);

  return (
    <ViewContainer>
      <Dialog open={true}>
        <DialogTitle>ضع رابط السيرفر</DialogTitle>
        <DialogContent>
          <TextField
            label="الرابط"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={async () => {
              await window.electron.ipcRenderer.invoke(
                "set",
                "baseUrl",
                baseUrl,
              );
              window.location.reload();
            }}
          >
            حفظ
          </Button>
        </DialogActions>
      </Dialog>
    </ViewContainer>
  );
};

export default SetBaseUrl;

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { ViewContainer } from "./pages/Shared/Utils";
import { useState } from "react";

const SetBaseUrl = () => {
  const [baseUrl, setBaseUrl] = useState("");
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

import { LoadingButton } from "@mui/lab";
import { ButtonGroup, Card, Grid, Typography } from "@mui/material";
import axios from "axios";
import { useCallback, useState } from "react";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";

const Settings = () => {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const backUp = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("http://localhost:8000/backup");
      // download the backup file
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "backup.sql");
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  const restore = useCallback(async () => {
    const userConsent = window.confirm(
      "هل انت متاكد من استعادة النسخة الاحطياتية"
    );
    if (!userConsent) return;
    setLoading(true);
    try {
      // let use pick the file .sql
      const file = document.createElement("input");
      file.type = "file";
      file.accept = ".sql";
      file.click();
      file.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) {
          setMsg({ type: "error", text: "حدث خطا ما" });
        }
        await axios.post("http://localhost:8000/restore", file);
      };
    } catch (e) {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  return (
    <Grid container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid item xs={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h4">الاعدادات</Typography>
            </Grid>
            <Grid item xs={12}>
              <ButtonGroup>
                <LoadingButton loading={loading} onClick={backUp}>
                  نسخ احطياتى
                </LoadingButton>
                <LoadingButton loading={loading} onClick={restore}>
                  استعادة
                </LoadingButton>
              </ButtonGroup>
            </Grid>
          </Grid>
        </Card>
      </Grid>
    </Grid>
  );
};

export default Settings;

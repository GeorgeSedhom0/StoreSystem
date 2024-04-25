import { AppBar, Button, Toolbar, Grid } from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { ViewContainer } from "./pages/Shared/Utils";
import { useNavigate } from "react-router-dom";
import { useCallback, useState } from "react";
import AlertMessage, { AlertMsg } from "./pages/Shared/AlertMessage";
import axios from "axios";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.post("http://localhost:8000/send-sync");
      console.log(data);
      setMsg({ type: "success", text: "تمت المزامنة بنجاح" });
    } catch (e) {
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  return (
    <>
      <AppBar position="sticky">
        <Toolbar>
          <Grid container gap={5}>
            <Button
              onClick={() => {
                navigate("/sell");
              }}
            >
              بيع
            </Button>
            <Button
              onClick={() => {
                navigate("/buy");
              }}
            >
              شراء
            </Button>
            <Button
              onClick={() => {
                navigate("/add-to-storage");
              }}
            >
              اضافة منتجات
            </Button>
            <Button
              onClick={() => {
                navigate("/bills");
              }}
            >
              الفواتير
            </Button>
            <Button
              onClick={() => {
                navigate("/products");
              }}
            >
              المنتجات
            </Button>
            <Button
              onClick={() => {
                navigate("/cash");
              }}
            >
              الحركات المالية
            </Button>
            <LoadingButton loading={loading} onClick={sync}>
              مزامنة
            </LoadingButton>
          </Grid>
        </Toolbar>
      </AppBar>
      <ViewContainer>
        <AlertMessage message={msg} setMessage={setMsg} />
        {children}
      </ViewContainer>
    </>
  );
};

export default Layout;

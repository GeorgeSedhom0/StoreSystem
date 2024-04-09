import { AppBar, Button, Toolbar, Grid } from "@mui/material";
import { ViewContainer } from "./pages/Shared/Utils";
import { useNavigate } from "react-router-dom";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
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
              تعديل المنتجات
            </Button>
            <Button
              onClick={() => {
                console.log("logout");
              }}
            >
              مزامنة
            </Button>
          </Grid>
        </Toolbar>
      </AppBar>
      <ViewContainer>{children}</ViewContainer>
    </>
  );
};

export default Layout;

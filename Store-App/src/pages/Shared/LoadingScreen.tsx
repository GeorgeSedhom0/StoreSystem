import { Backdrop, CircularProgress } from "@mui/material";

const LoadingScreen = ({ loading }: { loading: boolean }) => {
  return loading ? (
    <Backdrop
      sx={{
        color: "#fff",
        zIndex: (theme) => theme.zIndex.drawer + 1,
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      open={true}
    >
      <CircularProgress color="inherit" />
    </Backdrop>
  ) : null;
};
export default LoadingScreen;

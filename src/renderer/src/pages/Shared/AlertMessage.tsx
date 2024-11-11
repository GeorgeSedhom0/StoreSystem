import { Alert, Snackbar, ThemeProvider, createTheme } from "@mui/material";

export type AlertMsg = {
  type: "error" | "warning" | "info" | "success" | "";
  text: string;
};

const AlertMessage = ({
  message,
  setMessage,
}: {
  message: AlertMsg;
  setMessage: (msg: AlertMsg) => void;
}) => {
  const theme = createTheme({
    palette: {
      mode: "light",
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        autoHideDuration={3000}
        open={message.type !== ""}
        onClose={() => setMessage({ type: "", text: "" })}
      >
        {message.type ? (
          <Alert severity={message.type}>{message.text}</Alert>
        ) : // it has to be undefined, since Snackbar don't accept string ot boolean as children
        undefined}
      </Snackbar>
    </ThemeProvider>
  );
};

export default AlertMessage;

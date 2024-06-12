import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import LoadingScreen from "../../Shared/LoadingScreen";

interface ShiftDialogProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  shift: string | null;
  refetchShift: () => void;
}

interface ShiftTotal {
  sell_total: number;
  buy_total: number;
  return_total: number;
}

const getShiftTotal = async () => {
  const { data } = await axios.get<ShiftTotal>(
    "http://localhost:8000/shift-total"
  );
  return data;
};

const ShiftDialog = ({
  dialogOpen,
  setDialogOpen,
  shift,
  refetchShift,
}: ShiftDialogProps) => {
  const navigate = useNavigate();

  const handleClose = () => {
    if (!shift) return;
    setDialogOpen(false);
  };

  const { data: shiftTotal, isLoading: isShiftTotalLoading } = useQuery({
    queryKey: ["shiftTotal"],
    queryFn: getShiftTotal,
    initialData: { sell_total: 0, buy_total: 0, return_total: 0 },
  });

  const openShift = async () => {
    try {
      await axios.get("http://localhost:8000/start-shift");
      refetchShift();
    } catch (err) {
      console.log(err);
    }
  };

  const closeShift = async () => {
    try {
      await axios.get("http://localhost:8000/end-shift");
      refetchShift();
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <Dialog
      open={dialogOpen}
      onClose={handleClose}
      fullWidth={true}
      maxWidth="md"
      style={{ height: "90vh" }}
    >
      <LoadingScreen loading={isShiftTotalLoading} />
      <DialogTitle align="center">الشيفتات</DialogTitle>
      <DialogContent>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          style={{ height: "100%" }}
        >
          <DialogContentText>
            {shift
              ? `
            شيفت مفتوحة منذ: ${new Date(shift).toLocaleTimeString("ar-EG", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            `
              : "لا يوجد شيفت مفتوحة"}
          </DialogContentText>
        </Box>
      </DialogContent>
      <DialogContent>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          style={{ height: "100%" }}
        >
          <DialogContentText>
            {shift ? (
              <Typography variant="body1" align="center">
                اجمالى البيع خلال الشيفت: {shiftTotal.sell_total}
                <br />
                اجمالى الشراء خلال الشيفت: {shiftTotal.buy_total * -1}
                <br />
                اجمالى المرتجعات خلال الشيفت: {shiftTotal.return_total * -1}
                <br />
                الاجمالى النهائى:{" "}
                {shiftTotal.sell_total +
                  shiftTotal.buy_total +
                  shiftTotal.return_total}
              </Typography>
            ) : (
              "لا يوجد فواتير"
            )}
          </DialogContentText>
        </Box>
      </DialogContent>
      <DialogActions>
        <IconButton onClick={handleClose} disabled={!shift}>
          <CloseIcon />
        </IconButton>
        <Button onClick={openShift} disabled={!!shift}>
          فتح شيفت
        </Button>
        <Button onClick={closeShift} disabled={!shift}>
          إغلاق شيفت
        </Button>
        <Button onClick={() => navigate("/bills")}>الفواتير</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftDialog;

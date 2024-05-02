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
import { useEffect, useState } from "react";

interface ShiftDialogProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  shift: string | null;
  setShift: (shift: string | null) => void;
}

const ShiftDialog = ({
  dialogOpen,
  setDialogOpen,
  shift,
  setShift,
}: ShiftDialogProps) => {
  const [shiftTotal, setShiftTotal] = useState<{
    sell_total: number;
    buy_total: number;
    return_total: number;
  }>({
    sell_total: 0,
    buy_total: 0,
    return_total: 0,
  });

  const handleClose = () => {
    if (!shift) return;
    setDialogOpen(false);
  };

  useEffect(() => {
    const fetchShiftTotal = async () => {
      try {
        const { data } = await axios.get("http://localhost:8000/shift-total");
        setShiftTotal(data);
      } catch (err) {
        console.log(err);
      }
    };

    if (shift) {
      fetchShiftTotal();
    }
  }, [shift, dialogOpen]);

  const openShift = async () => {
    try {
      const { data } = await axios.get("http://localhost:8000/start-shift");
      setShift(data.start_date_time);
    } catch (err) {
      console.log(err);
    }
  };

  const closeShift = async () => {
    try {
      await axios.get("http://localhost:8000/end-shift");
      setShift(null);
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
      </DialogActions>
    </Dialog>
  );
};

export default ShiftDialog;

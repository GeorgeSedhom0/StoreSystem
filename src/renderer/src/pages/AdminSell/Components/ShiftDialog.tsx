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
import { useQuery } from "@tanstack/react-query";
import LoadingScreen from "../../Shared/LoadingScreen";
import { useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "@renderer/StoreDataProvider";

interface ShiftDialogProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  shift: string;
}

interface ShiftTotal {
  sell_total: number;
  buy_total: number;
  return_total: number;
}

const getShiftTotal = async (storeId: number) => {
  const { data } = await axios.get<ShiftTotal>("/shift-total", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const ShiftDialog = ({
  dialogOpen,
  setDialogOpen,
  shift,
}: ShiftDialogProps) => {
  const handleClose = () => {
    if (!shift) return;
    setDialogOpen(false);
  };

  const navigate = useNavigate();
  const { storeId } = useContext(StoreContext);

  const {
    data: shiftTotal,
    isLoading: isShiftTotalLoading,
    refetch: refetchShiftDetails,
  } = useQuery({
    queryKey: ["shiftTotal"],
    queryFn: () => getShiftTotal(storeId),
    initialData: { sell_total: 0, buy_total: 0, return_total: 0 },
  });

  useEffect(() => {
    refetchShiftDetails();
  }, [dialogOpen]);

  const closeShift = async () => {
    try {
      await axios.post(
        "/logout",
        {},
        {
          params: {
            store_id: storeId,
          },
        },
      );
      navigate("/login");
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
            {shift &&
              `
            شيفت مفتوحة منذ: ${new Date(shift).toLocaleTimeString("ar-EG", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            `}
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
            {shift && (
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
                <br />
                اجمالى الرصيد: {shiftTotal.sell_total + shiftTotal.return_total}
              </Typography>
            )}
          </DialogContentText>
        </Box>
      </DialogContent>
      <DialogActions>
        <IconButton onClick={handleClose} disabled={!shift}>
          <CloseIcon />
        </IconButton>
        <Button onClick={closeShift} disabled={!shift}>
          إغلاق شيفت و تسجيل الخروج
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftDialog;

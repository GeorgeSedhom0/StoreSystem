import {
  Button,
  Card,
  CardActions,
  CardContent,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { Installment } from "../Installments";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { Dispatch, SetStateAction, useState } from "react";
import { AlertMsg } from "../../Shared/AlertMessage";

const payInstallment = async ({
  id,
  amount,
}: {
  id: number;
  amount: number;
}) => {
  axios.post(
    import.meta.env.VITE_SERVER_URL + "/installments/pay/" + id.toString(),
    {},
    {
      params: {
        amount,
        time: new Date().toISOString(),
      },
    },
  );
};

const PayInstallment = ({
  selectedInstallment,
  setSelectedInstallment,
  setMsg,
  refetchInstallments,
}: {
  selectedInstallment: Installment;
  setSelectedInstallment: Dispatch<SetStateAction<number | null>>;
  setMsg: Dispatch<SetStateAction<AlertMsg>>;
  refetchInstallments: () => void;
}) => {
  const installmentSize =
    (selectedInstallment.total * -1 - selectedInstallment.paid) /
    selectedInstallment.installments_count;
  const paid = selectedInstallment.flow.reduce((acc, flow) => {
    return acc + flow.amount;
  }, 0);
  const remainingInstallmentsCount =
    selectedInstallment.installments_count - Math.ceil(paid / installmentSize);
  const fullyPaidIntervals = Math.floor(
    selectedInstallment.flow.reduce((acc, flow) => {
      return acc + flow.amount;
    }, 0) / installmentSize,
  );
  const nextInstallmentTime =
    new Date(selectedInstallment.time).getTime() +
    selectedInstallment.installment_interval *
      1000 *
      60 *
      60 *
      24 *
      (fullyPaidIntervals + 1);
  const [amount, setAmount] = useState<number>(installmentSize);

  const { mutate: pay } = useMutation({
    mutationKey: ["pay"],
    mutationFn: payInstallment,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم الدفع" });
      refetchInstallments();
      setSelectedInstallment(null);
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ" });
      refetchInstallments();
      setSelectedInstallment(null);
    },
  });

  return (
    <Grid item xs={12}>
      <Card elevation={3}>
        <CardContent>
          {!selectedInstallment.ended && (
            <Typography variant="h4">دفع قسط</Typography>
          )}
          <Typography variant="body1" gutterBottom>
            اسم العميل : {selectedInstallment.party_name || "غير معروف"}
          </Typography>
          <Typography variant="body1" gutterBottom>
            اجمالى الفاتورة : {selectedInstallment.total * -1}
          </Typography>
          <Typography variant="body1" gutterBottom>
            المقدم : {selectedInstallment.paid}
          </Typography>
          <Typography variant="body1" gutterBottom>
            اجمالى المدفوع: {selectedInstallment.paid + paid}
          </Typography>
          {!selectedInstallment.ended && (
            <>
              <Typography variant="body1" gutterBottom>
                عدد الاقساط المتبقية: {remainingInstallmentsCount}
              </Typography>
              <Typography variant="body1" gutterBottom>
                قيمة القسط: {installmentSize}
              </Typography>
              <Typography
                variant="body1"
                gutterBottom
                color={
                  new Date(nextInstallmentTime).getTime() < new Date().getTime()
                    ? "error"
                    : ""
                }
              >
                موعد القسط القادم:{" "}
                {new Date(nextInstallmentTime).toLocaleString("ar-EG")}
              </Typography>

              <TextField
                label="المبلغ"
                type="number"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value))}
                inputProps={{
                  inputMode: "decimal",
                }}
              />
            </>
          )}
        </CardContent>
        <CardActions>
          {!selectedInstallment.ended && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                pay({
                  id: selectedInstallment.id,
                  amount: amount,
                });
              }}
            >
              دفع
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => {
              setSelectedInstallment(null);
            }}
          >
            رجوع
          </Button>
        </CardActions>
      </Card>
    </Grid>
  );
};

export default PayInstallment;

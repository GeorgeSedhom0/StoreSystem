import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { Employee } from "../../utils/types";
import { Dispatch, SetStateAction, useState } from "react";
import dayjs from "dayjs";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { AlertMsg } from "../../Shared/AlertMessage";
import usePaymentMethods from "../../Shared/hooks/usePaymentMethods";

const postNewSalary = async ({
  id,
  bonus,
  deductions,
  date,
  paymentMethodId,
}: {
  id: number;
  bonus: number;
  deductions: number;
  date: dayjs.Dayjs;
  paymentMethodId: number | "";
}) => {
  const formData = new FormData();

  const month = date.set("date", 1).valueOf();
  formData.append("bonus", bonus.toString());
  formData.append("deductions", deductions.toString());
  formData.append("month", month.toString());
  formData.append("time", date.toISOString());
  if (paymentMethodId !== "") {
    formData.append("payment_method_id", paymentMethodId.toString());
  }

  await axios.post(`/employees/${id}/pay-salary`, formData);
};

const PaySalary = ({
  employee,
  closeModal,
  setMsg,
}: {
  employee: Employee;
  closeModal: () => void;
  setMsg: Dispatch<SetStateAction<AlertMsg>>;
}) => {
  const [bonus, setBonus] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [date, setDate] = useState(dayjs());
  const [paymentMethodId, setPaymentMethodId] = useState<number | "">("");
  const { paymentMethods } = usePaymentMethods();

  const { mutate: paySalary } = useMutation({
    mutationFn: postNewSalary,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم دفع الراتب بنجاح" });
      closeModal();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ اثناء دفع الراتب" });
    },
  });

  return (
    <>
      <DialogTitle>دفع الراتب</DialogTitle>
      <DialogContent>
        <FormControl>
          <Grid2 container gap={2} direction="column" mt={2}>
            <TextField
              label="الحافذ"
              type="number"
              value={bonus}
              onChange={(e) => setBonus(parseFloat(e.target.value) || 0)}
              slotProps={{
                input: {
                  inputMode: "decimal",
                },
              }}
            />
            <TextField
              label="الخصم"
              type="number"
              value={deductions}
              onChange={(e) => setDeductions(parseFloat(e.target.value) || 0)}
              slotProps={{
                input: {
                  inputMode: "decimal",
                },
              }}
            />
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                value={date}
                label="راتب لشهر"
                onChange={(newValue) => {
                  if (newValue) setDate(newValue);
                }}
                // Show only the month and year views
                views={["year", "month"]}
                openTo="month"
              />
            </LocalizationProvider>
            <FormControl fullWidth>
              <InputLabel>الحساب</InputLabel>
              <Select
                label="الحساب"
                value={paymentMethodId}
                onChange={(e) =>
                  setPaymentMethodId(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              >
                <MenuItem value="">
                  <em>نقدي (افتراضي)</em>
                </MenuItem>
                {paymentMethods.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid2>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            paySalary({
              id: employee.id,
              bonus,
              deductions,
              date,
              paymentMethodId,
            });
          }}
        >
          دفع
        </Button>
      </DialogActions>
    </>
  );
};

export default PaySalary;

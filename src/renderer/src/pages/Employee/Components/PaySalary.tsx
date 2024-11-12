import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  TextField,
} from "@mui/material";
import { Employee } from "../../../utils/types";
import { Dispatch, SetStateAction, useState } from "react";
import dayjs from "dayjs";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { AlertMsg } from "../../Shared/AlertMessage";

const postNewSalary = async ({
  id,
  bonus,
  deductions,
  date,
}: {
  id: number;
  bonus: number;
  deductions: number;
  date: dayjs.Dayjs;
}) => {
  const formData = new FormData();

  const month = date.set("date", 1).valueOf();
  formData.append("bonus", bonus.toString());
  formData.append("deductions", deductions.toString());
  formData.append("month", month.toString());
  formData.append("time", date.toISOString());

  await axios.post(
    import.meta.env.VITE_SERVER_URL + `/employees/${id}/pay-salary`,
    formData,
  );
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
          <Grid container gap={2} direction="column" mt={2}>
            <TextField
              label="الحافذ"
              type="number"
              value={bonus}
              onChange={(e) => setBonus(parseFloat(e.target.value) || 0)}
              inputProps={{
                inputMode: "decimal",
              }}
            />
            <TextField
              label="الخصم"
              type="number"
              value={deductions}
              onChange={(e) => setDeductions(parseFloat(e.target.value) || 0)}
              inputProps={{
                inputMode: "decimal",
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
          </Grid>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            paySalary({ id: employee.id, bonus, deductions, date });
          }}
        >
          دفع
        </Button>
      </DialogActions>
    </>
  );
};

export default PaySalary;

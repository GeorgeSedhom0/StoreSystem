import { Dispatch, SetStateAction, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from "@mui/material";

import { Employee } from "../../../utils/types";
import axios from "axios";
import { AlertMsg } from "../../Shared/AlertMessage";

const addEmployee = async (employee: Employee) => {
  const { data } = await axios.post<Employee>(
    import.meta.env.VITE_SERVER_URL + "/employees",
    employee,
    {
      params: {
        store_id: import.meta.env.VITE_STORE_ID,
      },
    }
  );
  return data;
};

const editEmployee = async ({ id, ...employee }: Employee) => {
  const { data } = await axios.put<Employee>(
    import.meta.env.VITE_SERVER_URL + `/employees/${id}`,
    employee
  );
  return data;
};

const EmployeeForm = ({
  employee = null,
  closeModal,
  refetch,
  setMsg,
}: {
  employee: Employee | null;
  closeModal: () => void;
  refetch: () => void;
  setMsg: Dispatch<SetStateAction<AlertMsg>>;
}) => {
  const [name, setName] = useState(employee?.name ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [address, setAddress] = useState(employee?.address ?? "");
  const [salary, setSalary] = useState(employee?.salary ?? 0);
  const [joiningDate, setJoiningDate] = useState(
    employee?.started_on ? dayjs(employee.started_on) : dayjs()
  );

  const addMutation = useMutation({
    mutationFn: addEmployee,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم اضافة الموظف بنجاح" });
      closeModal();
      refetch();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ اثناء اضافة الموظف" });
    },
  });

  const editMutation = useMutation({
    mutationFn: editEmployee,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم تعديل بيانات الموظف بنجاح" });
      closeModal();
      refetch();
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ اثناء تعديل بيانات الموظف" });
    },
  });

  const handleSubmit = () => {
    const payload: Employee = {
      id: employee?.id ?? 0,
      name,
      phone,
      address,
      salary,
      started_on: joiningDate.toISOString(),
    };

    if (employee) {
      editMutation.mutate(payload);
    } else {
      addMutation.mutate(payload);
    }
  };

  return (
    <>
      <DialogTitle>
        <Typography variant="h5">
          {employee ? "تعديل تفاصيل موظف" : "تعيين الموضف"}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Grid container direction="column" spacing={3} py={3}>
          <Grid item>
            <TextField
              value={name}
              label="الاسم"
              variant="outlined"
              id="employeeNameField"
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item>
            <TextField
              value={phone}
              label="رقم الهاتف"
              variant="outlined"
              id="employeNumberField"
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item>
            <TextField
              value={address}
              label="Address"
              variant="outlined"
              id="employeeAddressField"
              onChange={(e) => setAddress(e.target.value)}
              fullWidth
            />
          </Grid>
          <Grid item>
            <TextField
              type="number"
              value={salary}
              label="Salary"
              variant="outlined"
              id="employeeSalaryField"
              onChange={(e) => setSalary(parseFloat(e.target.value))}
              fullWidth
            />
          </Grid>
          <Grid item>
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                value={joiningDate}
                label="Joining Date"
                onChange={(newValue) => {
                  if (newValue) setJoiningDate(newValue);
                }}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button
          color="primary"
          variant="contained"
          onClick={handleSubmit}
          id="employeeAddSubmitBtn"
          disabled={addMutation.isPending || editMutation.isPending}
        >
          {employee ? "حفظ التعديلات" : "تعيين الموضف"}
        </Button>
        <Button variant="contained" onClick={closeModal}>
          الغاء
        </Button>
      </DialogActions>
    </>
  );
};

export default EmployeeForm;

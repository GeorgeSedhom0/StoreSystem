import axios from "axios";
import { useEffect, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { useQuery } from "@tanstack/react-query";
import {
  Grid,
  Card,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
} from "@mui/material";

import EmployeeRow from "./Components/EmployeeRow";
import LoadingScreen from "../Shared/LoadingScreen";
import EmployeeForm from "./Components/EmployeeForm";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  Employee as EmployeeType,
  SelectedEmployeeType,
} from "../../utils/types";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";
import PaySalary from "./Components/PaySalary";

const getEmployee = async () => {
  const { data } = await axios.get<EmployeeType[]>(
    import.meta.env.VITE_SERVER_URL + "/employees",
  );
  return data;
};

export default function Employee() {
  const {
    data: employee,
    isFetching: isLoading,
    refetch,
  } = useQuery({
    queryKey: ["employee"],
    queryFn: getEmployee,
    initialData: [],
  });

  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [selectedEmployee, setSelectedEmployee] =
    useState<SelectedEmployeeType>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isPaySalaryModalOpen, setIsPaySalaryModalOpen] =
    useState<boolean>(false);

  const openEditModal = () => {
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedEmployee(null);
  };

  const openDeleteModal = () => {
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setSelectedEmployee(null);
  };

  const handleSelectEmployee = (
    employee: SelectedEmployeeType,
    addingNew: boolean = false,
  ) => {
    if (addingNew) openEditModal();
    else setSelectedEmployee(employee);
  };

  const handleDelEmployee = async () => {
    try {
      await axios.delete(
        import.meta.env.VITE_SERVER_URL + "/employees/" + selectedEmployee?.id,
      );

      setMsg({ type: "success", text: "تم انهاء التعيين بنجاح" });
      closeDeleteModal();
      refetch();
    } catch (err) {
      setMsg({ type: "error", text: "حدث خطأ ما!" });
    }
  };

  useEffect(() => {
    if (!selectedEmployee) return;

    if (selectedEmployee.purpose === "edit") {
      openEditModal();
      return;
    }
    if (selectedEmployee.purpose === "del") {
      openDeleteModal();
      return;
    }
    if (selectedEmployee.purpose === "pay") {
      setIsPaySalaryModalOpen(true);
      return;
    }
  }, [selectedEmployee]);

  return (
    <>
      <Button
        id="addEmployeeBtn"
        variant="contained"
        onClick={() => handleSelectEmployee(null, true)}
      >
        إضافة موظف جديد
      </Button>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid container spacing={3} sx={{ marginTop: "10px" }}>
        <Grid item xs={12}>
          <Card
            elevation={3}
            sx={{
              position: "relative",
              height: 600,
            }}
          >
            <LoadingScreen loading={isLoading} />
            <TableVirtuoso
              fixedHeaderContent={fixedHeaderContent}
              components={VirtuosoTableComponents}
              data={employee}
              itemContent={(_, employee) => (
                <EmployeeRow
                  employee={employee}
                  selectEmployee={handleSelectEmployee}
                />
              )}
            />
          </Card>
        </Grid>
      </Grid>

      <Dialog open={isEditModalOpen} onClose={closeEditModal}>
        <EmployeeForm
          employee={selectedEmployee}
          closeModal={closeEditModal}
          refetch={refetch}
          setMsg={setMsg}
        />
      </Dialog>

      <Dialog
        open={isPaySalaryModalOpen}
        onClose={() => setIsPaySalaryModalOpen(false)}
      >
        {selectedEmployee && (
          <PaySalary
            employee={selectedEmployee}
            closeModal={() => setIsPaySalaryModalOpen(false)}
            setMsg={setMsg}
          />
        )}
      </Dialog>

      <Dialog open={isDeleteModalOpen} onClose={closeDeleteModal}>
        <DialogTitle>
          <Typography>
            هل انت متأكد من حذف الموظف {selectedEmployee?.name}؟
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Grid container columnGap={2} sx={{ marginTop: "20px" }}>
            <Button
              color="error"
              variant="contained"
              id="employeeDelConfirmBtn"
              onClick={handleDelEmployee}
            >
              تاكيد
            </Button>
            <Button color="info" variant="contained" onClick={closeDeleteModal}>
              إلغاء
            </Button>
          </Grid>
        </DialogContent>
      </Dialog>
    </>
  );
}

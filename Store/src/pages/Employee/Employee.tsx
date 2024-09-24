import axios from "axios";
import { useEffect, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { useQuery } from "@tanstack/react-query";
import { Grid, Card, Modal, Box, Typography, Button } from "@mui/material";

import EmployeeRow from "./Components/EmployeeRow";
import LoadingScreen from "../Shared/LoadingScreen";
import EmployeeForm from "./Components/EmployeeForm";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import { Employee as EmployeeType, SelectedEmployeeType } from "../../utils/types";
import { fixedHeaderContent, VirtuosoTableComponents } from "./Components/VirtualTableHelpers";

const modalStyle = {
    position: 'absolute' as 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 400,
    bgcolor: 'background.paper',
    boxShadow: 24,
    p: 4,
};

const getEmployee = async () => {
    const { data } = await axios.get<EmployeeType[]>(
        import.meta.env.VITE_SERVER_URL + "/employees"
    );
    return data;
};

export default function Employee() {
    const { data: employee, isLoading, refetch } = useQuery({
        queryKey: ["employee"],
        queryFn: getEmployee,
        initialData: []
    });

    const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
    const [selectedEmployee, setSelectedEmployee] = useState<SelectedEmployeeType>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

    const openEditModal = () => {
        setIsEditModalOpen(true);
    }

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setSelectedEmployee(null);
    }

    const openDeleteModal = () => {
        setIsDeleteModalOpen(true);
    }

    const closeDeleteModal = () => {
        setIsDeleteModalOpen(false);
        setSelectedEmployee(null);
    }

    const handleSelectEmployee = (employee: SelectedEmployeeType, addingNew: boolean = false) => {
        if (addingNew) openEditModal();
        else setSelectedEmployee(employee)
    }

    const handleAddEmployee = async (newEmployee: EmployeeType) => {
        try {
            await axios.post(
                import.meta.env.VITE_SERVER_URL + "/employees/",
                newEmployee
            );
            setMsg({ type: 'success', text: 'Added successfully!' });
            closeEditModal();
            refetch();
        }
        catch (err) {
            setMsg({ type: 'error', text: 'Something went wrong!' });
        }
    }

    const handleEditEmployee = async (updatedEmployee: EmployeeType) => {
        try {
            await axios.put(
                import.meta.env.VITE_SERVER_URL + "/employees/" + selectedEmployee?.id,
                updatedEmployee
            );
            setMsg({ type: 'success', text: 'Added successfully!' });
            closeEditModal();
            refetch();
        }
        catch (err) {
            setMsg({ type: 'error', text: 'Something went wrong!' });
        }
    }

    const handleDelEmployee = async () => {
        try {
            await axios.delete(import.meta.env.VITE_SERVER_URL + "/employees/" + selectedEmployee?.id);
            setMsg({ type: 'success', text: 'Removed successfully!' });
            closeDeleteModal();
            refetch();
        }
        catch (err) {
            setMsg({ type: 'error', text: 'Something went wrong!' });
        }
    }


    useEffect(() => {
        if (!selectedEmployee) return;

        if (selectedEmployee.purpose === "edit") openEditModal();
        else openDeleteModal();

    }, [selectedEmployee]);

    return (
        <>
            <Button
                color="info"
                variant="contained"
                onClick={() => handleSelectEmployee(null, true)}
            >
                Add New Employee
            </Button>
            <AlertMessage message={msg} setMessage={setMsg} />
            <Grid container spacing={3} sx={{ marginTop: '10px' }}>
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
            <Modal
                open={isEditModalOpen}
                onClose={closeEditModal}
            >
                <Box sx={modalStyle}>
                    <EmployeeForm
                        employee={selectedEmployee}
                        addEmployee={handleAddEmployee}
                        editEmployee={handleEditEmployee}
                        closeModal={closeEditModal}
                    />
                </Box>
            </Modal>

            <Modal
                open={isDeleteModalOpen}
                onClose={closeDeleteModal}
            >
                <Box sx={modalStyle}>
                    <Typography>Are you sure you wan to delete selected employee?</Typography>
                    <Grid container columnGap={2} sx={{ marginTop: "20px" }}>
                        <Button
                            color="error"
                            variant="contained"
                            type="submit"
                            onClick={handleDelEmployee}
                        >
                            Confirm
                        </Button>
                        <Button
                            color="info"
                            variant="contained"
                            onClick={closeDeleteModal}
                        >
                            Cancel
                        </Button>
                    </Grid>
                </Box>
            </Modal>
        </>
    )
}

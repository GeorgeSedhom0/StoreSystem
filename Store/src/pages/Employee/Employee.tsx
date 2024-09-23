import axios from "axios";
import { useEffect, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { useQuery } from "@tanstack/react-query";
import { Grid, Card, Modal, Box, Typography } from "@mui/material";

import EmployeeRow from "./Components/EmployeeRow";
import LoadingScreen from "../Shared/LoadingScreen";
import { Employee as EmployeeType } from "../../utils/types";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import { fixedHeaderContent, VirtuosoTableComponents } from "./Components/VirtualTableHelpers";
import EmployeeForm from "./Components/EmployeeForm";

const getEmployee = async () => {
    const { data } = await axios.get<EmployeeType[]>(
        import.meta.env.VITE_SERVER_URL + "/employees"
    );
    return data;
};

export default function Employee() {
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeType & { purpose: 'edit' | 'del' } | null>(null);
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

    const [msg, setMsg] = useState<AlertMsg>({
        type: "",
        text: "",
    });

    const { data: employee, isLoading } = useQuery({
        queryKey: ["employee"],
        queryFn: getEmployee,
        initialData: []
    });

    useEffect(() => {
        if (!selectedEmployee) return;

        if (selectedEmployee.purpose === "edit") openEditModal();
        else openDeleteModal();

    }, [selectedEmployee]);

    return (
        <>
            <AlertMessage message={msg} setMessage={setMsg} />
            <Grid container spacing={3}>
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
                <Box>
                    <EmployeeForm />
                </Box>
            </Modal>

            <Modal
                open={isDeleteModalOpen}
                onClose={closeDeleteModal}
            >
                <Box>
                    <Typography>Are you sure you wan to delete selected employee?</Typography>
                </Box>
            </Modal>
        </>
    )
}

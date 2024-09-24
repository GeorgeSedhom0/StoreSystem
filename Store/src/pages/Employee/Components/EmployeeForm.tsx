import { useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { Button, FormControl, FormGroup, Grid, TextField, Typography } from '@mui/material';

import { Employee as EmployeeType, SelectedEmployeeType } from '../../../utils/types';

interface PropsType {
    employee: SelectedEmployeeType | null;
    addEmployee: (employee: EmployeeType) => void;
    editEmployee: (employee: EmployeeType) => void;
    closeModal: () => void;
}

export default function EmployeeForm(props: PropsType) {
    const { employee, addEmployee, editEmployee, closeModal } = props;
    const [name, setName] = useState(employee?.name);
    const [phone, setPhone] = useState(employee?.phone);
    const [address, setAddress] = useState(employee?.address);
    const [salary, setSalary] = useState(employee?.salary);
    const [joiningDate, setJoiningDate] = useState<Dayjs>(
        employee?.started_on ? dayjs(employee?.started_on) : dayjs().startOf("day")
    );

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const payload: any = {
            name,
            phone,
            address,
            salary,
            started_on: joiningDate
        }

        if (employee !== null) editEmployee(payload);
        else addEmployee(payload);
    }

    return (
        <form onSubmit={handleSubmit}>
            <FormGroup>
                <Grid container direction="column" gap={3}>
                    <Typography variant='h5'>{employee ? "Edit " : "Add "} Employee</Typography>
                    <FormControl>
                        <TextField
                            required
                            type='text'
                            value={name}
                            label="Name"
                            variant="outlined"
                            onChange={(e) => setName(e.target.value)}
                        />
                    </FormControl>
                    <FormControl>
                        <TextField
                            required
                            type='number'
                            value={phone}
                            label="Phone"
                            variant="outlined"
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </FormControl>
                    <FormControl>
                        <TextField
                            required
                            type='text'
                            value={address}
                            label="Address"
                            variant="outlined"
                            onChange={(e) => setAddress(e.target.value)}
                        />
                    </FormControl>
                    <FormControl>
                        <TextField
                            required
                            type='number'
                            value={salary}
                            label="Salary"
                            variant="outlined"
                            onChange={(e) => setSalary(parseFloat(e.target.value))}
                        />
                    </FormControl>
                    <FormControl>
                        <LocalizationProvider
                            dateAdapter={AdapterDayjs}
                            adapterLocale="ar-sa"
                        >
                            <DatePicker
                                value={joiningDate}
                                label="Joining Date"
                                onChange={(newValue) => {
                                    if (!newValue) return;
                                    setJoiningDate(newValue)
                                }}
                            />
                        </LocalizationProvider>
                    </FormControl>
                </Grid>
            </FormGroup>
            <Grid container columnGap={2} sx={{ marginTop: "20px" }}>
                <Button
                    color="success"
                    variant="contained"
                    type="submit"
                >
                    Confirm
                </Button>
                <Button
                    color="info"
                    variant="contained"
                    onClick={closeModal}
                >
                    Cancel
                </Button>
            </Grid>
        </form>
    )
}

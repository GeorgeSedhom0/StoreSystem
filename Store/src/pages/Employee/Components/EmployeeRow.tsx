import { Button, Grid, TableCell } from '@mui/material'

import { Employee as EmployeeType, SelectedEmployeeType } from '../../../utils/types'

interface PropsType {
    employee: EmployeeType,
    selectEmployee: (e: SelectedEmployeeType) => void;
}

export default function EmployeeRow(props: PropsType) {
    const { employee, selectEmployee } = props;
    return (
        <>
            <TableCell>{employee.id}</TableCell>
            <TableCell>{employee.name}</TableCell>
            <TableCell>{employee.phone}</TableCell>
            <TableCell>{employee.address}</TableCell>
            <TableCell>{employee.salary}</TableCell>
            <TableCell>{new Date(employee.started_on).toLocaleDateString("ar-EG")}</TableCell>
            <TableCell>
                {employee.stopped_on ? new Date(employee.stopped_on).toLocaleDateString("ar-EG") : "Currently working"}
            </TableCell>
            <TableCell colSpan={2}>
                <Grid container>
                    <Grid item xs={6}>
                        <Button
                            color="info"
                            variant="contained"
                            className="employeeEditBtn"
                            onClick={() => selectEmployee({ ...employee, purpose: 'edit' })}
                        >
                            Edit
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button
                            color="error"
                            variant="contained"
                            className="employeeDelBtn"
                            onClick={() => selectEmployee({ ...employee, purpose: 'del' })}
                        >
                            Remove
                        </Button>
                    </Grid>
                </Grid>
            </TableCell>
        </>
    )
}

import { Button, Grid, TableCell } from '@mui/material'

import { Employee } from '../../../utils/types'

export default function EmployeeRow({ employee }: { employee: Employee }) {
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
                        <Button color="info" variant="contained">Edit</Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button color="error" variant="contained">Remove</Button>
                    </Grid>
                </Grid>
            </TableCell>
        </>
    )
}

import {
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import React from "react";
import { TableComponents } from "react-virtuoso";
import { Employee } from "../../../utils/types";

export const fixedHeaderContent = () => {
  return (
    <TableRow
      sx={{
        bgcolor: "background.paper",
      }}
    >
      <TableCell>ID</TableCell>
      <TableCell>Name</TableCell>
      <TableCell>Phone</TableCell>
      <TableCell>Address</TableCell>
      <TableCell>Salary</TableCell>
      <TableCell>Joining Date</TableCell>
      <TableCell>End Datae</TableCell>
      <TableCell colSpan={2}>Action</TableCell>
    </TableRow>
  );
};

export const VirtuosoTableComponents: TableComponents<Employee> = {
  Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
    <TableContainer {...props} ref={ref} />
  )),
  Table: (props) => (
    <Table
      {...props}
      sx={{ borderCollapse: "separate", tableLayout: "fixed" }}
    />
  ),
  TableRow: ({ item: _item, ...props }) => <TableRow {...props} />,
  TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => (
    <TableBody {...props} ref={ref} />
  )),
};

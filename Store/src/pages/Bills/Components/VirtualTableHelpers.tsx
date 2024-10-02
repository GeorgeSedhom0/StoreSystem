import {
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import React from "react";
import { TableComponents } from "react-virtuoso";
import { Bill } from "../../../utils/types";

export const fixedHeaderContent = () => {
  return (
    <TableRow
      sx={{
        bgcolor: "background.paper",
      }}
    >
      <TableCell>رقم الفاتورة</TableCell>
      <TableCell>نوع الفاتورة</TableCell>
      <TableCell>الوقت</TableCell>
      <TableCell>الخصم</TableCell>
      <TableCell>الاجمالى</TableCell>
      <TableCell>معاينة او طباعة</TableCell>
      <TableCell>الطرف الثانى</TableCell>
    </TableRow>
  );
};

export const VirtuosoTableComponents: TableComponents<Bill> = {
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

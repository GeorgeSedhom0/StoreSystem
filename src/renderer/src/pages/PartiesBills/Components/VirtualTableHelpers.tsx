import {
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import React from "react";
import { TableComponents } from "react-virtuoso";
import { CollectionBill } from "../../utils/types";
import CollectionBillComponent from "./CollectionBill";

export const fixedHeaderContent = () => {
  return (
    <TableRow
      sx={{
        bgcolor: "background.paper",
      }}
    >
      <TableCell>رقم المجموعة</TableCell>
      <TableCell>نوع الفواتير</TableCell>
      <TableCell>الوقت</TableCell>
      <TableCell>الاجمالى</TableCell>
      <TableCell>معاينة او طباعة</TableCell>
      <TableCell>الطرف الثانى</TableCell>
      <TableCell>الحالة</TableCell>
    </TableRow>
  );
};

export const VirtuosoTableComponents: TableComponents<CollectionBill> = {
  Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
    <TableContainer {...props} ref={ref} />
  )),
  Table: (props) => (
    <Table
      {...props}
      sx={{ borderCollapse: "separate", tableLayout: "fixed" }}
    />
  ),
  TableRow: CollectionBillComponent,
  TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => (
    <TableBody {...props} ref={ref} />
  )),
};

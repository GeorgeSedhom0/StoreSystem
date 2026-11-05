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
      <TableCell>الإجمالي</TableCell>
      <TableCell sx={{ width: 230 }}>معاينة أو طباعة</TableCell>
      <TableCell>الطرف الثاني</TableCell>
      <TableCell sx={{ width: 100 }}>الحالة</TableCell>
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

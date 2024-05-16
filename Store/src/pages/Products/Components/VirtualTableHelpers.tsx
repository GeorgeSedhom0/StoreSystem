import {
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import React from "react";
import { TableComponents } from "react-virtuoso";
import { Product } from "../../../utils/types";

export const fixedHeaderContent = () => {
  return (
    <TableRow
      sx={{
        bgcolor: "grey.900",
      }}
    >
      <TableCell>اسم المنتج</TableCell>
      <TableCell>البار كود</TableCell>
      <TableCell>السعر</TableCell>
      <TableCell>سعر الشراء</TableCell>
      <TableCell>الكمية</TableCell>
      <TableCell>المجموعة</TableCell>
      <TableCell></TableCell>
    </TableRow>
  );
};

export const VirtuosoTableComponents: TableComponents<Product> = {
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

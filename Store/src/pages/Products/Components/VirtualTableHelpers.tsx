import {
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableBody,
  Paper,
} from "@mui/material";
import React from "react";
import { TableComponents } from "react-virtuoso";
import { Product } from "../../../utils/types";

export const fixedHeaderContent = () => {
  return (
    <TableRow
      sx={{
        backgroundColor: "background.paper",
      }}
    >
      <TableCell>اسم المنتج</TableCell>
      <TableCell>البار كود</TableCell>
      <TableCell>السعر</TableCell>
      <TableCell>سعر الجملة</TableCell>
      <TableCell>الكمية</TableCell>
      <TableCell>الصنف</TableCell>
      <TableCell></TableCell>
    </TableRow>
  );
};

export const VirtuosoTableComponents: TableComponents<Product> = {
  Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
    <TableContainer
      component={Paper}
      {...props}
      ref={ref}
      sx={{
        border: "1px solid gray",
      }}
    />
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

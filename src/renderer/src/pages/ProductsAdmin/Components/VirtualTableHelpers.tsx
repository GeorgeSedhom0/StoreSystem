import {
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import React from "react";
import { TableComponents } from "react-virtuoso";
import { AdminProduct } from "../../../utils/types";

export const fixedHeaderContent = ({ stores }: { stores: string[] }) => {
  return (
    <TableRow
      sx={{
        bgcolor: "background.paper",
      }}
    >
      <TableCell>اسم المنتج</TableCell>
      <TableCell>البار كود</TableCell>
      <TableCell>السعر</TableCell>
      <TableCell>سعر الشراء</TableCell>
      {stores.map((store) => (
        <TableCell key={store}>الكمية فى {store}</TableCell>
      ))}
      {stores.map((store) => (
        <TableCell key={store}>المحجوز في {store}</TableCell>
      ))}
      <TableCell>المجموعة</TableCell>
    </TableRow>
  );
};

export const VirtuosoTableComponents: TableComponents<AdminProduct> = {
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

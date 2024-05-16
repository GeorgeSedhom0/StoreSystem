import {
  TableContainer,
  Table,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import React from "react";
import { TableComponents } from "react-virtuoso";
import { CashFlow } from "../../../utils/types";

export const fixedHeaderContent = () => {
  return (
    <TableRow
      sx={{
        bgcolor: "grey.900",
      }}
    >
      <TableCell>الوقت</TableCell>
      <TableCell>المبلغ</TableCell>
      <TableCell>نوع الحركة</TableCell>
      <TableCell>الوصف</TableCell>
      <TableCell>المجموع</TableCell>
    </TableRow>
  );
};

export const VirtuosoTableComponents: TableComponents<CashFlow> = {
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

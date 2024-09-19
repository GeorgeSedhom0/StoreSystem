import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { Bill as BillType } from "./types";

export default function ProductView({ bill }: { bill: BillType }) {
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>S. No</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Price</TableCell>
            <TableCell>Amount</TableCell>
            <TableCell>Wholesale Price</TableCell>
            <TableCell>Barcode</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {
            bill.products.map((val, index: number) => (
              <TableRow key={index}>
                <TableCell sx={{ borderBottom: "none" }}>{index + 1}</TableCell>
                <TableCell sx={{ borderBottom: "none" }}>{val.name}</TableCell>
                <TableCell sx={{ borderBottom: "none" }}>{val.amount}</TableCell>
                <TableCell sx={{ borderBottom: "none" }}>{val.price}</TableCell>
                <TableCell sx={{ borderBottom: "none" }}>{val.wholesale_price}</TableCell>
                <TableCell sx={{ borderBottom: "none" }}>{val.bar_code}</TableCell>
              </TableRow>
            ))
          }
        </TableBody>
      </Table>
    </TableContainer>
  )
}

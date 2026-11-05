import {
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Bill as BillType } from "./types";
import { lineView } from "../Shared/packages";

const ProductsView = ({ bill }: { bill: BillType }) => {
  return (
    <TableCell colSpan={7}>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>المنتج</TableCell>
              <TableCell>الكمية</TableCell>
              <TableCell>
                {bill.type === "buy" || bill.type === "buy-return"
                  ? "سعر الشراء"
                  : "سعر البيع"}
              </TableCell>
              <TableCell>الإجمالي</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bill.products.map((product, index: number) => {
              const v = lineView(product);
              const isBuy = bill.type === "buy" || bill.type === "buy-return";
              return (
                <TableRow key={index}>
                  <TableCell sx={{ borderBottom: "none" }}>
                    {v.name}
                    {v.unitLabel && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="secondary"
                        label={v.unitLabel}
                        sx={{ mx: 1 }}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ borderBottom: "none" }}>{v.qty}</TableCell>
                  <TableCell sx={{ borderBottom: "none" }}>
                    {(isBuy ? v.wholesale : v.price).toFixed(2)}
                  </TableCell>
                  <TableCell sx={{ borderBottom: "none" }}>
                    {(isBuy ? v.wholesaleTotal : v.total).toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })}
            {bill.discount > 0 && (
              <TableRow>
                <TableCell sx={{ borderBottom: "none" }}>خصم</TableCell>
                <TableCell sx={{ borderBottom: "none" }}></TableCell>
                <TableCell sx={{ borderBottom: "none" }}></TableCell>
                <TableCell sx={{ borderBottom: "none" }}>
                  {bill.discount.toFixed(2)}
                </TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell sx={{ borderBottom: "none" }}>الإجمالي</TableCell>
              <TableCell sx={{ borderBottom: "none" }}></TableCell>
              <TableCell sx={{ borderBottom: "none" }}></TableCell>
              <TableCell sx={{ borderBottom: "none" }}>
                {Math.abs(bill.total).toFixed(2)}
              </TableCell>
            </TableRow>
            {bill.note && bill.note.trim() && (
              <TableRow>
                <TableCell sx={{ borderBottom: "none" }} colSpan={4}>
                  <strong>ملاحظة الفاتورة:</strong>
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      marginTop: "0.25rem",
                    }}
                  >
                    {bill.note}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </TableCell>
  );
};

export default ProductsView;

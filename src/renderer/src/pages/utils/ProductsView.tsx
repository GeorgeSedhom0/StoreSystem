import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Bill as BillType } from "./types";

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
              <TableCell>الاجمالى</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bill.products.map((product, index: number) => (
              <TableRow key={index}>
                <TableCell sx={{ borderBottom: "none" }}>
                  {product.name}
                </TableCell>
                <TableCell sx={{ borderBottom: "none" }}>
                  {Math.abs(product.amount)}
                </TableCell>
                <TableCell sx={{ borderBottom: "none" }}>
                  {bill.type === "buy" || bill.type === "buy-return"
                    ? product.wholesale_price.toFixed(2)
                    : product.price.toFixed(2)}
                </TableCell>
                <TableCell sx={{ borderBottom: "none" }}>
                  {bill.type === "buy" || bill.type === "buy-return"
                    ? Math.abs(
                        product.wholesale_price * product.amount,
                      ).toFixed(2)
                    : Math.abs(product.price * product.amount).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
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
              <TableCell sx={{ borderBottom: "none" }}>الاجمالى</TableCell>
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

import {
  Card,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Bill as BillType } from "../../../utils/types";
import { useCallback } from "react";
import { AlertMsg } from "../../Shared/AlertMessage";
import axios from "axios";
import DeleteIcon from "@mui/icons-material/Delete";

const Bill = ({
  bill,
  setMsg,
  getBills,
}: {
  bill: BillType;
  setMsg: (msg: AlertMsg) => void;
  getBills: () => void;
}) => {
  const deleteBill = useCallback(async () => {
    try {
      await axios.delete(`http://localhost:8000/bill/${bill.id}`);
      setMsg({ type: "success", text: "تم حذف الفاتورة بنجاح" });
      getBills();
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ ما" });
    }
  }, [bill]);

  return (
    <Card elevation={10} sx={{ p: 2, height: 500, overflowY: "auto" }}>
      <Grid container spacing={3} justifyContent="center">
        <Grid
          item
          xs={12}
          sx={{
            position: "relative",
          }}
        >
          <IconButton
            sx={{
              position: "absolute",
              top: 10,
              left: 10,
            }}
            onClick={deleteBill}
            color="error"
          >
            <DeleteIcon />
          </IconButton>
          <Typography variant="h6" align="center">
            فاتورة{" "}
            {bill.total == 0 ? "بيع اجل" : bill.total > 0 ? `بيع` : `شراء`}
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="body1" align="center">
            {new Date(bill.time).toLocaleDateString("ar-EG", {
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            })}
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>اسم المنتج</TableCell>
                  <TableCell>السعر</TableCell>
                  <TableCell>الكمية</TableCell>
                  <TableCell>المجموع</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bill.products.map((product) => {
                  const productPrice =
                    bill.total == 0
                      ? 0
                      : bill.total > 0
                      ? product.price
                      : product.wholesale_price;
                  return (
                    <TableRow key={product.name}>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{productPrice}</TableCell>
                      <TableCell>{Math.abs(product.amount)}</TableCell>
                      <TableCell>
                        {productPrice * Math.abs(product.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
        <Grid item xs={12}>
          <TableContainer>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>المجموع المبدئي</TableCell>
                  <TableCell>
                    {Math.abs(bill.total) + Math.abs(bill.discount)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>الخصم</TableCell>
                  <TableCell>{bill.discount}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>المجموع</TableCell>
                  <TableCell>{Math.abs(bill.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Card>
  );
};

export default Bill;

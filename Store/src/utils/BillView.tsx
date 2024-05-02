import {
  Button,
  createTheme,
  Dialog,
  DialogActions,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { Bill } from "./types";
import { forwardRef } from "react";

const theme = createTheme({
  direction: "rtl",
  palette: {
    mode: "light",
  },
});

const BillView = forwardRef(
  (
    {
      bill,
      open,
      setOpen,
    }: {
      bill: Bill | null;
      open: boolean;
      setOpen: (open: boolean) => void;
    },
    ref: any
  ) => {
    if (!bill) return null;
    return (
      <ThemeProvider theme={theme}>
        <Dialog open={open} onClose={() => setOpen(false)}>
          <Grid
            container
            spacing={3}
            sx={{
              width: "88mm",
              p: 3,
            }}
            ref={ref}
          >
            <Grid item xs={12}>
              <Typography variant="h4" align="center">
                فحم المهندس
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h6" align="center">
                {
                  {
                    sell: "فاتورة بيع",
                    buy: "فاتورة شراء",
                    return: "فاتورة مرتجع",
                    BNPL: "فاتورة بيع اجل",
                  }[bill.type]
                }
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h6" align="center">
                {new Date(bill.time).toLocaleString("ar-EG")}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>المنتج</TableCell>
                      <TableCell>السعر</TableCell>
                      <TableCell>الكمية</TableCell>
                      <TableCell>ألاجمالى</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bill.products.map((product, i) => (
                      <TableRow key={i}>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>
                          {["sell", "return", "BNPL"].includes(bill.type)
                            ? product.price
                            : product.wholesale_price}
                        </TableCell>
                        <TableCell>{Math.abs(product.amount)}</TableCell>
                        <TableCell>
                          {["sell", "return", "BNPL"].includes(bill.type)
                            ? product.price * Math.abs(product.amount)
                            : product.wholesale_price *
                              Math.abs(product.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
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
          <DialogActions>
            <Button onClick={() => setOpen(false)}>إغلاق</Button>
          </DialogActions>
        </Dialog>
      </ThemeProvider>
    );
  }
);

export default BillView;

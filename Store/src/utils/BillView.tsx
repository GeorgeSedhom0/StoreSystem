import {
  Button,
  createTheme,
  Dialog,
  DialogActions,
  Divider,
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
              width: "150mm",
              p: 0.5,
            }}
            ref={ref}
          >
            <Grid item xs={12}>
              <Typography variant="h2" align="center">
                فحم المهندس
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h5" align="center">
                01276761414
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h5" align="center">
                مول البنوك - مدينة السادات - المنوفية
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h4" align="center">
                {
                  {
                    sell: "فاتورة مبيعات",
                    buy: "فاتورة شراء",
                    return: "فاتورة مرتجع",
                    BNPL: "فاتورة بيع اجل",
                  }[bill.type]
                }
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h4" align="center">
                {new Date(bill.time).toLocaleString("ar-EG")}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Divider />
            </Grid>
            <Grid item xs={12}>
              <TableContainer>
                <Table
                  sx={{
                    // make TableCell size 2em
                    "& .MuiTableCell-root": {
                      fontSize: "2em",
                      textAlign: "center",
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>المنتج</TableCell>
                      <TableCell>الكمية</TableCell>
                      <TableCell>السعر</TableCell>
                      <TableCell>ألاجمالى</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bill.products.map((product, i) => (
                      <TableRow key={i}>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{Math.abs(product.amount)}</TableCell>
                        <TableCell>
                          {["sell", "return", "BNPL"].includes(bill.type)
                            ? product.price
                            : product.wholesale_price}
                        </TableCell>
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
              <Typography variant="h6" align="left">
                اجمالى المنتجات:
                {bill.products.reduce((acc, p) => acc + Math.abs(p.amount), 0)}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Divider />
            </Grid>
            <Grid item xs={12}>
              <TableContainer>
                <Table
                  sx={{
                    // make TableCell size 2em
                    "& .MuiTableCell-root": {
                      fontSize: "2em",
                      textAlign: "center",
                    },
                  }}
                >
                  <TableBody>
                    <TableRow>
                      <TableCell>الاجمالى</TableCell>
                      <TableCell>
                        {Math.abs(bill.total) + Math.abs(bill.discount)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>الخصم</TableCell>
                      <TableCell>{bill.discount}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>الصافى</TableCell>
                      <TableCell>{Math.abs(bill.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h5" align="center">
                عند ارجاع المنتجات لا تقبل الا من خلال هذة الفاتورة
              </Typography>
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

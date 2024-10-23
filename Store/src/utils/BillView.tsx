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
import { forwardRef, useContext } from "react";
import { StoreContext } from "../StoreDataProvider";
import FormatedNumber from "../pages/Shared/FormatedNumber";

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
    const { store } = useContext(StoreContext);
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
                {store.name}{" "}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h5" align="center">
                {store.phone}{" "}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="h5" align="center">
                {store.address}{" "}
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
                    reserve: "فاتورة حجز",
                    installment: "فاتورة تقسيط",
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
                    // make TableCell size 1.5em
                    "& .MuiTableCell-root": {
                      fontSize: "1.5em",
                      textAlign: "center",
                      whiteSpace: "word-wrap",
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell width={200}>المنتج</TableCell>
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
                          <FormatedNumber money>
                            {bill.type === "buy"
                              ? product.wholesale_price
                              : product.price}
                          </FormatedNumber>
                        </TableCell>
                        <TableCell>
                          <FormatedNumber money>
                            {Math.abs(product.amount) *
                              (bill.type === "buy"
                                ? product.wholesale_price
                                : product.price)}
                          </FormatedNumber>
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
                    // make TableCell size 1.5em
                    "& .MuiTableCell-root": {
                      fontSize: "1.5em",
                      textAlign: "center",
                    },
                  }}
                >
                  <TableBody>
                    <TableRow>
                      <TableCell>الاجمالى</TableCell>
                      <TableCell>
                        <FormatedNumber money>
                          {bill.type === "BNPL"
                            ? bill.products.reduce(
                                (acc, p) => acc + Math.abs(p.amount) * p.price,
                                0
                              )
                            : Math.abs(bill.total) + Math.abs(bill.discount)}
                        </FormatedNumber>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>الخصم</TableCell>
                      <TableCell>
                        <FormatedNumber money>{bill.discount}</FormatedNumber>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>الصافى</TableCell>
                      <TableCell>
                        <FormatedNumber money>
                          {bill.type === "BNPL"
                            ? bill.products.reduce(
                                (acc, p) => acc + Math.abs(p.amount) * p.price,
                                0
                              ) - bill.discount
                            : Math.abs(bill.total)}
                        </FormatedNumber>
                      </TableCell>
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

import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  Grid,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { Bill, Product } from "../../../utils/types";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import LoadingScreen from "../../Shared/LoadingScreen";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import DeleteIcon from "@mui/icons-material/Delete";

const EditableBill = ({
  bill,
  setEditing,
  getBills,
}: {
  bill: Bill | null;
  setEditing: Dispatch<SetStateAction<boolean>>;
  getBills: () => void;
}) => {
  if (!bill) return null;
  const [editedBill, setEditedBill] = useState<Bill>({
    ...bill,
    total: Math.abs(bill.total),
    products: bill.products.map((prod) => ({
      ...prod,
      amount: Math.abs(prod.amount),
    })),
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [options, setOptions] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getProds = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(
          import.meta.env.VITE_SERVER_URL + "/products"
        );
        setProducts(data);
      } catch (error) {
        console.log(error);
        // reload the page since these 2 requests are crucial
        window.location.reload();
      }
      setLoading(false);
    };
    getProds();
  }, []);

  useEffect(() => {
    if (!query) {
      setOptions([]);
      return;
    }
    setOptions(
      products
        .filter(
          (prod) =>
            prod.name.toLowerCase().includes(query.toLowerCase()) ||
            prod.bar_code.includes(query)
        )
        .slice(0, 30)
    );
  }, [products, query]);

  const totalEval = useCallback((bill: Bill) => {
    let total = 0;
    if (["sell", "return"].includes(bill.type)) {
      bill.products.forEach((product) => {
        total += product.price * product.amount;
      });
    } else if (bill.type === "BNPL") {
      total = 0;
    } else if (bill.type === "buy") {
      bill.products.forEach((product) => {
        total += product.wholesale_price * product.amount;
      });
    }
    return total - bill.discount;
  }, []);

  const addToCart = useCallback(
    (product: Product | null) => {
      if (!product) return;
      if (!product.id) return;
      let newBill = { ...editedBill };
      const productIndex = newBill.products.findIndex(
        (prod) => prod.id === product.id
      );
      if (productIndex === -1) {
        newBill.products.push({
          id: product.id,
          name: product.name,
          price: product.price,
          wholesale_price: product.wholesale_price,
          bar_code: product.bar_code,
          amount: 1,
        });
      } else {
        newBill.products[productIndex].amount++;
      }
      newBill.total = totalEval(newBill);
      setEditedBill(newBill);
    },
    [editedBill]
  );

  const submitBill = useCallback(async () => {
    setLoading(true);
    try {
      await axios.put(import.meta.env.VITE_SERVER_URL + "/bill", editedBill, {
        params: {
          store_id: import.meta.env.VITE_STORE_ID,
        },
      });
      getBills();
      setEditing(false);
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ" });
    }
    setLoading(false);
  }, [editedBill]);

  return (
    <Dialog open={true} onClose={() => setEditing(false)} maxWidth="lg">
      <Grid
        container
        spacing={3}
        sx={{
          p: 3,
          position: "relative",
        }}
      >
        <LoadingScreen loading={loading} />
        <AlertMessage message={msg} setMessage={setMsg} />
        <Grid item xs={12}>
          اجمالى الفاتورة : {editedBill.total}
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="الخصم"
            value={editedBill.discount}
            onChange={(e) =>
              setEditedBill((prev) => {
                let newBill = {
                  ...prev,
                  discount: Number(e.target.value) || 0,
                };
                newBill.total = totalEval(newBill);
                return newBill;
              })
            }
          />
        </Grid>
        <Grid item xs={12}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>الاسم</TableCell>
                  <TableCell>الكمية</TableCell>
                  <TableCell>سعر الشراء</TableCell>
                  <TableCell>السعر</TableCell>
                  <TableCell>الاجمالى</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {editedBill.products.map((product, i) => (
                  <TableRow key={i}>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>
                      <TextField
                        value={product.amount}
                        onChange={(e) => {
                          const amount = Number(e.target.value) || 0;

                          const newBill = { ...editedBill };
                          const productIndex = newBill.products.findIndex(
                            (prod) => prod.id === product.id
                          );
                          if (productIndex === -1) return;
                          newBill.products[productIndex].amount = amount;
                          newBill.total = totalEval(newBill);
                          setEditedBill(newBill);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={product.wholesale_price}
                        onChange={(e) => {
                          const newBill = { ...editedBill };
                          const productIndex = newBill.products.findIndex(
                            (prod) => prod.id === product.id
                          );
                          if (productIndex === -1) return;
                          newBill.products[productIndex].wholesale_price =
                            Number(e.target.value) || 1;
                          newBill.total = totalEval(newBill);
                          setEditedBill(newBill);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={product.price}
                        onChange={(e) => {
                          const newBill = { ...editedBill };
                          const productIndex = newBill.products.findIndex(
                            (prod) => prod.id === product.id
                          );
                          if (productIndex === -1) return;
                          newBill.products[productIndex].price =
                            Number(e.target.value) || 1;
                          newBill.total = totalEval(newBill);
                          setEditedBill(newBill);
                        }}
                      />
                    </TableCell>
                    <TableCell>{product.price * product.amount}</TableCell>
                    <TableCell>
                      <IconButton
                        onClick={() => {
                          const newBill = {
                            ...editedBill,
                            products: editedBill.products.filter(
                              (prod) => prod.id !== product.id
                            ),
                          };
                          setEditedBill({
                            ...newBill,
                            total: totalEval(newBill),
                          });
                        }}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
        <Grid item xs={12}>
          <Autocomplete
            options={options}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) =>
              option.id === value.id || option.bar_code === value.bar_code
            }
            value={null}
            onChange={(_, value) => {
              addToCart(value);
              setQuery("");
            }}
            filterOptions={(x) => x}
            autoHighlight
            inputValue={query}
            renderInput={(params) => (
              <TextField
                {...params}
                label="اضافة منتج"
                onChange={(e) => {
                  const currentValue = e.target.value;
                  setQuery(currentValue);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // if an enter is pressed, and the query is more than or equal to 8 numbers
                    // then search for the product with the barcode and add it to the cart
                    if (query.length >= 8 && !isNaN(parseInt(query))) {
                      const product = products.find(
                        (prod) => prod.bar_code === query
                      );
                      if (product) {
                        addToCart(product);
                      } else {
                        setMsg({
                          type: "error",
                          text: "المنتج غير موجود",
                        });
                      }
                      setQuery("");
                    }
                  }
                }}
              />
            )}
          />
        </Grid>
      </Grid>
      <DialogActions>
        <Button variant="contained" onClick={submitBill}>
          حفظ التعديلات
        </Button>
        <Button variant="contained" onClick={() => setEditing(false)}>
          اغلاق
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditableBill;

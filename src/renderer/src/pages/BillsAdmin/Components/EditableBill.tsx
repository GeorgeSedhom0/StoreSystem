import {
  Button,
  Dialog,
  DialogActions,
  Grid2,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { Bill, Product } from "../../utils/types";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
  useContext,
} from "react";
import LoadingScreen from "../../Shared/LoadingScreen";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import DeleteIcon from "@mui/icons-material/Delete";
import ProductAutocomplete from "../../Shared/ProductAutocomplete";
import { StoreContext } from "@renderer/StoreDataProvider";
import PartySelect from "../../Shared/PartySelect";
import useParties from "../../Shared/hooks/useParties";

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
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [isPairedBill, setIsPairedBill] = useState(false);
  const [partyId, setPartyId] = useState<number | null>(bill.party_id ?? null);
  // What the lines looked like when the dialog opened, to tell whether the
  // save needs a full bill edit or only the (in-place) party change.
  const [originalLines] = useState(() =>
    JSON.stringify({
      discount: bill.discount,
      products: bill.products.map((p) => [p.id, Math.abs(p.amount), p.wholesale_price, p.price]),
    }),
  );

  const { storeId } = useContext(StoreContext);
  const { parties } = useParties(setMsg);
  const isTransfer =
    isPairedBill || parties.find((p) => p.id === bill.party_id)?.type === "store";

  useEffect(() => {
    const getProds = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get("/products", {
          params: {
            store_id: storeId,
          },
        });
        setProducts(data.products);
      } catch (error) {
        console.log(error);
        // reload the page since these 2 requests are crucial
        window.location.reload();
      }
      setLoading(false);
    };
    getProds();
  }, [storeId]);

  useEffect(() => {
    const fetchPairStatus = async () => {
      try {
        const { data } = await axios.get<{ is_paired: boolean }>(
          "/bill-pair-status",
          {
            params: {
              bill_id: bill.id,
              store_id: storeId,
            },
          },
        );
        setIsPairedBill(Boolean(data?.is_paired));
      } catch (error) {
        console.log(error);
        setIsPairedBill(false);
      }
    };

    fetchPairStatus();
  }, [bill.id, storeId]);

  const totalEval = useCallback((bill: Bill) => {
    let total = 0;
    if (["sell", "return"].includes(bill.type)) {
      bill.products.forEach((product) => {
        total += product.price * product.amount;
      });
    } else if (bill.type === "BNPL") {
      total = 0;
    } else if (["buy", "buy-return"].includes(bill.type)) {
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
        (prod) => prod.id === product.id,
      );
      if (productIndex === -1) {
        const defaultWholesale = product.wholesale_price;
        const defaultPrice =
          isPairedBill && editedBill.type === "sell"
            ? product.wholesale_price
            : product.price;

        newBill.products.push({
          id: product.id,
          name: product.name,
          price: defaultPrice,
          wholesale_price: defaultWholesale,
          bar_code: product.bar_code,
          amount: 1,
        });
      } else {
        newBill.products[productIndex].amount++;
      }
      newBill.total = totalEval(newBill);
      setEditedBill(newBill);
    },
    [editedBill, isPairedBill],
  );

  const submitBill = useCallback(async () => {
    setLoading(true);
    try {
      // Lines go through the normal edit; the party is rewritten in place.
      // Lines first: if that edit is refused, nothing has changed yet.
      const lines = JSON.stringify({
        discount: editedBill.discount,
        products: editedBill.products.map((p) => [p.id, p.amount, p.wholesale_price, p.price]),
      });
      if (lines !== originalLines) {
        await axios.put("/bill", editedBill, {
          params: {
            store_id: storeId,
          },
        });
      }
      if (partyId !== (bill.party_id ?? null)) {
        await axios.put("/bill/party", null, {
          params: { store_id: storeId, bill_id: bill.id, party_id: partyId ?? undefined },
        });
      }
      getBills();
      setEditing(false);
    } catch (error: any) {
      console.log(error);
      setMsg({ type: "error", text: error?.response?.data?.detail || "حدث خطأ" });
    }
    setLoading(false);
  }, [editedBill, storeId, partyId, originalLines]);

  return (
    <Dialog open={true} onClose={() => setEditing(false)} maxWidth="lg">
      <Grid2
        container
        spacing={3}
        sx={{
          p: 3,
          position: "relative",
        }}
      >
        <LoadingScreen loading={loading} />
        <AlertMessage message={msg} setMessage={setMsg} />
        <Grid2 size={12}>اجمالى الفاتورة : {editedBill.total}</Grid2>
        <Grid2 size={12}>
          <PartySelect
            parties={parties}
            value={partyId}
            onChange={setPartyId}
            disabled={isTransfer}
            helperText={isTransfer ? "لا يمكن تغيير الطرف الثاني لفاتورة نقل بين المتاجر" : undefined}
          />
        </Grid2>
        <Grid2 size={12}>
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
        </Grid2>
        <Grid2 size={12}>
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
                            (prod) => prod.id === product.id,
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
                        disabled={isPairedBill}
                        onChange={(e) => {
                          const newBill = { ...editedBill };
                          const productIndex = newBill.products.findIndex(
                            (prod) => prod.id === product.id,
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
                        disabled={isPairedBill}
                        onChange={(e) => {
                          const newBill = { ...editedBill };
                          const productIndex = newBill.products.findIndex(
                            (prod) => prod.id === product.id,
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
                              (prod) => prod.id !== product.id,
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
        </Grid2>
        <Grid2 size={12}>
          <ProductAutocomplete
            onProductSelect={addToCart}
            products={products}
          />
        </Grid2>
      </Grid2>
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

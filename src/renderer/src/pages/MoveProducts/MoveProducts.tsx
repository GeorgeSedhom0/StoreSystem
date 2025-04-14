import {
  Button,
  Card,
  Grid2,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Table,
  TableBody,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import { useCallback, useState, useContext } from "react";
import { Product, SCProduct, StoreData } from "../../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "../Shared/ProductInCart";
import LoadingScreen from "../Shared/LoadingScreen";
import useBarcodeDetection from "../Shared/hooks/useBarcodeDetection";
import useQuickHandle from "../Shared/hooks/useCtrlBackspace";
import ProductAutocomplete from "../Shared/ProductAutocomplete";
import useProducts from "../Shared/hooks/useProducts";
import { StoreContext } from "@renderer/StoreDataProvider";
import { useQuery } from "@tanstack/react-query";

const getStoresData = async () => {
  const { data } = await axios.get<StoreData[]>("/admin/stores-data");
  return data;
};

const MoveProducts = () => {
  const [shoppingCart, setShoppingCart] = useState<SCProduct[]>([]);
  const [destinationStoreId, setDestinationStoreId] = useState<number | null>(
    null,
  );
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [billDialogOpen, setBillDialogOpen] = useState<boolean>(false);
  const [billId, setBillId] = useState<string>("");
  const [isLoadingBillProducts, setIsLoadingBillProducts] =
    useState<boolean>(false);

  const {
    products,
    updateProducts,
    isLoading: isProductsLoading,
  } = useProducts();

  const { storeId } = useContext(StoreContext);

  // Get stores data for dropdown
  const { data: storesData, isLoading: isStoresLoading } = useQuery({
    queryKey: ["storesData"],
    queryFn: getStoresData,
  });

  // Filter out the current store from the destination options
  const destinationStores =
    storesData?.filter((store) => store.id !== storeId) || [];

  const addToCart = useCallback((product: Product | null) => {
    if (!product) return;
    setShoppingCart((prev) => {
      if (!product.id) return prev;
      const productExists = prev.find((item) => item.id === product.id);
      if (productExists) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      } else {
        return [
          ...prev,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            wholesale_price: product.wholesale_price,
            quantity: 1,
            stock: product.stock,
            barCode: product.bar_code,
          },
        ];
      }
    });
  }, []);

  useBarcodeDetection(products, addToCart, setMsg);
  useQuickHandle(shoppingCart, setShoppingCart);

  const submitBill = useCallback(
    async (shoppingCart: SCProduct[]) => {
      try {
        const bill = {
          time: new Date().toLocaleString(),
          discount: 0,
          total: shoppingCart.reduce(
            (acc, item) => acc + item.wholesale_price * item.quantity,
            0,
          ),
          products_flow: shoppingCart.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
            wholesale_price: item.wholesale_price,
          })),
        };

        await axios.post("/admin/move-products", bill, {
          params: {
            source_store_id: storeId,
            destination_store_id: destinationStoreId,
          },
        });

        await updateProducts();
        setShoppingCart([]);
        setMsg({
          type: "success",
          text: "تم نقل المنتجات بنجاح",
        });
      } catch (error) {
        console.log(error);
        setMsg({
          type: "error",
          text: "حدث خطأ أثناء نقل المنتجات",
        });
      }
    },
    [destinationStoreId, storeId, updateProducts],
  );

  const handleStartFromBill = async () => {
    if (!billId) {
      setMsg({
        type: "error",
        text: "يرجى إدخال رقم الفاتورة",
      });
      return;
    }

    setIsLoadingBillProducts(true);
    try {
      const { data } = await axios.get(`/bill-products`, {
        params: {
          bill_id: billId,
          store_id: storeId,
        },
      });

      if (!data || data.length === 0) {
        setMsg({
          type: "error",
          text: "لم يتم العثور على منتجات في هذه الفاتورة",
        });
        setIsLoadingBillProducts(false);
        return;
      }

      // Convert bill products to shopping cart format
      const newCartItems: SCProduct[] = data.map((product: any) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        wholesale_price: product.wholesale_price,
        quantity: product.amount,
        stock: product.stock,
        barCode: product.bar_code,
      }));

      // Add products to shopping cart
      setShoppingCart((prevCart) => {
        // Merge new items with existing cart
        const updatedCart = [...prevCart];

        newCartItems.forEach((newItem) => {
          const existingItemIndex = updatedCart.findIndex(
            (item) => item.id === newItem.id,
          );

          if (existingItemIndex >= 0) {
            // Add quantity to existing item
            updatedCart[existingItemIndex].quantity += newItem.quantity;
          } else {
            // Add new item to cart
            updatedCart.push(newItem);
          }
        });

        return updatedCart;
      });

      setMsg({
        type: "success",
        text: `تم إضافة ${data.length} منتج من الفاتورة إلى السلة`,
      });

      setBillDialogOpen(false);
    } catch (error) {
      console.log(error);
      setMsg({
        type: "error",
        text: "حدث خطأ أثناء جلب بيانات الفاتورة",
      });
    } finally {
      setIsLoadingBillProducts(false);
    }
  };

  return (
    <Grid2 container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />

      <LoadingScreen
        loading={isProductsLoading || isStoresLoading || isLoadingBillProducts}
      />

      {/* Bill ID Dialog */}
      <Dialog open={billDialogOpen} onClose={() => setBillDialogOpen(false)}>
        <DialogTitle>ابدأ من فاتورة</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="رقم الفاتورة"
            fullWidth
            variant="outlined"
            value={billId}
            onChange={(e) => setBillId(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBillDialogOpen(false)} color="secondary">
            إلغاء
          </Button>
          <Button onClick={handleStartFromBill} color="primary">
            تأكيد
          </Button>
        </DialogActions>
      </Dialog>

      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid2 container spacing={3} alignItems="center">
            <Grid2 size={12}>
              <Typography variant="h6">نقل المنتجات بين المتاجر</Typography>
              <Typography variant="subtitle1">
                اختر المنتجات والمتجر الوجهة لنقل المنتجات
              </Typography>
            </Grid2>

            <Grid2 size={4}>
              <FormControl fullWidth>
                <InputLabel size="small">المتجر الوجهة</InputLabel>
                <Select
                  size="small"
                  value={destinationStoreId || ""}
                  label="المتجر الوجهة"
                  onChange={(e) =>
                    setDestinationStoreId(Number(e.target.value))
                  }
                  fullWidth
                >
                  {destinationStores.map((store) => (
                    <MenuItem key={store.id} value={store.id}>
                      {store.name || `متجر ${store.id}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid2>

            <Grid2 size={2}>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setBillDialogOpen(true)}
                fullWidth
              >
                ابدأ من فاتورة
              </Button>
            </Grid2>

            <Grid2 size={2}>
              <Button
                variant="contained"
                onClick={() => submitBill(shoppingCart)}
                disabled={shoppingCart.length === 0 || !destinationStoreId}
                fullWidth
              >
                نقل المنتجات
              </Button>
            </Grid2>

            <Grid2 size={4}>
              <Typography variant="h6" align="center">
                الاجمالي:{" "}
                {shoppingCart
                  .reduce(
                    (acc, item) => acc + item.wholesale_price * item.quantity,
                    0,
                  )
                  .toFixed(2)}{" "}
                جنيه
              </Typography>
            </Grid2>

            <Grid2 size={12}>
              <ProductAutocomplete
                onProductSelect={addToCart}
                products={products}
              />
            </Grid2>
          </Grid2>
        </Card>
      </Grid2>

      <Grid2 size={12}>
        <Card elevation={3}>
          <TableContainer
            sx={{
              height: "60vh",
              overflowY: "auto",
            }}
          >
            <Table
              stickyHeader
              sx={{
                "& .MuiTableCell-head": {
                  bgcolor: "background.paper",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>المنتج</TableCell>
                  <TableCell>الكمية</TableCell>
                  <TableCell>سعر الشراء</TableCell>
                  <TableCell>الاجمالي</TableCell>
                  <TableCell></TableCell>
                  <TableCell>الكمية المتاحة</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shoppingCart.map((product) => (
                  <ProductInCart
                    key={product.id}
                    product={product}
                    setShoppingCart={setShoppingCart}
                    type="transfer"
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Grid2>
    </Grid2>
  );
};

export default MoveProducts;

import {
  Autocomplete,
  Button,
  Card,
  Grid2,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Table,
  TableBody,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useCallback, useState, useContext, useRef, useEffect } from "react";
import { Party, Product, SCProduct } from "../utils/types";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import ProductInCart from "../Shared/ProductInCart";
import LoadingScreen from "../Shared/LoadingScreen";
import useBarcodeDetection from "../Shared/hooks/useBarcodeDetection";
import useQuickHandle from "../Shared/hooks/useCtrlBackspace";
import ProductAutocomplete from "../Shared/ProductAutocomplete";
import useParties from "../Shared/hooks/useParties";
import useProducts from "../Shared/hooks/useProducts";
import { StoreContext } from "@renderer/StoreDataProvider";
import { usePersistentCart } from "../Shared/hooks/usePersistentCart";

const Buy = () => {
  const {
    products,
    updateProducts,
    isLoading: isProductsLoading,
  } = useProducts();

  const [shoppingCart, setShoppingCart] = usePersistentCart(
    "Buy",
    [],
    products,
  );
  const [partyId, setPartyId] = useState<number | null>(null);
  const [addingParty, setAddingParty] = useState<boolean>(false);
  const [newParty, setNewParty] = useState<Party>({
    id: null,
    name: "",
    phone: "",
    address: "",
    type: "مورد",
    extra_info: {},
  });
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [moveType, setMoveType] = useState<"buy" | "buy-return">("buy");
  const [discount, setDiscount] = useState<number>(0);
  // Add state and ref to track submission status
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submissionInProgress = useRef<boolean>(false);

  // Ref for the cart container to enable auto-scroll
  const cartTableRef = useRef<HTMLDivElement>(null);

  const { parties, addPartyMutationAsync } = useParties(setMsg);

  const { storeId } = useContext(StoreContext);

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

  // Auto-scroll cart to bottom when new products are added
  useEffect(() => {
    if (cartTableRef.current) {
      cartTableRef.current.scrollTop = cartTableRef.current.scrollHeight;
    }
  }, [shoppingCart]);

  const submitBill = useCallback(
    async (shoppingCart: SCProduct[], discount: number) => {
      // Prevent multiple submissions
      if (isSubmitting || submissionInProgress.current) {
        console.log(
          "Submission already in progress, ignoring duplicate request",
        );
        return;
      }

      // Set our local states immediately to prevent race conditions
      setIsSubmitting(true);
      submissionInProgress.current = true;

      // Validate inputs
      if (shoppingCart.length === 0) {
        setMsg({
          type: "error",
          text: "لا توجد منتجات في السلة",
        });
        setIsSubmitting(false);
        submissionInProgress.current = false;
        return;
      }

      try {
        const bill = {
          time: new Date().toLocaleString(),
          discount,
          total:
            shoppingCart.reduce(
              (acc, item) => acc + item.wholesale_price * item.quantity,
              0,
            ) - discount,
          products_flow: shoppingCart,
        };

        let newPartyId = partyId;

        if (addingParty) {
          newPartyId = await addPartyMutationAsync(newParty);
          setAddingParty(false);
          setNewParty({
            id: null,
            name: "",
            phone: "",
            address: "",
            type: "مورد",
            extra_info: {},
          });
        }

        await axios.post("/bill", bill, {
          params: {
            move_type: moveType,
            store_id: storeId,
            party_id: newPartyId,
          },
        });

        setShoppingCart([]);
        await updateProducts();
        setDiscount(0);
        setMoveType("buy");
        setPartyId(null);
        setMsg({
          type: "success",
          text: "تم اضافة الفاتورة بنجاح",
        });
      } catch (error) {
        console.log(error);
        setMsg({
          type: "error",
          text: "حدث خطأ ما",
        });
      } finally {
        // Always ensure we reset the submission state, even in case of errors
        setIsSubmitting(false);
        submissionInProgress.current = false;
      }
    },
    [
      addingParty,
      newParty,
      partyId,
      updateProducts,
      storeId,
      moveType,
      isSubmitting,
    ],
  );

  // Check if submit should be disabled
  const isSubmitDisabled =
    shoppingCart.length === 0 || isSubmitting || submissionInProgress.current;

  return (
    <Grid2 container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={isProductsLoading || isSubmitting} />
      <Grid2 size={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Grid2 container spacing={3} alignItems="center">
            <Grid2 size={12}>
              <Typography variant="h6">
                اختار منتج ليتم اضافته الى الفاتورة
              </Typography>
            </Grid2>

            <Grid2 size={12} container>
              <Grid2 size={3}>
                <FormControl fullWidth>
                  <InputLabel size="small">نوع الفاتورة</InputLabel>
                  <Select
                    value={moveType}
                    onChange={(e) =>
                      setMoveType(e.target.value as "buy" | "buy-return")
                    }
                    size="small"
                    label="نوع الفاتورة"
                    fullWidth
                  >
                    <MenuItem value="buy">شراء</MenuItem>
                    <MenuItem value="buy-return">مرتجع شراء</MenuItem>
                  </Select>
                </FormControl>
              </Grid2>
              <Grid2 size={3}>
                <TextField
                  size="small"
                  label="الخصم"
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(+e.target.value)}
                  fullWidth
                />
              </Grid2>{" "}
              <Grid2 size={3}>
                <Button
                  variant="contained"
                  onClick={() => submitBill(shoppingCart, discount)}
                  disabled={isSubmitDisabled}
                  fullWidth
                >
                  {isSubmitting ? "جاري الحفظ..." : "اضافة فاتورة"}
                </Button>
              </Grid2>
              <Grid2 size={3}>
                <Typography variant="h6" align="center">
                  الاجمالي:{" "}
                  {shoppingCart.reduce(
                    (acc, item) => acc + item.wholesale_price * item.quantity,
                    0,
                  ) - discount}{" "}
                  جنيه
                </Typography>
                <Typography variant="body1" align="center"></Typography>
              </Grid2>
            </Grid2>

            <Grid2 size={12}>
              <ProductAutocomplete
                onProductSelect={addToCart}
                products={products}
              />
            </Grid2>
            <Grid2 size={12}>
              <Autocomplete
                options={
                  [
                    { id: null, name: "بدون مورد", phone: "", address: "" },
                    { id: null, name: "مورد جديد", phone: "", address: "" },
                    ...parties,
                  ] as Party[]
                }
                getOptionLabel={(option) =>
                  option.name + " - " + (option.phone || "")
                }
                isOptionEqualToValue={(option, value) =>
                  option.id === value.id && option.name === value.name
                }
                value={parties.find((party) => party.id === partyId) || null}
                onChange={(_, value) => {
                  if (value && value.id) {
                    setPartyId(value.id);
                    setAddingParty(false);
                  } else {
                    setPartyId(null);
                    if (value && value.name === "مورد جديد") {
                      setAddingParty(true);
                    } else {
                      setAddingParty(false);
                    }
                  }
                }}
                filterOptions={(options, params) => {
                  const filtered = options.filter(
                    (option) =>
                      option.name?.toLowerCase().includes(params.inputValue) ||
                      option.phone?.includes(params.inputValue),
                  );
                  return filtered;
                }}
                renderInput={(params) => (
                  <TextField {...params} label="اسم المورد" />
                )}
              />
            </Grid2>
            {addingParty && (
              <Grid2 container size={12} gap={3}>
                <TextField
                  label="اسم المورد"
                  value={newParty.name}
                  onChange={(e) =>
                    setNewParty({ ...newParty, name: e.target.value })
                  }
                />
                <TextField
                  label="رقم الهاتف"
                  value={newParty.phone}
                  onChange={(e) =>
                    setNewParty({ ...newParty, phone: e.target.value })
                  }
                />
                <TextField
                  label="العنوان"
                  value={newParty.address}
                  onChange={(e) =>
                    setNewParty({ ...newParty, address: e.target.value })
                  }
                />
              </Grid2>
            )}
          </Grid2>
        </Card>
      </Grid2>{" "}
      <Grid2 size={12}>
        <Card elevation={3}>
          <TableContainer
            ref={cartTableRef}
            sx={{
              height: "50vh",
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
                  <TableCell>السعر</TableCell>
                  <TableCell>الاجمالي</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shoppingCart.map((product) => (
                  <ProductInCart
                    key={product.id}
                    product={product}
                    setShoppingCart={setShoppingCart}
                    type="buy"
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

export default Buy;

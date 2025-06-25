import { useState } from "react";
import {
  Grid,
  Select,
  MenuItem,
  TextField,
  Autocomplete,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Product, CartItem, StoreData } from "../../utils/types";

interface CreateRequestProps {
  stores: StoreData[];
  onSubmit: (request: {
    requested_store_id: number;
    items: { product_id: number; requested_quantity: number }[];
  }) => Promise<void>;
  isSubmitting: boolean;
}

const CreateRequest = ({
  stores,
  onSubmit,
  isSubmitting,
}: CreateRequestProps) => {
  const [selectedStore, setSelectedStore] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Get products for selected store
  const { data: products = [] } = useQuery({
    queryKey: ["products", selectedStore],
    queryFn: async () => {
      if (!selectedStore) return [];
      const { data } = await axios.get<{ products: Product[] }>(
        `/products?store_id=${selectedStore}`,
      );
      return data.products;
    },
    enabled: !!selectedStore,
  });

  const handleAddProduct = (product: Product | null) => {
    if (product && product.id) {
      const existingItem = cart.find((item) => item.id === product.id);
      if (existingItem) {
        setCart(
          cart.map((item) =>
            item.id === product.id
              ? { ...item, requested_quantity: item.requested_quantity + 1 }
              : item,
          ),
        );
      } else {
        setCart([...cart, { ...product, requested_quantity: 1 }]);
      }
    }
  };

  const handleQuantityChange = (productId: number, quantity: number) => {
    setCart(
      cart
        .map((item) =>
          item.id === productId
            ? { ...item, requested_quantity: Math.max(0, quantity) }
            : item,
        )
        .filter((item) => item.requested_quantity > 0),
    );
  };

  const handleRemoveProduct = (productId: number) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const handleSubmit = async () => {
    if (!selectedStore || cart.length === 0) return;

    const request = {
      requested_store_id: selectedStore,
      items: cart.map((item) => ({
        product_id: item.id!,
        requested_quantity: item.requested_quantity,
      })),
    };

    await onSubmit(request);
    setCart([]);
    setSelectedStore(null);
  };

  return (
    <Grid container spacing={3} sx={{ mt: 1 }}>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>اختر المتجر المراد الطلب منه</InputLabel>
          <Select
            value={selectedStore || ""}
            onChange={(e) => setSelectedStore(Number(e.target.value) || null)}
            label="اختر المتجر المراد الطلب منه"
          >
            <MenuItem value="" disabled>
              اختر المتجر المراد الطلب منه
            </MenuItem>
            {stores.map((store) => (
              <MenuItem key={store.id} value={store.id}>
                {store.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      <Grid item xs={12}>
        <Autocomplete
          options={products}
          getOptionLabel={(option) => option.name}
          onChange={(_, value) => handleAddProduct(value)}
          renderInput={(params) => <TextField {...params} label="إضافة منتج" />}
          disabled={!selectedStore}
          value={null}
        />
      </Grid>

      <Grid item xs={12}>
        {cart.map((item) => (
          <Box
            key={item.id}
            sx={{
              display: "flex",
              alignItems: "center",
              mt: 2,
              gap: 2,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              backgroundColor: "background.paper",
            }}
          >
            <Typography sx={{ flexGrow: 1, fontWeight: "medium" }}>
              {item.name}
            </Typography>
            <TextField
              type="number"
              label="الكمية"
              value={item.requested_quantity}
              onChange={(e) =>
                handleQuantityChange(item.id!, parseInt(e.target.value) || 0)
              }
              sx={{ width: "120px" }}
              inputProps={{ min: 0 }}
            />
            <Button
              variant="outlined"
              color="error"
              onClick={() => handleRemoveProduct(item.id!)}
              size="small"
              sx={{ minWidth: "80px" }}
            >
              حذف
            </Button>
          </Box>
        ))}
      </Grid>

      <Grid item xs={12}>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!selectedStore || cart.length === 0 || isSubmitting}
          fullWidth
          size="large"
          sx={{ mt: 2, py: 1.5, fontSize: "1.1rem" }}
        >
          {isSubmitting ? "جاري الإرسال..." : "إرسال الطلب"}
        </Button>
      </Grid>
    </Grid>
  );
};

export default CreateRequest;

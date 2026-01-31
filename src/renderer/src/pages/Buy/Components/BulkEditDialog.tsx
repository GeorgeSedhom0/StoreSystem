import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  Box,
  Divider,
} from "@mui/material";
import { useState, useMemo } from "react";
import { SCProduct } from "../../utils/types";

type FieldName = "wholesale_price" | "price" | "quantity";
type ChangeType =
  | "set"
  | "increase"
  | "decrease"
  | "increase_percent"
  | "decrease_percent";

interface BulkEditDialogProps {
  open: boolean;
  onClose: () => void;
  products: SCProduct[];
  selectedProductIds: Set<number>;
  onApply: (updatedProducts: SCProduct[]) => void;
}

const fieldLabels: Record<FieldName, string> = {
  wholesale_price: "سعر الشراء",
  price: "سعر البيع",
  quantity: "الكمية",
};

const changeTypeLabels: Record<ChangeType, string> = {
  set: "تعيين قيمة محددة",
  increase: "زيادة بقيمة",
  decrease: "نقصان بقيمة",
  increase_percent: "زيادة بنسبة %",
  decrease_percent: "نقصان بنسبة %",
};

const BulkEditDialog = ({
  open,
  onClose,
  products,
  selectedProductIds,
  onApply,
}: BulkEditDialogProps) => {
  const [field, setField] = useState<FieldName>("wholesale_price");
  const [changeType, setChangeType] = useState<ChangeType>("set");
  const [value, setValue] = useState<number>(0);
  const [applyToAll, setApplyToAll] = useState(false);

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedProductIds.has(p.id)),
    [products, selectedProductIds],
  );

  const targetProducts = applyToAll ? products : selectedProducts;

  const calculateNewValue = (
    currentValue: number,
    changeType: ChangeType,
    inputValue: number,
    fieldName: FieldName,
  ): number => {
    let newValue: number;

    switch (changeType) {
      case "set":
        newValue = inputValue;
        break;
      case "increase":
        newValue = currentValue + inputValue;
        break;
      case "decrease":
        newValue = Math.max(0, currentValue - inputValue);
        break;
      case "increase_percent":
        newValue = currentValue * (1 + inputValue / 100);
        break;
      case "decrease_percent":
        newValue = currentValue * (1 - inputValue / 100);
        break;
      default:
        newValue = currentValue;
    }

    // Round appropriately
    if (fieldName === "quantity") {
      newValue = Math.max(1, Math.round(newValue));
    } else {
      newValue = Math.max(0, Math.round(newValue * 100) / 100);
    }

    return newValue;
  };

  const preview = useMemo(() => {
    return targetProducts.slice(0, 3).map((product) => {
      const currentValue = product[field];
      const newValue = calculateNewValue(currentValue, changeType, value, field);
      return {
        name: product.name,
        currentValue,
        newValue,
      };
    });
  }, [targetProducts, field, changeType, value]);

  const handleApply = () => {
    const targetIds = new Set(targetProducts.map((p) => p.id));

    const updatedProducts = products.map((product) => {
      if (!targetIds.has(product.id)) return product;

      const currentValue = product[field];
      const newValue = calculateNewValue(currentValue, changeType, value, field);

      return { ...product, [field]: newValue };
    });

    onApply(updatedProducts);
    onClose();
  };

  const handleClose = () => {
    setField("wholesale_price");
    setChangeType("set");
    setValue(0);
    setApplyToAll(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>تعديل جماعي</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Typography>
              المنتجات المحددة: {selectedProducts.length}
            </Typography>
            <FormControlLabel
              control={
                <Radio
                  checked={!applyToAll}
                  onChange={() => setApplyToAll(false)}
                  size="small"
                />
              }
              label="المحددة فقط"
            />
            <FormControlLabel
              control={
                <Radio
                  checked={applyToAll}
                  onChange={() => setApplyToAll(true)}
                  size="small"
                />
              }
              label={`الكل (${products.length})`}
            />
          </Box>

          <FormControl fullWidth size="small">
            <InputLabel>الحقل</InputLabel>
            <Select
              value={field}
              onChange={(e) => setField(e.target.value as FieldName)}
              label="الحقل"
            >
              {Object.entries(fieldLabels).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl component="fieldset">
            <Typography variant="body2" color="text.secondary" gutterBottom>
              نوع التعديل
            </Typography>
            <RadioGroup
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as ChangeType)}
            >
              {Object.entries(changeTypeLabels).map(([key, label]) => (
                <FormControlLabel
                  key={key}
                  value={key}
                  control={<Radio size="small" />}
                  label={label}
                />
              ))}
            </RadioGroup>
          </FormControl>

          <TextField
            label="القيمة"
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            size="small"
            fullWidth
            slotProps={{
              input: {
                inputMode: "decimal",
              },
            }}
          />

          <Divider />

          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              معاينة التغييرات (أول 3 منتجات):
            </Typography>
            {preview.length === 0 ? (
              <Typography color="text.secondary">لا توجد منتجات</Typography>
            ) : (
              preview.map((item, index) => (
                <Typography key={index} variant="body2">
                  {item.name}: {item.currentValue} ← {item.newValue}
                </Typography>
              ))
            )}
            {targetProducts.length > 3 && (
              <Typography variant="body2" color="text.secondary">
                ... و {targetProducts.length - 3} منتج آخر
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          إلغاء
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          color="primary"
          disabled={targetProducts.length === 0}
        >
          تطبيق
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkEditDialog;

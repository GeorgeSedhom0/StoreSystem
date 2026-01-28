import { Button, TextField, TableRow, TableCell, Tooltip, Chip } from "@mui/material";
import { SCProduct, BatchInfo } from "../utils/types";
import { Dispatch, SetStateAction, useState, useEffect, useContext } from "react";
import PrintBarCode from "./PrintBarCode";
import ExpirationModal from "./ExpirationModal";
import BatchSelectionModal from "./BatchSelectionModal";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import axios from "axios";
import { StoreContext } from "@renderer/StoreDataProvider";

const NameColumn = ({ name }: { name: string }) => {
  return <TableCell>{name}</TableCell>;
};

const QuantityColumn = ({
  quantity,
  setShoppingCart,
  product,
}: {
  quantity: number;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  product: SCProduct;
}) => {
  return (
    <TableCell>
      <TextField
        label="الكمية"
        type="number"
        value={quantity}
        variant="standard"
        onChange={(e) => {
          setShoppingCart((prev) =>
            prev.map((item) =>
              item.id === product.id
                ? { ...item, quantity: parseInt(e.target.value) || 0 }
                : item,
            ),
          );
        }}
      />
    </TableCell>
  );
};

const PriceColumn = ({
  price,
  setShoppingCart,
  product,
  disbaled,
}: {
  price: number;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  product: SCProduct;
  disbaled?: boolean;
}) => {
  return (
    <TableCell>
      <TextField
        label="السعر"
        type="number"
        value={price}
        variant="standard"
        onChange={(e) => {
          setShoppingCart((prev) =>
            prev.map((item) =>
              item.id === product.id
                ? { ...item, price: parseFloat(e.target.value) || 0 }
                : item,
            ),
          );
        }}
        slotProps={{
          input: {
            inputMode: "decimal",
          },
        }}
        disabled={disbaled}
      />
    </TableCell>
  );
};

const WholesalePriceColumn = ({
  wholesalePrice,
  setShoppingCart,
  product,
}: {
  wholesalePrice: number;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  product: SCProduct;
}) => {
  return (
    <TableCell>
      <TextField
        label="سعر الجملة"
        type="number"
        value={wholesalePrice}
        variant="standard"
        onChange={(e) => {
          setShoppingCart((prev) =>
            prev.map((item) =>
              item.id === product.id
                ? { ...item, wholesale_price: parseFloat(e.target.value) || 0 }
                : item,
            ),
          );
        }}
        slotProps={{
          input: {
            inputMode: "decimal",
          },
        }}
      />
    </TableCell>
  );
};

const WholesalePriceDisplayColumn = ({
  wholesalePrice,
}: {
  wholesalePrice: number;
}) => {
  return (
    <TableCell>
      <TextField
        label="سعر الشراء"
        type="number"
        value={wholesalePrice}
        variant="standard"
        disabled={true}
        slotProps={{
          input: {
            readOnly: true,
          },
        }}
      />
    </TableCell>
  );
};

const TotalPriceColumn = ({
  product,
  type,
}: {
  product: SCProduct;
  type: "buy" | "sell" | "sell-admin" | "transfer";
}) => {
  if (type === "buy" || type === "transfer") {
    return <TableCell>{product.wholesale_price * product.quantity}</TableCell>;
  }
  return <TableCell>{product.price * product.quantity}</TableCell>;
};

const DeleteColumn = ({
  product,
  setShoppingCart,
}: {
  product: SCProduct;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
}) => {
  return (
    <TableCell>
      <Button
        variant="contained"
        color="error"
        onClick={() => {
          setShoppingCart((prev) =>
            prev.filter((item) => item.id !== product.id),
          );
        }}
      >
        حذف
      </Button>
    </TableCell>
  );
};

const StockColumn = ({ stock }: { stock: number }) => {
  return <TableCell>{stock}</TableCell>;
};

const PrintBarCodeColumn = ({
  product,
  isPrintingCode,
  initialQuantity,
  setIsPrintingCode,
}: {
  product: SCProduct;
  isPrintingCode: boolean;
  initialQuantity?: number;
  setIsPrintingCode: Dispatch<SetStateAction<boolean>>;
}) => {
  return (
    <TableCell>
      {isPrintingCode && (
        <PrintBarCode
          code={product.barCode || ""}
          name={product.name}
          price={product.price}
          initialQuantity={initialQuantity}
          setOpen={setIsPrintingCode}
        />
      )}
      <Button
        variant="contained"
        color="primary"
        onClick={() => setIsPrintingCode(true)}
      >
        طباعة باركود
      </Button>
    </TableCell>
  );
};

const ExpirationColumn = ({
  product,
  isExpirationModalOpen,
  setIsExpirationModalOpen,
  setShoppingCart,
}: {
  product: SCProduct;
  isExpirationModalOpen: boolean;
  setIsExpirationModalOpen: Dispatch<SetStateAction<boolean>>;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
}) => {
  const hasBatches = product.batches && product.batches.length > 0;
  const hasExpDates = product.batches?.some(b => b.expiration_date);
  
  return (
    <TableCell>
      {isExpirationModalOpen && (
        <ExpirationModal
          open={isExpirationModalOpen}
          onClose={() => setIsExpirationModalOpen(false)}
          product={product}
          onSave={(batches: BatchInfo[]) => {
            setShoppingCart((prev) =>
              prev.map((item) =>
                item.id === product.id
                  ? { ...item, batches: batches.length > 0 ? batches : undefined }
                  : item
              )
            );
          }}
        />
      )}
      <Tooltip title={hasExpDates ? "تم تحديد تواريخ الصلاحية" : "تحديد تواريخ الصلاحية"}>
        <Button
          variant={hasBatches ? "contained" : "outlined"}
          color={hasExpDates ? "success" : "primary"}
          onClick={() => setIsExpirationModalOpen(true)}
          size="small"
          startIcon={<CalendarMonthIcon />}
        >
          صلاحية
        </Button>
      </Tooltip>
    </TableCell>
  );
};

// Column for selecting batch distribution when selling
const ExpirationInfoColumn = ({
  product,
  storeId,
  isBatchModalOpen,
  setIsBatchModalOpen,
  setShoppingCart,
}: {
  product: SCProduct;
  storeId: number | null;
  isBatchModalOpen: boolean;
  setIsBatchModalOpen: Dispatch<SetStateAction<boolean>>;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
}) => {
  const [displayInfo, setDisplayInfo] = useState<string>("-");
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [hasBatches, setHasBatches] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBatchInfo = async () => {
      if (!product.id || !storeId) {
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`/product/${product.id}/batches`, {
          params: { store_id: storeId },
        });
        const batches = response.data.batches || [];
        const batchesWithQty = batches.filter((b: { quantity: number }) => b.quantity > 0);
        
        setHasBatches(batchesWithQty.length > 0);
        
        // If product has selected batches, show that info
        if (product.batches && product.batches.length > 0) {
          const selectedCount = product.batches.length;
          const hasExpiring = product.batches.some((b) => {
            if (!b.expiration_date) return false;
            const expDate = new Date(b.expiration_date);
            const today = new Date();
            const daysUntilExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return daysUntilExpiry <= 14;
          });
          setIsExpiringSoon(hasExpiring);
          setDisplayInfo(`${selectedCount} دفعة`);
        } else if (batchesWithQty.length > 0) {
          // Find earliest expiration from batches with quantity
          const sortedBatches = batchesWithQty
            .filter((b: { expiration_date: string | null }) => b.expiration_date)
            .sort((a: { expiration_date: string }, b: { expiration_date: string }) => 
              new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime()
            );
          
          if (sortedBatches.length > 0) {
            const earliest = sortedBatches[0].expiration_date;
            const expDate = new Date(earliest);
            const today = new Date();
            const daysUntilExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            setDisplayInfo(expDate.toLocaleDateString('en-GB')); // dd/mm/yyyy format
            setIsExpiringSoon(daysUntilExpiry <= 14);
          } else {
            setDisplayInfo("تلقائي");
          }
        }
      } catch (error) {
        console.error("Error loading batch info:", error);
      }
      setLoading(false);
    };

    loadBatchInfo();
  }, [product.id, product.batches, storeId]);

  const handleSaveBatches = (batches: BatchInfo[]) => {
    setShoppingCart((prev) =>
      prev.map((item) =>
        item.id === product.id
          ? { ...item, batches: batches.length > 0 ? batches : undefined }
          : item
      )
    );
  };

  if (loading) {
    return <TableCell>...</TableCell>;
  }

  return (
    <TableCell>
      {isBatchModalOpen && (
        <BatchSelectionModal
          open={isBatchModalOpen}
          onClose={() => setIsBatchModalOpen(false)}
          product={product}
          onSave={handleSaveBatches}
        />
      )}
      <Tooltip title={hasBatches ? "انقر لاختيار الدفعات" : "لا توجد دفعات مسجلة"}>
        <Chip
          size="small"
          label={displayInfo}
          color={product.batches && product.batches.length > 0 ? "success" : isExpiringSoon ? "warning" : "default"}
          variant={product.batches && product.batches.length > 0 ? "filled" : isExpiringSoon ? "filled" : "outlined"}
          onClick={hasBatches ? () => setIsBatchModalOpen(true) : undefined}
          sx={{ cursor: hasBatches ? "pointer" : "default" }}
        />
      </Tooltip>
    </TableCell>
  );
};

type availableColumns =
  | "name"
  | "quantity"
  | "price"
  | "wholesalePrice"
  | "wholesalePriceDisplay"
  | "totalPrice"
  | "delete"
  | "stock"
  | "printBarCode"
  | "expiration"
  | "expirationInfo";

const typeToColumns: {
  buy: availableColumns[];
  sell: availableColumns[];
  "sell-admin": availableColumns[];
  transfer: availableColumns[];
} = {
  buy: [
    "name",
    "quantity",
    "wholesalePrice",
    "price",
    "totalPrice",
    "expiration",
    "delete",
    "printBarCode",
  ],
  sell: ["name", "quantity", "price", "totalPrice", "delete", "stock", "expirationInfo"],
  "sell-admin": ["name", "quantity", "price", "totalPrice", "delete", "stock", "expirationInfo"],
  transfer: [
    "name",
    "quantity",
    "wholesalePriceDisplay",
    "totalPrice",
    "delete",
    "stock",
  ],
};

const Column = ({
  column,
  product,
  setShoppingCart,
  type,
  isPrintingCode,
  setIsPrintingCode,
  isExpirationModalOpen,
  setIsExpirationModalOpen,
  isBatchModalOpen,
  setIsBatchModalOpen,
  storeId,
}: {
  column: availableColumns;
  product: SCProduct;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  type: "buy" | "sell" | "sell-admin" | "transfer";
  isPrintingCode: boolean;
  setIsPrintingCode: Dispatch<SetStateAction<boolean>>;
  isExpirationModalOpen: boolean;
  setIsExpirationModalOpen: Dispatch<SetStateAction<boolean>>;
  isBatchModalOpen: boolean;
  setIsBatchModalOpen: Dispatch<SetStateAction<boolean>>;
  storeId: number | null;
}) => {
  if (column === "name") {
    return <NameColumn name={product.name} />;
  } else if (column === "quantity") {
    return (
      <QuantityColumn
        quantity={product.quantity}
        setShoppingCart={setShoppingCart}
        product={product}
      />
    );
  } else if (column === "price") {
    return (
      <PriceColumn
        price={product.price}
        setShoppingCart={setShoppingCart}
        product={product}
        disbaled={type === "sell"}
      />
    );
  } else if (column === "wholesalePrice") {
    return (
      <WholesalePriceColumn
        wholesalePrice={product.wholesale_price}
        setShoppingCart={setShoppingCart}
        product={product}
      />
    );
  } else if (column === "wholesalePriceDisplay") {
    return (
      <WholesalePriceDisplayColumn wholesalePrice={product.wholesale_price} />
    );
  } else if (column === "totalPrice") {
    return <TotalPriceColumn product={product} type={type} />;
  } else if (column === "delete") {
    return <DeleteColumn product={product} setShoppingCart={setShoppingCart} />;
  } else if (column === "stock") {
    return <StockColumn stock={product.stock} />;
  } else if (column === "printBarCode") {
    return (
      <PrintBarCodeColumn
        product={product}
        isPrintingCode={isPrintingCode}
        initialQuantity={product.quantity}
        setIsPrintingCode={setIsPrintingCode}
      />
    );
  } else if (column === "expiration") {
    return (
      <ExpirationColumn
        product={product}
        isExpirationModalOpen={isExpirationModalOpen}
        setIsExpirationModalOpen={setIsExpirationModalOpen}
        setShoppingCart={setShoppingCart}
      />
    );
  } else if (column === "expirationInfo") {
    return (
      <ExpirationInfoColumn
        product={product}
        storeId={storeId}
        isBatchModalOpen={isBatchModalOpen}
        setIsBatchModalOpen={setIsBatchModalOpen}
        setShoppingCart={setShoppingCart}
      />
    );
  } else {
    return null;
  }
};

const ProductInCart = ({
  product,
  setShoppingCart,
  type,
}: {
  product: SCProduct;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  type: "buy" | "sell" | "sell-admin" | "transfer";
}) => {
  const [isPrintingCode, setIsPrintingCode] = useState(false);
  const [isExpirationModalOpen, setIsExpirationModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const { storeId } = useContext(StoreContext);
  
  return (
    <TableRow>
      {typeToColumns[type].map((column, index) => (
        <Column
          key={index}
          column={column}
          product={product}
          setShoppingCart={setShoppingCart}
          type={type}
          isPrintingCode={isPrintingCode}
          setIsPrintingCode={setIsPrintingCode}
          isExpirationModalOpen={isExpirationModalOpen}
          setIsExpirationModalOpen={setIsExpirationModalOpen}
          isBatchModalOpen={isBatchModalOpen}
          setIsBatchModalOpen={setIsBatchModalOpen}
          storeId={storeId}
        />
      ))}
    </TableRow>
  );
};

export default ProductInCart;

import { Button, TextField, TableRow, TableCell } from "@mui/material";
import { SCProduct } from "../utils/types";
import { Dispatch, SetStateAction, useState } from "react";
import PrintBarCode from "./PrintBarCode";

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

type availableColumns =
  | "name"
  | "quantity"
  | "price"
  | "wholesalePrice"
  | "wholesalePriceDisplay"
  | "totalPrice"
  | "delete"
  | "stock"
  | "printBarCode";

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
    "delete",
    "printBarCode",
  ],
  sell: ["name", "quantity", "price", "totalPrice", "delete", "stock"],
  "sell-admin": ["name", "quantity", "price", "totalPrice", "delete", "stock"],
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
}: {
  column: availableColumns;
  product: SCProduct;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  type: "buy" | "sell" | "sell-admin" | "transfer";
  isPrintingCode: boolean;
  setIsPrintingCode: Dispatch<SetStateAction<boolean>>;
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
        />
      ))}
    </TableRow>
  );
};

export default ProductInCart;

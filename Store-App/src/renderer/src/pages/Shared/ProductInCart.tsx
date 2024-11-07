import { Button, TextField, TableRow, TableCell } from "@mui/material";
import { SCProduct } from "../../utils/types";
import { printCode } from "../../utils/functions";

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
                : item
            )
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
}: {
  price: number;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  product: SCProduct;
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
                : item
            )
          );
        }}
        inputProps={{
          inputMode: "decimal",
        }}
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
                : item
            )
          );
        }}
        inputProps={{
          inputMode: "decimal",
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
  type: "buy" | "sell";
}) => {
  if (type === "buy") {
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
            prev.filter((item) => item.id !== product.id)
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

const PrintBarCodeColumn = ({ product }: { product: SCProduct }) => {
  return (
    <TableCell>
      <Button
        variant="contained"
        color="primary"
        onClick={() => {
          printCode(
            product.barCode ?? "",
            `فحم المهندس \n ${product.name}`,
            product.price.toString() + " " + "جنية ",
            "ar"
          );
        }}
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
  | "totalPrice"
  | "delete"
  | "stock"
  | "printBarCode";

const typeToColumns: {
  buy: availableColumns[];
  sell: availableColumns[];
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
};

const Column = ({
  column,
  product,
  setShoppingCart,
  type,
}: {
  column: availableColumns;
  product: SCProduct;
  setShoppingCart: React.Dispatch<React.SetStateAction<SCProduct[]>>;
  type: "buy" | "sell";
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
  } else if (column === "totalPrice") {
    return <TotalPriceColumn product={product} type={type} />;
  } else if (column === "delete") {
    return <DeleteColumn product={product} setShoppingCart={setShoppingCart} />;
  } else if (column === "stock") {
    return <StockColumn stock={product.stock} />;
  } else if (column === "printBarCode") {
    return <PrintBarCodeColumn product={product} />;
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
  type: "buy" | "sell";
}) => {
  return (
    <TableRow>
      {typeToColumns[type].map((column, index) => (
        <Column
          key={index}
          column={column}
          product={product}
          setShoppingCart={setShoppingCart}
          type={type}
        />
      ))}
    </TableRow>
  );
};

export default ProductInCart;
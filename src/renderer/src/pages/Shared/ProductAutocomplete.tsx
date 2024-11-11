import { useState, useEffect, Dispatch, SetStateAction } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { Product } from "../../utils/types";
import { AlertMsg } from "./AlertMessage";

const ProductAutocomplete = ({
  onProductSelect,
  products,
  setMsg,
}: {
  onProductSelect: (product: Product | null) => void;
  products: Product[];
  setMsg: Dispatch<SetStateAction<AlertMsg>>;
}) => {
  const [options, setOptions] = useState<Product[]>([]);
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    if (query === "") {
      setOptions(products.slice(0, 50));
      return;
    }
    setOptions(() =>
      products.filter(
        (prod) =>
          prod.name.toLowerCase().includes(query.toLowerCase()) ||
          prod.bar_code.includes(query)
      )
    );
  }, [query, products]);

  return (
    <Autocomplete
      options={options}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, value) =>
        option.id === value.id || option.bar_code === value.bar_code
      }
      value={null}
      onChange={(_, value) => {
        if (query.length >= 5 && !isNaN(parseInt(query))) {
          setQuery("");
          return;
        }
        onProductSelect(value);
        setQuery("");
      }}
      autoHighlight
      inputValue={query}
      renderInput={(params) => (
        <TextField
          {...params}
          label="المنتج"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // if an enter is pressed, and the query is more than or equal to 8 numbers
              // then search for the product with the barcode and add it to the cart
              if (query.length >= 5 && !isNaN(parseInt(query))) {
                const product = products.find(
                  (prod) => prod.bar_code === query
                );
                if (product) {
                  onProductSelect(product);
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
  );
};

export default ProductAutocomplete;

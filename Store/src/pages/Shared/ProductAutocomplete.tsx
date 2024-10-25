import { useState, useEffect } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { Product } from "../../utils/types";

const ProductAutocomplete = ({
  onProductSelect,
  products,
}: {
  onProductSelect: (product: Product | null) => void;
  products: Product[];
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
        onProductSelect(value);
        setQuery("");
      }}
      filterOptions={(x) => x}
      autoHighlight
      inputValue={query}
      renderInput={(params) => (
        <TextField
          {...params}
          label="المنتج"
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
    />
  );
};

export default ProductAutocomplete;

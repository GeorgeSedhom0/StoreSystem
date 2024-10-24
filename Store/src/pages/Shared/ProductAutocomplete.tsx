import React, { useState, useEffect, useCallback } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import axios from 'axios';
import { Product } from '../../utils/types';

const ProductAutocomplete = ({ onProductSelect }: { onProductSelect: (product: Product | null) => void }) => {
  const [options, setOptions] = useState<Product[]>([]);
  const [query, setQuery] = useState<string>('');

  const fetchProducts = useCallback(async () => {
    try {
      const { data } = await axios.get<Product[]>(import.meta.env.VITE_SERVER_URL + '/products');
      setOptions(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (!query) {
      setOptions([]);
      return;
    }
    setOptions((prevOptions) =>
      prevOptions.filter(
        (prod) =>
          prod.name.toLowerCase().includes(query.toLowerCase()) ||
          prod.bar_code.includes(query)
      )
    );
  }, [query]);

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
        setQuery('');
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

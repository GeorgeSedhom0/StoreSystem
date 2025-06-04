import {
  Card,
  Grid2,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ButtonGroup,
  Button,
  Autocomplete,
  TextField,
} from "@mui/material";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/ar-sa";
import axios from "axios";
import LoadingScreen from "../Shared/LoadingScreen";
import { CollectionBill, DBProducts, Product } from "../utils/types";
import { TableVirtuoso } from "react-virtuoso";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import useParties from "../Shared/hooks/useParties";
import { StoreContext } from "@renderer/StoreDataProvider";

const getProds = async ({
  queryKey: [_, storeId],
}: {
  queryKey: [string, number];
}) => {
  const { data } = await axios.get<DBProducts>("/products", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const getBills = async (
  startDate: Dayjs,
  endDate: Dayjs,
  partyId: number | null,
  storeId: number,
) => {
  const { data } = await axios.get<CollectionBill[]>("/parties/bills", {
    params: {
      start_date: startDate.format("YYYY-MM-DDTHH:mm:ss"),
      end_date: endDate.format("YYYY-MM-DDTHH:mm:ss"),
      party_id: partyId,
      store_id: storeId,
    },
  });
  return data;
};

const PartiesBills = () => {
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("day"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs().endOf("day"));
  const [filters, setFilters] = useState<string[]>([
    "sell",
    "BNPL",
    "return",
    "reserve",
    "installment",
  ]);
  const [selectedProduct, setSelectedProduct] = useState<Product[]>([]);
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);

  const { storeId } = useContext(StoreContext);

  const { data: products } = useQuery({
    queryKey: ["products", storeId],
    queryFn: getProds,
    initialData: { products: [], reserved_products: {} },
    select: (data) => data.products,
  });

  const { partyId } = useParams();

  useEffect(() => {
    if (partyId) setSelectedPartyId(parseInt(partyId));
  }, [partyId]);

  const { data: lastShift, isLoading: isShiftLoading } = useQuery({
    queryKey: ["lastShift"],
    queryFn: async () => {
      const { data } = await axios.get("/last-shift", {
        params: {
          store_id: storeId,
        },
      });
      return data;
    },
  });

  const {
    data: collections,
    isLoading: isBillsLoading,
    refetch: refetchBills,
  } = useQuery({
    queryKey: [
      "parties-bills",
      startDate,
      endDate,
      selectedPartyId || "",
      storeId,
    ],
    queryFn: () => getBills(startDate, endDate, selectedPartyId, storeId),
    initialData: [],
  });

  const { parties } = useParties(setMsg);

  const setRange = useCallback(
    (range: "shift" | "day" | "week" | "month") => {
      switch (range) {
        case "shift":
          if (lastShift) {
            setStartDate(dayjs(lastShift.start_date_time));
            setEndDate(dayjs(lastShift.end_date_time));
          }
          break;
        case "day":
          setStartDate(dayjs().startOf("day"));
          setEndDate(dayjs().endOf("day"));
          break;
        case "week":
          setStartDate(dayjs().startOf("week"));
          setEndDate(dayjs().endOf("week"));
          break;
        case "month":
          setStartDate(dayjs().startOf("month"));
          setEndDate(dayjs().endOf("month"));
          break;
        default:
          break;
      }
    },
    [lastShift],
  );

  const filteredCollections = useMemo(() => {
    // Filter collections based on bill types
    let filtered = collections.filter((collection) =>
      collection.bills.some((bill) => filters.includes(bill.type)),
    );

    // Filter by selected products if any
    if (selectedProduct.length > 0) {
      filtered = filtered.filter((collection) =>
        collection.bills.some((bill) =>
          bill.products.some((product) =>
            selectedProduct.some((selected) => selected.name === product.name),
          ),
        ),
      );
    }

    return filtered;
  }, [collections, filters, selectedProduct]);

  const total = filteredCollections.reduce((acc, collection) => {
    return acc + parseFloat(collection.total.toFixed(2));
  }, 0);

  const loading = isShiftLoading || isBillsLoading;

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Grid2 container spacing={3}>
              <Grid2 size={12}>
                <Grid2 container size={12} justifyContent="space-between">
                  <Grid2>
                    <Typography variant="h4">الفواتير</Typography>
                  </Grid2>
                </Grid2>
                <Typography variant="body1">
                  قم بتحديد الفترة لعرض الفواتير
                </Typography>
              </Grid2>
              <Grid2 container gap={3} size={12}>
                <LocalizationProvider
                  dateAdapter={AdapterDayjs}
                  adapterLocale="ar-sa"
                >
                  <DateTimePicker
                    label="من"
                    value={startDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setStartDate(newValue);
                    }}
                    disableFuture
                  />
                </LocalizationProvider>

                <LocalizationProvider
                  dateAdapter={AdapterDayjs}
                  adapterLocale="ar-sa"
                >
                  <DateTimePicker
                    label="الى"
                    value={endDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setEndDate(newValue);
                    }}
                  />
                </LocalizationProvider>

                <FormControl>
                  <InputLabel>نوع الفانورة</InputLabel>
                  <Select
                    value={filters}
                    onChange={(e) =>
                      setFilters(
                        Array.isArray(e.target.value)
                          ? e.target.value
                          : [e.target.value],
                      )
                    }
                    label="نوع الفاتورة"
                    multiple
                    sx={{
                      width: 200,
                    }}
                  >
                    <MenuItem value="sell">نقدي</MenuItem>
                    <MenuItem value="BNPL">آجل</MenuItem>
                    <MenuItem value="return">مرتجع</MenuItem>
                    <MenuItem value="reserve">حجز</MenuItem>
                    <MenuItem value="installment">تقسيط</MenuItem>
                  </Select>
                </FormControl>

                <Autocomplete
                  multiple
                  options={products}
                  id="selectProductDropdown"
                  getOptionLabel={(option) => option.name}
                  value={selectedProduct}
                  sx={{ minWidth: 300 }}
                  onChange={(_, newValue) => {
                    setSelectedProduct(newValue);
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="بحث بالمنتج" />
                  )}
                />
              </Grid2>
              <Grid2 size={12}>
                <ButtonGroup>
                  <Button onClick={() => setRange("shift")}>اخر شيفت</Button>
                  <Button onClick={() => setRange("day")}>اليوم</Button>
                  <Button onClick={() => setRange("week")}>هذا الاسبوع</Button>
                  <Button onClick={() => setRange("month")}>هذا الشهر</Button>
                </ButtonGroup>
              </Grid2>
              <Grid2 size={12}>
                <Autocomplete
                  options={parties}
                  onChange={(_, value) => {
                    setSelectedPartyId(value?.id || null);
                  }}
                  getOptionLabel={(option) =>
                    option.name + " - " + option.phone + " - " + option.type
                  }
                  isOptionEqualToValue={(option, value) =>
                    option.id === value.id && option.name === value.name
                  }
                  value={
                    parties.find((party) => party.id === selectedPartyId) ||
                    null
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="الطرف الثانى"
                      variant="outlined"
                    />
                  )}
                  filterOptions={(options, params) => {
                    const filtered = options.filter(
                      (option) =>
                        option.name.toLowerCase().includes(params.inputValue) ||
                        option.phone.includes(params.inputValue),
                    );
                    return filtered;
                  }}
                />
              </Grid2>

              <Grid2 size={12}>
                <Typography variant="body2">
                  المجموع: {total.toFixed(2)}
                </Typography>
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>
        <Grid2 size={12}>
          <Card
            elevation={3}
            sx={{
              position: "relative",
              height: 600,
            }}
          >
            <LoadingScreen loading={loading} />
            <TableVirtuoso
              fixedHeaderContent={fixedHeaderContent}
              components={VirtuosoTableComponents}
              data={filteredCollections}
              context={{
                setMsg: setMsg,
                getBills: refetchBills,
              }}
            />
          </Card>
        </Grid2>
      </Grid2>
    </>
  );
};

export default PartiesBills;

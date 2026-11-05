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
  Box,
  useMediaQuery,
  useTheme,
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
import { localTimestamp } from "../utils/functions";
import { TableVirtuoso, Virtuoso } from "react-virtuoso";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";
import { useQuery } from "@tanstack/react-query";
import { CollectionBillCard, fmt } from "./Components/CollectionBill";
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
      start_date: localTimestamp(startDate),
      end_date: localTimestamp(endDate),
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

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

  const listContext = { setMsg: setMsg, getBills: refetchBills };

  const loading = isShiftLoading || isBillsLoading;

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 container spacing={{ xs: 2, md: 3 }}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Grid2 container spacing={{ xs: 2, md: 3 }}>
              <Grid2 size={12}>
                <Typography
                  variant="h4"
                  sx={{ fontSize: { xs: "1.5rem", md: "2.125rem" } }}
                >
                  فواتير العملاء والموردين
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  حدد الفترة والطرف الثاني لعرض مجموعات الفواتير
                </Typography>
              </Grid2>
              <LocalizationProvider
                dateAdapter={AdapterDayjs}
                adapterLocale="ar-sa"
              >
                <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                  <DateTimePicker
                    label="من"
                    value={startDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setStartDate(newValue);
                    }}
                    disableFuture
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid2>
                <Grid2 size={{ xs: 12, sm: 6, md: 3 }}>
                  <DateTimePicker
                    label="إلى"
                    value={endDate}
                    onChange={(newValue) => {
                      if (!newValue) return;
                      setEndDate(newValue);
                    }}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </Grid2>
              </LocalizationProvider>
              <Grid2 size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>نوع الفاتورة</InputLabel>
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
                  >
                    <MenuItem value="sell">نقدي</MenuItem>
                    <MenuItem value="BNPL">آجل</MenuItem>
                    <MenuItem value="return">مرتجع</MenuItem>
                    <MenuItem value="reserve">حجز</MenuItem>
                    <MenuItem value="installment">تقسيط</MenuItem>
                  </Select>
                </FormControl>
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 6, md: 4 }}>
                <Autocomplete
                  multiple
                  options={products}
                  id="selectProductDropdown"
                  getOptionLabel={(option) => option.name}
                  value={selectedProduct}
                  onChange={(_, newValue) => {
                    setSelectedProduct(newValue);
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="بحث بالمنتج" />
                  )}
                />
              </Grid2>
              <Grid2 size={12}>
                <ButtonGroup
                  fullWidth={isMobile}
                  sx={{
                    "& .MuiButton-root": {
                      minHeight: 40,
                      whiteSpace: "nowrap",
                      px: { xs: 0.5, sm: 2 },
                    },
                  }}
                >
                  <Button onClick={() => setRange("shift")}>آخر شيفت</Button>
                  <Button onClick={() => setRange("day")}>اليوم</Button>
                  <Button onClick={() => setRange("week")}>هذا الأسبوع</Button>
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
                      label="الطرف الثاني"
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
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  الإجمالي: {fmt(total)} — عدد المجموعات:{" "}
                  {filteredCollections.length}
                </Typography>
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>
        <Grid2 size={12}>
          {isMobile ? (
            <Box sx={{ position: "relative", minHeight: 120 }}>
              <LoadingScreen loading={loading} />
              {!loading && filteredCollections.length === 0 && (
                <Typography
                  align="center"
                  color="text.secondary"
                  sx={{ py: 4 }}
                >
                  لا توجد فواتير في هذه الفترة
                </Typography>
              )}
              {/* Window scrolling: no nested scroll box on phones. */}
              <Virtuoso
                useWindowScroll
                increaseViewportBy={{ top: 600, bottom: 1600 }}
                data={filteredCollections}
                itemContent={(_, collection) => (
                  <CollectionBillCard
                    collection={collection}
                    context={listContext}
                  />
                )}
              />
            </Box>
          ) : (
            <Card
              elevation={3}
              sx={{
                position: "relative",
                height: 600,
              }}
            >
              <LoadingScreen loading={loading} />
              {!loading && filteredCollections.length === 0 ? (
                <Typography
                  align="center"
                  color="text.secondary"
                  sx={{ py: 6 }}
                >
                  لا توجد فواتير في هذه الفترة
                </Typography>
              ) : (
                <TableVirtuoso
                  fixedHeaderContent={fixedHeaderContent}
                  components={VirtuosoTableComponents}
                  data={filteredCollections}
                  context={listContext}
                />
              )}
            </Card>
          )}
        </Grid2>
      </Grid2>
    </>
  );
};

export default PartiesBills;

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useMemo, useState, useContext } from "react";
import {
  Autocomplete,
  Button,
  ButtonGroup,
  Card,
  Grid2,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import EChartsReact from "echarts-for-react";
import { ProductsAnalyticsType } from "./TopProductsAnalytics";
import { DBProducts } from "../../../utils/types";
import { exportToExcel } from "../utils";
import tableIcon from "./table.png";
import { StoreContext } from "@renderer/StoreDataProvider";

const getAnalytics = async (
  startDate: string,
  endDate: string,
  selectedProducts: number[],
  storeId: number,
) => {
  const { data } = await axios.post<ProductsAnalyticsType>(
    "/analytics/products",
    selectedProducts,
    {
      params: {
        start_date: startDate,
        end_date: endDate,
        store_id: storeId,
      },
    },
  );
  return data;
};

const getProds = async (storeId: number) => {
  const { data } = await axios.get<DBProducts>("/products", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const ProductsAnalytics = () => {
  const [startDate, setStartDate] = useState<Dayjs>(
    dayjs().subtract(1, "month"),
  );
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const { storeId } = useContext(StoreContext);

  const {
    palette: { mode },
  } = useTheme();

  const { data, isFetching } = useQuery({
    queryKey: ["analytics", selectedProducts, startDate, endDate, storeId],
    queryFn: () =>
      getAnalytics(
        startDate.toISOString(),
        endDate.toISOString(),
        selectedProducts,
        storeId,
      ),
    initialData: {},
    enabled: selectedProducts.length > 0,
  });

  const { data: products } = useQuery({
    queryKey: ["products", storeId],
    queryFn: () => getProds(storeId),
    initialData: {
      products: [],
      reserved_products: [],
    },
  });

  const setRange = useCallback((range: "day" | "week" | "month") => {
    switch (range) {
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
  }, []);

  const options: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
      },
      legend: {},
      toolbox: {
        feature: {
          magicType: {
            type: ["line", "bar"],
          },
          saveAsImage: {},
          myTool: {
            show: true,
            title: "Export to Excel",
            icon: `image://${tableIcon}`,
            onclick: () => {
              const groupedByDate = new Map<string, Map<string, number>>();
              const allDates = new Set<string>();
              const allProducts = new Set<string>();

              // Collect all unique dates and products
              Object.entries(data).forEach(([name, values]) => {
                allProducts.add(name);
                values.forEach(([date, _]) => {
                  allDates.add(date);
                });
              });

              // Initialize each product's data for all dates with 0
              allDates.forEach((date) => {
                if (!groupedByDate.has(date)) {
                  groupedByDate.set(date, new Map<string, number>());
                }
                allProducts.forEach((product) => {
                  groupedByDate.get(date)!.set(product, 0);
                });
              });

              // Populate the actual values
              Object.entries(data).forEach(([name, values]) => {
                values.forEach(([date, value]) => {
                  groupedByDate.get(date)!.set(name, value);
                });
              });

              const exportData = [
                ["التاريخ", "المنتج", "الكمية المباعة"],
                ...Array.from(groupedByDate.entries()).flatMap(
                  ([date, products]) =>
                    Array.from(products.entries()).map(([name, value]) => [
                      date,
                      name,
                      value,
                    ]),
                ),
              ];

              exportToExcel(exportData);
            },
          },
        },
        show: true,
      },
      xAxis: {
        type: "time",
      },
      yAxis: {
        type: "value",
      },
      series: Object.entries(data).map(([name, values]) => ({
        name,
        type: "line",
        smooth: true,
        data: values,
      })),
    }),
    [data],
  );

  return (
    <Grid2 size={12}>
      <Card elevation={3} sx={{ px: 3, py: 2, position: "relative" }}>
        <Grid2 container spacing={2}>
          <Grid2 size={12}>
            <Typography variant="h4">احصائيات المنتجات المحددة</Typography>
            <Typography variant="body1">
              قم بتحديد الفترة و المنتجات لعرض الاحصائيات
            </Typography>
            <Typography variant="body1">يمكن اختيار اكثر من منتج</Typography>
          </Grid2>

          <Grid2 container gap={3} size={12}>
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                label="من"
                value={startDate}
                onChange={(newValue) => {
                  if (!newValue) return;
                  setStartDate(newValue);
                }}
                disableFuture
                disabled={isFetching}
              />
            </LocalizationProvider>

            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale="ar-sa"
            >
              <DatePicker
                label="الى"
                value={endDate}
                onChange={(newValue) => {
                  if (!newValue) return;
                  setEndDate(newValue);
                }}
                disabled={isFetching}
              />
            </LocalizationProvider>
          </Grid2>
          <Grid2 size={12}>
            <ButtonGroup>
              <Button onClick={() => setRange("day")}>اليوم</Button>
              <Button onClick={() => setRange("week")}>هذا الاسبوع</Button>
              <Button onClick={() => setRange("month")}>هذا الشهر</Button>
            </ButtonGroup>
          </Grid2>
          <Grid2 size={12}>
            <Autocomplete
              multiple
              options={products.products}
              getOptionLabel={(option) => option.name}
              value={products.products.filter((prod) =>
                selectedProducts.includes(prod.id!),
              )}
              onChange={(_, newValue) =>
                setSelectedProducts(newValue.map((prod) => prod.id!))
              }
              renderInput={(params) => (
                <TextField {...params} label="المنتجات" />
              )}
            />
          </Grid2>
          <Grid2 size={12}>
            <EChartsReact
              option={options}
              style={{ height: 500 }}
              theme={mode}
              notMerge={true}
            />
          </Grid2>
        </Grid2>
      </Card>
    </Grid2>
  );
};

export default ProductsAnalytics;

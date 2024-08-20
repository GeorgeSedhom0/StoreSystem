import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useMemo, useState } from "react";
import {
  Autocomplete,
  Button,
  ButtonGroup,
  Card,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import EChartsReact from "echarts-for-react";
import { ProductsAnalyticsType } from "./TopProductsAnalytics";
import { DBProducts } from "../../../utils/types";

const getAnalytics = async (
  startDate: string,
  endDate: string,
  selectedProducts: number[]
) => {
  const { data } = await axios.post<ProductsAnalyticsType>(
    import.meta.env.VITE_SERVER_URL + "/analytics/products",
    selectedProducts,
    {
      params: {
        start_date: startDate,
        end_date: endDate,
      },
    }
  );
  return data;
};

const getProds = async () => {
  const { data } = await axios.get<DBProducts>(
    import.meta.env.VITE_SERVER_URL + "/products"
  );
  return data;
};

const ProductsAnalytics = () => {
  const [startDate, setStartDate] = useState<Dayjs>(
    dayjs().subtract(1, "month")
  );
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);

  const { data, isFetching } = useQuery({
    queryKey: ["analytics", selectedProducts, startDate, endDate],
    queryFn: () =>
      getAnalytics(
        startDate.toISOString(),
        endDate.toISOString(),
        selectedProducts
      ),
    initialData: {},
    enabled: selectedProducts.length > 0,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: getProds,
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

  const options = useMemo(
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
    [data]
  );

  return (
    <Grid item xs={12}>
      <Card elevation={3} sx={{ px: 3, py: 2, position: "relative" }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h4">احصائيات المنتجات المحددة</Typography>
            <Typography variant="body1">
              قم بتحديد الفترة و المنتجات لعرض الاحصائيات
            </Typography>
            <Typography variant="body1">يمكن اختيار اكثر من منتج</Typography>
          </Grid>

          <Grid item container gap={3} xs={12}>
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
          </Grid>
          <Grid item xs={12}>
            <ButtonGroup>
              <Button onClick={() => setRange("day")}>اليوم</Button>
              <Button onClick={() => setRange("week")}>هذا الاسبوع</Button>
              <Button onClick={() => setRange("month")}>هذا الشهر</Button>
            </ButtonGroup>
          </Grid>
          <Grid item xs={12}>
            <Autocomplete
              multiple
              options={products.products}
              getOptionLabel={(option) => option.name}
              value={products.products.filter((prod) =>
                selectedProducts.includes(prod.id!)
              )}
              onChange={(_, newValue) =>
                setSelectedProducts(newValue.map((prod) => prod.id!))
              }
              renderInput={(params) => (
                <TextField {...params} label="المنتجات" />
              )}
            />
          </Grid>
          <Grid item xs={12}>
            <EChartsReact
              option={options}
              style={{ height: 500 }}
              theme="dark"
            />
          </Grid>
        </Grid>
      </Card>
    </Grid>
  );
};

export default ProductsAnalytics;

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useContext, useMemo, useState } from "react";
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
import { DBProducts } from "../../utils/types";
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
    initialData: {} as ProductsAnalyticsType,
    enabled: selectedProducts.length > 0,
  });

  // Always treat data as simple [date, value] pairs
  const actualData = data;

  const { data: products } = useQuery({
    queryKey: ["products", storeId],
    queryFn: () => getProds(storeId),
    initialData: {
      products: [],
      reserved_products: [],
    },
  });

  const productOptions = useMemo(
    () => ["الكل", ...products.products.map((prod) => prod.name)],
    [products.products],
  );

  const allProductIds = useMemo(
    () => products.products.map((prod) => prod.id!),
    [products.products],
  );

  const isAllSelected = useMemo(
    () =>
      selectedProducts.length === allProductIds.length &&
      allProductIds.length > 0,
    [selectedProducts, allProductIds],
  );

  const selectedProductNames = useMemo(() => {
    if (isAllSelected) {
      return ["الكل"];
    }
    return products.products
      .filter((prod) => selectedProducts.includes(prod.id!))
      .map((prod) => prod.name);
  }, [products.products, selectedProducts, isAllSelected]);

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
      legend: {
        type: "scroll",
        orient: "horizontal",
        pageButtonPosition: "end",
        pageButtonGap: 5,
        pageIconSize: 12,
        pageTextStyle: { fontSize: 10 },
        tooltip: {
          show: true,
        },
      },
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
              const exportData = [
                ["المنتج", "التاريخ", "الكمية المباعة", "نوع البيانات"],
                ...Object.entries(actualData).flatMap(([productName, values]) =>
                  values.map(([date, value, is_prediction]) => [
                    productName,
                    date,
                    value,
                    is_prediction ? "توقع" : "فعلي",
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
      series: Object.entries(actualData).map(([name, values]) => ({
        name,
        type: "line",
        smooth: true,
        data: values.map(([date, value, is_prediction]) => ({
          value: [date, value],
          itemStyle: is_prediction
            ? {
                color: "rgba(255, 165, 0, 0.6)",
                borderColor: "#FFA500",
                borderWidth: 2,
                borderType: "dashed",
              }
            : undefined,
        })),
        lineStyle: {
          type: "solid",
        },
      })),
    }),
    [actualData],
  );

  const handleProductChange = (_event, newValue: string[]) => {
    const hasAll = newValue.includes("الكل");

    if (hasAll) {
      setSelectedProducts(allProductIds);
    } else {
      const newSelectedIds = products.products
        .filter((prod) => newValue.includes(prod.name))
        .map((prod) => prod.id!);
      setSelectedProducts(newSelectedIds);
    }
  };

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
            {Object.values(actualData).some((arr) =>
              arr.some(([, , is_prediction]) => is_prediction),
            ) && (
              <Typography variant="body2" sx={{ color: "orange", mt: 1 }}>
                🔮 يتضمن التقرير توقعات للتواريخ المستقبلية
              </Typography>
            )}
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
              options={productOptions}
              value={selectedProductNames}
              onChange={handleProductChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="المنتجات"
                  placeholder={
                    selectedProductNames.length === 0 ? "اختر المنتجات..." : ""
                  }
                />
              )}
              noOptionsText="لا توجد منتجات"
              clearText="مسح الكل"
              openText="فتح"
              closeText="إغلاق"
              limitTags={3}
              getLimitTagsText={(more) => `+${more} أخرى`}
              disableCloseOnSelect
            />
          </Grid2>
          <Grid2 size={12}>
            <EChartsReact
              option={options}
              style={{ height: 500 }}
              theme={mode}
              notMerge={true}
              loadingOption={{
                text: "جار التحميل...",
                color: "#1890ff",
                textColor: "#fff",
                maskColor: "rgba(0, 0, 0, 0.45)",
              }}
              showLoading={isFetching}
            />
          </Grid2>
        </Grid2>
      </Card>
    </Grid2>
  );
};

export default ProductsAnalytics;

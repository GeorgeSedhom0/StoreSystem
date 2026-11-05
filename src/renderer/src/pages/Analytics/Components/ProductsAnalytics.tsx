import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { useContext, useMemo, useState } from "react";
import {
  Autocomplete,
  Card,
  Grid2,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import EChartsReact from "echarts-for-react";
import { ProductsAnalyticsType } from "./TopProductsAnalytics";
import { DBProducts } from "../../utils/types";
import { exportToExcel } from "../utils";
import { StoreContext } from "@renderer/StoreDataProvider";
import { localTimestamp } from "../../utils/functions";
import { normalizeArabic } from "../../Shared/ProductAutocomplete";
import {
  ChartHeader,
  DateRangeFilter,
  ExportExcelButton,
  chartGrid,
  chartToolbox,
  useChartHeight,
  useIsPhone,
} from "./ChartTools";

const ALL = "الكل";

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
  const isPhone = useIsPhone();
  const chartHeight = useChartHeight(500, 340);

  const {
    palette: { mode },
  } = useTheme();

  const {
    data: actualData,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["analytics", selectedProducts, startDate, endDate, storeId],
    queryFn: () =>
      getAnalytics(
        localTimestamp(startDate.startOf("day")),
        localTimestamp(endDate.endOf("day")),
        selectedProducts,
        storeId,
      ),
    initialData: {} as ProductsAnalyticsType,
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

  const productOptions = useMemo(
    () => [ALL, ...products.products.map((prod) => prod.name)],
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
      return [ALL];
    }
    return products.products
      .filter((prod) => selectedProducts.includes(prod.id!))
      .map((prod) => prod.name);
  }, [products.products, selectedProducts, isAllSelected]);

  const isEmpty = Object.keys(actualData).length === 0;

  const handleExport = () =>
    exportToExcel(
      [
        ["المنتج", "التاريخ", "الكمية المباعة", "نوع البيانات"],
        ...Object.entries(actualData).flatMap(([productName, values]) =>
          values.map(([date, value, is_prediction]) => [
            productName,
            date,
            value,
            is_prediction ? "توقع" : "فعلي",
          ]),
        ),
      ],
      "إحصائيات المنتجات",
    );

  const options: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
        confine: true,
      },
      legend: {
        type: "scroll" as const,
        orient: "horizontal",
        top: isPhone ? 28 : 0,
        pageButtonPosition: "end",
        pageButtonGap: 5,
        pageIconSize: 12,
        pageTextStyle: { fontSize: 10 },
        tooltip: {
          show: true,
        },
      },
      toolbox: chartToolbox(),
      grid: chartGrid(isPhone, { top: isPhone ? 72 : 56 }),
      xAxis: {
        type: "time",
        axisLabel: { hideOverlap: true },
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
    [actualData, isPhone],
  );

  const handleProductChange = (_event, newValue: string[]) => {
    const hasAll = newValue.includes(ALL);

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
      <Card
        elevation={3}
        sx={{ px: { xs: 1.5, sm: 3 }, py: 2, position: "relative" }}
      >
        <Grid2 container spacing={2}>
          <Grid2 size={12}>
            <ChartHeader
              title="إحصائيات المنتجات المحددة"
              subtitle={
                <>
                  حدد الفترة والمنتجات لعرض الإحصائيات (يمكن اختيار أكثر من
                  منتج)
                  {Object.values(actualData).some((arr) =>
                    arr.some(([, , is_prediction]) => is_prediction),
                  ) && (
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ color: "orange", display: "block", mt: 0.5 }}
                    >
                      🔮 يتضمن التقرير توقعات للتواريخ المستقبلية
                    </Typography>
                  )}
                </>
              }
              actions={
                <ExportExcelButton onClick={handleExport} disabled={isEmpty} />
              }
            />
          </Grid2>

          <Grid2 size={12}>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
              disabled={isFetching}
            />
          </Grid2>
          <Grid2 size={12}>
            <Autocomplete
              multiple
              options={productOptions}
              value={selectedProductNames}
              onChange={handleProductChange}
              filterOptions={(options, { inputValue }) => {
                const words = normalizeArabic(inputValue)
                  .split(/\s+/)
                  .filter(Boolean);
                if (words.length === 0) return options.slice(0, 100);
                return options
                  .filter((o) => {
                    if (o === ALL) return true;
                    const hay = normalizeArabic(o);
                    return words.every((w) => hay.includes(w));
                  })
                  .slice(0, 100);
              }}
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
              limitTags={isPhone ? 2 : 3}
              getLimitTagsText={(more) => `+${more} أخرى`}
              disableCloseOnSelect
            />
          </Grid2>
          <Grid2 size={12}>
            {selectedProducts.length === 0 ? (
              <Typography
                color="text.secondary"
                sx={{ py: 4, textAlign: "center" }}
              >
                اختر منتجًا واحدًا على الأقل لعرض الرسم البياني
              </Typography>
            ) : isError ? (
              <Typography color="error" sx={{ py: 4, textAlign: "center" }}>
                تعذر تحميل البيانات
              </Typography>
            ) : !isFetching && isEmpty ? (
              <Typography
                color="text.secondary"
                sx={{ py: 4, textAlign: "center" }}
              >
                لا توجد مبيعات للمنتجات المحددة في هذه الفترة
              </Typography>
            ) : (
              <EChartsReact
                option={options}
                style={{ height: chartHeight }}
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
            )}
          </Grid2>
        </Grid2>
      </Card>
    </Grid2>
  );
};

export default ProductsAnalytics;

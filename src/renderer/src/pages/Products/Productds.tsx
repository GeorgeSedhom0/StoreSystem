import axios from "axios";
import { useCallback, useMemo, useState, useContext, useEffect } from "react";
import { Product } from "../utils/types";
import {
  Button,
  Card,
  FormControlLabel,
  Grid2,
  Switch,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
  Chip,
  Box,
  InputAdornment,
  TablePagination,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { Search, Download } from "@mui/icons-material";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import LoadingScreen from "../Shared/LoadingScreen";
import { Link } from "react-router-dom";
import useProducts from "../Shared/hooks/useProducts";
import { StoreContext } from "@renderer/StoreDataProvider";
import { exportToExcel } from "../Analytics/utils";
import ProductCard from "./Components/ProductCard";
import BatchManagementModal from "../Shared/BatchManagementModal";

interface BatchExpirationInfo {
  productId: number;
  earliestExpiration: string | null;
  hasExpiringBatches: boolean;
}

const Products = () => {
  const [editedProducts, setEditedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  
  // Batch management state
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [selectedProductForBatch, setSelectedProductForBatch] = useState<Product | null>(null);
  const [batchExpirationInfo, setBatchExpirationInfo] = useState<Map<number, BatchExpirationInfo>>(new Map());

  // Enhanced table state
  const [orderBy, setOrderBy] = useState<keyof Product>("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const {
    products,
    reservedProducts,
    updateProducts: getProds,
  } = useProducts(showDeleted);

  const { storeId } = useContext(StoreContext);

  // Load batch expiration info for all products in one request
  const loadBatchExpirationInfo = useCallback(async () => {
    if (!storeId) return;
    
    try {
      const response = await axios.get(`/batches/expiration-info`, {
        params: { store_id: storeId, threshold_days: 14 },
      });
      
      const data = response.data as Record<string, { earliest_expiration: string | null; has_expiring_batches: boolean }>;
      const infoMap = new Map<number, BatchExpirationInfo>();
      
      Object.entries(data).forEach(([productIdStr, info]) => {
        const productId = parseInt(productIdStr, 10);
        infoMap.set(productId, {
          productId,
          earliestExpiration: info.earliest_expiration 
            ? new Date(info.earliest_expiration).toLocaleDateString('en-GB') 
            : null,
          hasExpiringBatches: info.has_expiring_batches,
        });
      });
      
      setBatchExpirationInfo(infoMap);
    } catch (error) {
      console.error("Error loading batch expiration info:", error);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId) {
      loadBatchExpirationInfo();
    }
  }, [storeId, loadBatchExpirationInfo]);

  const handleOpenBatchModal = useCallback((product: Product) => {
    setSelectedProductForBatch(product);
    setBatchModalOpen(true);
  }, []);

  const handleCloseBatchModal = useCallback(() => {
    setBatchModalOpen(false);
    setSelectedProductForBatch(null);
    // Refresh batch info after modal closes
    loadBatchExpirationInfo();
  }, [loadBatchExpirationInfo]);

  // Extract unique categories from products
  const availableCategories = useMemo(() => {
    const categories = [
      ...new Set(products.map((product) => product.category)),
    ];
    return categories.filter(Boolean).sort((a, b) => a.localeCompare(b, "ar"));
  }, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    let filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(query.toLowerCase()) ||
        product.bar_code.toLowerCase().includes(query.toLowerCase()),
    );

    // Category filtering
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((product) =>
        selectedCategories.includes(product.category),
      );
    }

    // Stock filtering
    if (stockFilter === "low") {
      filtered = filtered.filter(
        (product) => product.stock > 0 && product.stock <= 10,
      );
    } else if (stockFilter === "out") {
      filtered = filtered.filter((product) => product.stock <= 0);
    }

    // Changed only filter
    if (changedOnly) {
      const editedIds = new Set(editedProducts.map((p) => p.id));
      filtered = filtered.filter((product) => editedIds.has(product.id));
    } // Sorting
    filtered.sort((a, b) => {
      const aValue = a[orderBy];
      const bValue = b[orderBy];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return order === "asc"
          ? aValue.localeCompare(bValue, "ar")
          : bValue.localeCompare(aValue, "ar");
      }

      // Handle undefined values
      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      if (order === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [
    products,
    query,
    selectedCategories,
    stockFilter,
    changedOnly,
    editedProducts,
    orderBy,
    order,
  ]);

  const paginatedProducts = useMemo(() => {
    const startIndex = page * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredAndSortedProducts.slice(startIndex, endIndex);
  }, [filteredAndSortedProducts, page, rowsPerPage]);

  const handleSort = (property: keyof Product) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
    setPage(0);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleCategoryChange = (_event, newValue: string[]) => {
    setSelectedCategories(newValue);
    setPage(0);
  };
  const handleExportToExcel = () => {
    const headerRow = [
      "اسم المنتج",
      "البار كود",
      "السعر",
      "سعر الشراء",
      "الكمية",
      "المحجوز",
      "المجموعة",
    ];

    const dataRows = filteredAndSortedProducts.map((product) => [
      product.name,
      product.bar_code,
      product.price?.toString() || "",
      product.wholesale_price?.toString() || "",
      product.stock?.toString() || "",
      (reservedProducts[product.id!]?.stock || 0).toString(),
      product.category || "",
    ]);

    const exportData = [headerRow, ...dataRows];
    exportToExcel(exportData);
  };

  const statCardsData = useMemo(() => {
    return {
      totalProducts: filteredAndSortedProducts.length,
      lowStock: filteredAndSortedProducts.filter(
        (p) => p.stock > 0 && p.stock <= 10,
      ).length,
      outOfStock: filteredAndSortedProducts.filter((p) => p.stock <= 0).length,
      totalValue: filteredAndSortedProducts.reduce(
        (acc, product) => acc + product.price * product.stock,
        0,
      ),
      totalWholesaleValue: filteredAndSortedProducts.reduce(
        (acc, product) => acc + product.wholesale_price * product.stock,
        0,
      ),
    };
  }, [filteredAndSortedProducts]);

  const submitProducts = useCallback(async () => {
    setLoading(true);
    try {
      await axios.put("/products", editedProducts, {
        params: {
          store_id: storeId,
        },
      });
      setMsg({ type: "success", text: "تم تعديل المنتجات بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء تعديل المنتجات" });
    }
    await getProds();
    setLoading(false);
    setQuery("");
    setChangedOnly(false);
    setEditedProducts([]);
  }, [editedProducts]);

  const deleteProduct = useCallback(async (productId: number) => {
    setLoading(true);
    try {
      await axios.put("/product/delete", null, {
        params: {
          product_id: productId,
          store_id: storeId,
        },
      });
      setMsg({ type: "success", text: "تم ازالة المنتج بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء ازالة المنتج" });
    }
    await getProds();
    setLoading(false);
  }, []);

  const restoreProduct = useCallback(async (productId: number) => {
    setLoading(true);
    try {
      await axios.put("/product/restore", null, {
        params: {
          product_id: productId,
          store_id: storeId,
        },
      });
      setMsg({ type: "success", text: "تم استعادة المنتج بنجاح" });
    } catch (error) {
      console.log(error);
      setMsg({ type: "error", text: "حدث خطأ أثناء استعادة المنتج" });
    }
    await getProds();
    setLoading(false);
  }, []);

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Grid2 container spacing={3}>
              <Grid2 container size={12} justifyContent="space-between">
                <Typography variant="h4">المنتجات</Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showDeleted}
                      onChange={(e) => setShowDeleted(e.target.checked)}
                    />
                  }
                  label="عرض المنتجات المحذوفة"
                />
              </Grid2>
              <Grid2 size={12}>
                <Typography variant="subtitle1">
                  عند الانتهاء من التعديل يرجى الضغط على "عرض المعدلة فقط"
                  للتأكد من الحفظ بشكل صحيح
                </Typography>
                <Typography variant="subtitle2">
                  لا يمكن تعديل سعر الشراء او البيع للمنتج من هذة الصفحة للتعديل
                  يجب الذهاب الى{" "}
                  <Link
                    to="/buy"
                    style={{
                      color: "inherit",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    صفحة الشراء
                  </Link>
                </Typography>
              </Grid2>
              <Grid2 container size={12} gap={3}>
                <Button onClick={submitProducts} variant="contained">
                  حفظ التعديلات
                </Button>
                <Button
                  onClick={() => setChangedOnly((prev) => !prev)}
                  variant="contained"
                >
                  {changedOnly ? "عرض الكل" : "عرض المعدلة فقط"}
                </Button>
              </Grid2>{" "}
              <Grid2 size={12}>
                <TextField
                  label="بحث"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Grid2>
              <Grid2 size={6}>
                <Autocomplete
                  multiple
                  options={availableCategories}
                  value={selectedCategories}
                  onChange={handleCategoryChange}
                  renderInput={(params) => (
                    <TextField {...params} label="تصفية حسب المجموعة" />
                  )}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        variant="outlined"
                        label={option}
                        {...getTagProps({ index })}
                        key={option}
                      />
                    ))
                  }
                />
              </Grid2>
              <Grid2 size={3}>
                <FormControl fullWidth>
                  <InputLabel>تصفية المخزون</InputLabel>
                  <Select
                    value={stockFilter}
                    label="تصفية المخزون"
                    onChange={(e) =>
                      setStockFilter(e.target.value as "all" | "low" | "out")
                    }
                  >
                    <MenuItem value="all">جميع المنتجات</MenuItem>
                    <MenuItem value="low">مخزون منخفض (≤10)</MenuItem>
                    <MenuItem value="out">نفد المخزون</MenuItem>
                  </Select>
                </FormControl>
              </Grid2>
              <Grid2 size={3}>
                <Button
                  onClick={handleExportToExcel}
                  variant="outlined"
                  startIcon={<Download />}
                  fullWidth
                >
                  تصدير إلى Excel
                </Button>
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>{" "}
        <Grid2 size={12}>
          <Card elevation={3} sx={{ position: "relative" }}>
            <LoadingScreen loading={loading} />

            {/* Statistics Cards */}
            <Box sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
              <Chip
                label={`إجمالي المنتجات: ${statCardsData.totalProducts}`}
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`مخزون منخفض: ${statCardsData.lowStock}`}
                color="warning"
                variant="outlined"
              />
              <Chip
                label={`نفد المخزون: ${statCardsData.outOfStock}`}
                color="error"
                variant="outlined"
              />
              <Chip
                label={`إجمالي قيمة المخزون: ${statCardsData.totalValue.toFixed(
                  2,
                )}`}
                color="success"
                variant="outlined"
              />
              <Chip
                label={`إجمالي قيمة الشراء: ${statCardsData.totalWholesaleValue.toFixed(
                  2,
                )}`}
                color="info"
                variant="outlined"
              />
            </Box>

            <TableContainer component={Paper}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "name"}
                        direction={orderBy === "name" ? order : "asc"}
                        onClick={() => handleSort("name")}
                      >
                        اسم المنتج
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "bar_code"}
                        direction={orderBy === "bar_code" ? order : "asc"}
                        onClick={() => handleSort("bar_code")}
                      >
                        البار كود
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "price"}
                        direction={orderBy === "price" ? order : "asc"}
                        onClick={() => handleSort("price")}
                      >
                        السعر
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "wholesale_price"}
                        direction={
                          orderBy === "wholesale_price" ? order : "asc"
                        }
                        onClick={() => handleSort("wholesale_price")}
                      >
                        سعر الشراء
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "stock"}
                        direction={orderBy === "stock" ? order : "asc"}
                        onClick={() => handleSort("stock")}
                      >
                        الكمية
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>المحجوز</TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "category"}
                        direction={orderBy === "category" ? order : "asc"}
                        onClick={() => handleSort("category")}
                      >
                        المجموعة
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>الصلاحية</TableCell>
                    <TableCell>إجراءات</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedProducts.map((product) => {
                    const batchInfo = product.id ? batchExpirationInfo.get(product.id) : undefined;
                    return (
                      <ProductCard
                        key={product.id || product.bar_code}
                        product={product}
                        reserved={reservedProducts[product.id!]?.stock || 0}
                        setEditedProducts={setEditedProducts}
                        editedProducts={editedProducts}
                        deleteProduct={deleteProduct}
                        restoreProduct={restoreProduct}
                        isShowingDeleted={showDeleted}
                        onOpenBatchModal={handleOpenBatchModal}
                        earliestExpiration={batchInfo?.earliestExpiration}
                        hasExpiringBatches={batchInfo?.hasExpiringBatches}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={filteredAndSortedProducts.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="عدد الصفوف في الصفحة:"
              labelDisplayedRows={({ from, to, count }) =>
                `${from}-${to} من ${count !== -1 ? count : `أكثر من ${to}`}`
              }
            />
          </Card>
        </Grid2>
      </Grid2>

      {/* Batch Management Modal */}
      {selectedProductForBatch && selectedProductForBatch.id && (
        <BatchManagementModal
          open={batchModalOpen}
          onClose={handleCloseBatchModal}
          productId={selectedProductForBatch.id}
          productName={selectedProductForBatch.name}
          currentStock={selectedProductForBatch.stock}
        />
      )}
    </>
  );
};

export default Products;

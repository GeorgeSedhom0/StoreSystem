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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Search, Download } from "@mui/icons-material";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import LoadingScreen from "../Shared/LoadingScreen";
import { Link } from "react-router-dom";
import useProducts from "../Shared/hooks/useProducts";
import PackagesDialog from "../Shared/PackagesDialog";
import { StoreContext } from "@renderer/StoreDataProvider";
import { exportToExcel } from "../Analytics/utils";
import { normalizeArabic } from "../Shared/ProductAutocomplete";
import { apiError } from "../utils/errors";
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
  const [selectedProductForBatch, setSelectedProductForBatch] =
    useState<Product | null>(null);
  const [batchExpirationInfo, setBatchExpirationInfo] = useState<
    Map<number, BatchExpirationInfo>
  >(new Map());

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

  const { storeId, profile } = useContext(StoreContext);
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("md"));
  const [packagesFor, setPackagesFor] = useState<Product | null>(null);
  // Package prices are prices: editable where product prices are (admin).
  const canEditPackages = !!profile?.user.paths.includes("/admin/products");

  // Load batch expiration info for all products in one request
  const loadBatchExpirationInfo = useCallback(async () => {
    if (storeId === null || storeId === undefined) return;

    try {
      const response = await axios.get(`/batches/expiration-info`, {
        params: { store_id: storeId, threshold_days: 14 },
      });

      const data = response.data as Record<
        string,
        { earliest_expiration: string | null; has_expiring_batches: boolean }
      >;
      const infoMap = new Map<number, BatchExpirationInfo>();

      Object.entries(data).forEach(([productIdStr, info]) => {
        const productId = parseInt(productIdStr, 10);
        infoMap.set(productId, {
          productId,
          earliestExpiration: info.earliest_expiration
            ? new Date(info.earliest_expiration).toLocaleDateString("en-GB")
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
    if (storeId !== null && storeId !== undefined) {
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
    // Same matching as the POS search: every word must appear in the name or
    // barcode, ignoring Arabic letter variants (أ/ا, ة/ه, ى/ي).
    const words = normalizeArabic(query).split(/\s+/).filter(Boolean);
    let filtered = words.length
      ? products.filter((product) => {
          const hay =
            normalizeArabic(product.name) +
            " " +
            (product.bar_code || "").toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : [...products];

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
      Number(product.price) || 0,
      Number(product.wholesale_price) || 0,
      Number(product.stock) || 0,
      Number(reservedProducts[product.id!]?.stock) || 0,
      product.category || "",
    ]);

    const exportData = [headerRow, ...dataRows];
    exportToExcel(exportData, "المنتجات");
  };

  useEffect(() => {
    if (editedProducts.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editedProducts.length]);

  const money = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
    if (editedProducts.length === 0) return;
    setLoading(true);
    try {
      await axios.put("/products", editedProducts, {
        params: {
          store_id: storeId,
        },
      });
      setMsg({
        type: "success",
        text: `تم حفظ تعديلات ${editedProducts.length} منتج بنجاح`,
      });
      // Only drop the edits once they are actually saved.
      setQuery("");
      setChangedOnly(false);
      setEditedProducts([]);
      await getProds();
    } catch (error) {
      // Keep the edits so nothing typed is lost; show why it failed.
      setMsg({
        type: "error",
        text: apiError(error, "حدث خطأ أثناء حفظ تعديلات المنتجات"),
      });
    } finally {
      setLoading(false);
    }
  }, [editedProducts, storeId, getProds]);

  const deleteProduct = useCallback(
    async (productId: number) => {
      setLoading(true);
      try {
        await axios.put("/product/delete", null, {
          params: {
            product_id: productId,
            store_id: storeId,
          },
        });
        setMsg({ type: "success", text: "تمت إزالة المنتج بنجاح" });
      } catch (error) {
        setMsg({
          type: "error",
          text: apiError(error, "حدث خطأ أثناء إزالة المنتج"),
        });
      }
      await getProds();
      setLoading(false);
    },
    [storeId, getProds],
  );

  const restoreProduct = useCallback(
    async (productId: number) => {
      setLoading(true);
      try {
        await axios.put("/product/restore", null, {
          params: {
            product_id: productId,
            store_id: storeId,
          },
        });
        setMsg({ type: "success", text: "تمت استعادة المنتج بنجاح" });
      } catch (error) {
        setMsg({
          type: "error",
          text: apiError(error, "حدث خطأ أثناء استعادة المنتج"),
        });
      }
      await getProds();
      setLoading(false);
    },
    [storeId, getProds],
  );

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 container spacing={3}>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Grid2 container spacing={{ xs: 2, sm: 3 }}>
              <Grid2
                container
                size={12}
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  variant="h4"
                  sx={{ fontSize: { xs: "1.6rem", sm: "2.125rem" } }}
                >
                  المنتجات
                </Typography>
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
                <Typography variant="body1">
                  عند الانتهاء من التعديل اضغط "عرض المعدلة فقط" للتأكد من
                  التعديلات ثم اضغط "حفظ التعديلات"
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  لا يمكن تعديل سعر الشراء أو البيع من هذه الصفحة، للتعديل اذهب
                  إلى{" "}
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
              <Grid2 container size={12} gap={{ xs: 1.5, sm: 3 }}>
                <Button
                  onClick={submitProducts}
                  variant="contained"
                  disabled={loading || editedProducts.length === 0}
                  sx={{ minHeight: 40, flex: { xs: 1, sm: "none" } }}
                >
                  حفظ التعديلات
                  {editedProducts.length > 0 && ` (${editedProducts.length})`}
                </Button>
                <Button
                  onClick={() => setChangedOnly((prev) => !prev)}
                  variant="outlined"
                  disabled={!changedOnly && editedProducts.length === 0}
                  sx={{ minHeight: 40, flex: { xs: 1, sm: "none" } }}
                >
                  {changedOnly ? "عرض الكل" : "عرض المعدلة فقط"}
                </Button>
              </Grid2>
              <Grid2 size={12}>
                <TextField
                  label="بحث بالاسم أو الباركود"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
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
              <Grid2 size={{ xs: 12, sm: 6 }}>
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
              <Grid2 size={{ xs: 6, sm: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>تصفية المخزون</InputLabel>
                  <Select
                    value={stockFilter}
                    label="تصفية المخزون"
                    onChange={(e) => {
                      setStockFilter(e.target.value as "all" | "low" | "out");
                      setPage(0);
                    }}
                  >
                    <MenuItem value="all">جميع المنتجات</MenuItem>
                    <MenuItem value="low">مخزون منخفض (≤10)</MenuItem>
                    <MenuItem value="out">نفد المخزون</MenuItem>
                  </Select>
                </FormControl>
              </Grid2>
              <Grid2 size={{ xs: 6, sm: 3 }}>
                <Button
                  onClick={handleExportToExcel}
                  variant="outlined"
                  startIcon={<Download />}
                  fullWidth
                  sx={{ height: "100%" }}
                  disabled={filteredAndSortedProducts.length === 0}
                >
                  تصدير Excel
                </Button>
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>
        <Grid2 size={12}>
          <Card elevation={3} sx={{ position: "relative" }}>
            <LoadingScreen loading={loading} />

            {/* Statistics Cards */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                display: "flex",
                gap: { xs: 1, sm: 2 },
                flexWrap: "wrap",
              }}
            >
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
                label={`إجمالي قيمة المخزون: ${money(statCardsData.totalValue)}`}
                color="success"
                variant="outlined"
              />
              <Chip
                label={`إجمالي قيمة الشراء: ${money(
                  statCardsData.totalWholesaleValue,
                )}`}
                color="info"
                variant="outlined"
              />
            </Box>

            {isMobile ? (
              <Box sx={{ p: 1.25 }}>
                {paginatedProducts.map((product) => {
                  const batchInfo = product.id
                    ? batchExpirationInfo.get(product.id)
                    : undefined;
                  return (
                    <ProductCard
                      isMobile
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
                      onOpenPackages={setPackagesFor}
                    />
                  );
                })}
                {paginatedProducts.length === 0 && (
                  <Typography
                    align="center"
                    color="text.secondary"
                    sx={{ py: 4 }}
                  >
                    لا توجد منتجات
                  </Typography>
                )}
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table stickyHeader sx={{ minWidth: 750 }}>
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
                      <TableCell>العبوات</TableCell>
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
                      const batchInfo = product.id
                        ? batchExpirationInfo.get(product.id)
                        : undefined;
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
                          onOpenPackages={setPackagesFor}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <TablePagination
              sx={{
                "& .MuiTablePagination-toolbar": {
                  flexWrap: "wrap",
                  px: { xs: 1, md: 2 },
                },
              }}
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

      {packagesFor && packagesFor.id && (
        <PackagesDialog
          open={!!packagesFor}
          onClose={() => setPackagesFor(null)}
          onSaved={() => getProds()}
          product={{
            id: packagesFor.id,
            name: packagesFor.name,
            price: packagesFor.price,
            wholesale_price: packagesFor.wholesale_price,
          }}
          readOnly={!canEditPackages}
        />
      )}

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

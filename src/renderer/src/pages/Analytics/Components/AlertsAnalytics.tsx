import {
  Card,
  Grid2,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  Alert,
  TablePagination,
  Autocomplete,
  Button,
  CircularProgress,
  Skeleton,
} from "@mui/material";
import { Search, Warning, Error, Download } from "@mui/icons-material";
import { StoreContext } from "@renderer/StoreDataProvider";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useContext, useState, useMemo } from "react";
import { exportToExcel } from "../utils";

interface AlertAnalytics {
  name: string;
  category: string;
  stock: number;
  days_left: number;
  urgent: boolean;
}

const getAnalytics = async ({ queryKey }) => {
  const [_analytics, _alerts, storeId] = queryKey;
  const { data } = await axios.get<AlertAnalytics[]>("/analytics/alerts", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const AlertsAnalytics = () => {
  const { storeId } = useContext(StoreContext);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "urgent" | "normal">("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<keyof AlertAnalytics>("days_left");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { data, isFetching, error } = useQuery({
    queryKey: ["analytics", "alerts", storeId],
    queryFn: getAnalytics,
    initialData: [],
  });

  // Extract unique categories from data
  const availableCategories = useMemo(() => {
    const categories = [...new Set(data.map((alert) => alert.category))];
    return categories.sort((a, b) => a.localeCompare(b, "ar"));
  }, [data]);

  const filteredAndSortedData = useMemo(() => {
    let filtered = data.filter((alert) =>
      alert.name.toLowerCase().includes(search.toLowerCase()),
    );

    if (filter === "urgent") {
      filtered = filtered.filter((alert) => alert.urgent);
    } else if (filter === "normal") {
      filtered = filtered.filter((alert) => !alert.urgent);
    }

    // Category filtering - if no categories selected, show all
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((alert) =>
        selectedCategories.includes(alert.category),
      );
    }

    filtered.sort((a, b) => {
      const aValue = a[orderBy];
      const bValue = b[orderBy];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return order === "asc"
          ? aValue.localeCompare(bValue, "ar")
          : bValue.localeCompare(aValue, "ar");
      }

      if (order === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [data, search, filter, selectedCategories, orderBy, order]);

  const paginatedData = useMemo(() => {
    const startIndex = page * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredAndSortedData.slice(startIndex, endIndex);
  }, [filteredAndSortedData, page, rowsPerPage]);

  const handleSort = (property: keyof AlertAnalytics) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
    setPage(0); // Reset to first page when sorting
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
    setPage(0); // Reset to first page when filtering
  };

  const handleExportToExcel = () => {
    // Prepare header row
    const headerRow = [
      "اسم المنتج",
      "المجموعة",
      "المخزون",
      "الأيام المتبقية",
      "الحالة",
    ];

    // Prepare data rows using filtered and sorted data
    const dataRows = filteredAndSortedData.map((alert) => [
      alert.name,
      alert.category,
      alert.stock.toString(),
      alert.days_left.toString(),
      alert.urgent ? "عاجل" : "عادي",
    ]);

    // Combine header and data
    const exportData = [headerRow, ...dataRows];

    // Export to Excel
    exportToExcel(exportData);
  };

  const urgentCount = filteredAndSortedData.filter(
    (alert) => alert.urgent,
  ).length;
  const averageDaysLeft =
    filteredAndSortedData.length > 0
      ? Math.round(
          filteredAndSortedData.reduce(
            (sum, alert) => sum + alert.days_left,
            0,
          ) / filteredAndSortedData.length,
        )
      : 0;
  const criticalCount = filteredAndSortedData.filter(
    (alert) => alert.days_left < 3,
  ).length;

  return (
    <Grid2 size={12}>
      <Card elevation={3} sx={{ p: 3 }}>
        <Box mb={3}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="flex-start"
            mb={2}
          >
            <Box>
              <Typography variant="h4" gutterBottom>
                تحذيرات الاقتراب من الانتهاء
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                تحليل إحصائي سريع للمنتجات المعرضة لنفاد المخزون بناءً على أنماط
                الاستهلاك خلال آخر 60 يوماً
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={
                isFetching ? <CircularProgress size={16} /> : <Download />
              }
              onClick={handleExportToExcel}
              disabled={filteredAndSortedData.length === 0 || isFetching}
              sx={{ minWidth: 120 }}
            >
              تصدير Excel
            </Button>
          </Box>

          {/* Meta Information */}
          <Grid2 container spacing={2} mb={2}>
            <Grid2 size={3}>
              {isFetching ? (
                <Skeleton variant="rectangular" height={40} />
              ) : (
                <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                  <Typography variant="body2">
                    إجمالي التحذيرات:{" "}
                    <strong>{filteredAndSortedData.length}</strong>
                  </Typography>
                </Alert>
              )}
            </Grid2>
            <Grid2 size={3}>
              {isFetching ? (
                <Skeleton variant="rectangular" height={40} />
              ) : (
                <Alert severity="error" variant="outlined" sx={{ py: 0.5 }}>
                  <Typography variant="body2">
                    حرج (أقل من 3 أيام): <strong>{criticalCount}</strong>
                  </Typography>
                </Alert>
              )}
            </Grid2>
            <Grid2 size={3}>
              {isFetching ? (
                <Skeleton variant="rectangular" height={40} />
              ) : (
                <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
                  <Typography variant="body2">
                    عاجل: <strong>{urgentCount}</strong>
                  </Typography>
                </Alert>
              )}
            </Grid2>
            <Grid2 size={3}>
              {isFetching ? (
                <Skeleton variant="rectangular" height={40} />
              ) : (
                <Alert severity="success" variant="outlined" sx={{ py: 0.5 }}>
                  <Typography variant="body2">
                    متوسط الأيام: <strong>{averageDaysLeft}</strong>
                  </Typography>
                </Alert>
              )}
            </Grid2>
          </Grid2>

          {/* Search and Filter Controls */}
          <Grid2 container spacing={2} mb={2}>
            <Grid2 size={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="البحث في المنتجات..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={isFetching}
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
            <Grid2 size={4}>
              <FormControl fullWidth size="small">
                <InputLabel>تصفية حسب الحالة</InputLabel>
                <Select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  label="تصفية حسب الحالة"
                  disabled={isFetching}
                >
                  <MenuItem value="all">جميع التحذيرات</MenuItem>
                  <MenuItem value="urgent">عاجل فقط</MenuItem>
                  <MenuItem value="normal">عادي فقط</MenuItem>
                </Select>
              </FormControl>
            </Grid2>
            <Grid2 size={4}>
              <Autocomplete
                multiple
                size="small"
                options={availableCategories}
                value={selectedCategories}
                onChange={handleCategoryChange}
                disabled={isFetching}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="تصفية حسب المجموعة"
                    placeholder={
                      selectedCategories.length === 0 ? "اختر المجموعات..." : ""
                    }
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      variant="outlined"
                      size="small"
                      label={option}
                      {...getTagProps({ index })}
                      key={option}
                    />
                  ))
                }
                noOptionsText="لا توجد مجموعات"
                clearText="مسح الكل"
                openText="فتح"
                closeText="إغلاق"
                limitTags={2}
                getLimitTagsText={(more) => `+${more} أخرى`}
                disableCloseOnSelect
              />
            </Grid2>
          </Grid2>
        </Box>

        {/* Data Table */}
        {error ? (
          <Alert severity="error">
            حدث خطأ في تحميل البيانات. يرجى المحاولة مرة أخرى.
          </Alert>
        ) : isFetching ? (
          <Box>
            <Skeleton variant="rectangular" height={300} />
            <Box mt={2}>
              <Skeleton variant="rectangular" height={50} />
            </Box>
          </Box>
        ) : filteredAndSortedData.length === 0 ? (
          <Alert severity="info">
            {data.length === 0
              ? "لا يوجد تحذيرات حالياً - جميع المنتجات في مستوى آمن"
              : "لم يتم العثور على نتائج مطابقة للبحث"}
          </Alert>
        ) : (
          <>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" stickyHeader>
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
                        active={orderBy === "category"}
                        direction={orderBy === "category" ? order : "asc"}
                        onClick={() => handleSort("category")}
                      >
                        المجموعة
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">
                      <TableSortLabel
                        active={orderBy === "stock"}
                        direction={orderBy === "stock" ? order : "asc"}
                        onClick={() => handleSort("stock")}
                      >
                        المخزون
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">
                      <TableSortLabel
                        active={orderBy === "days_left"}
                        direction={orderBy === "days_left" ? order : "asc"}
                        onClick={() => handleSort("days_left")}
                      >
                        الأيام المتبقية
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">الحالة</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedData.map((alert, index) => (
                    <TableRow
                      key={page * rowsPerPage + index}
                      sx={{
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          {alert.urgent && (
                            <Error color="error" fontSize="small" />
                          )}
                          <Typography
                            variant="body2"
                            fontWeight={alert.urgent ? "bold" : "normal"}
                          >
                            {alert.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {alert.category}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" fontWeight="medium">
                          {alert.stock}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography
                          variant="body2"
                          fontWeight="medium"
                          color={
                            alert.days_left < 3 ? "error.main" : "text.primary"
                          }
                        >
                          {alert.days_left}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          icon={
                            alert.urgent ? (
                              <Error fontSize="small" />
                            ) : (
                              <Warning fontSize="small" />
                            )
                          }
                          label={alert.urgent ? "عاجل" : "عادي"}
                          color={alert.urgent ? "error" : "warning"}
                          variant={alert.urgent ? "filled" : "outlined"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <TablePagination
              component="div"
              count={filteredAndSortedData.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
              labelRowsPerPage="عدد الاصناف في الصفحة:"
              labelDisplayedRows={({ from, to, count }) =>
                `${from}-${to} من أصل ${count !== -1 ? count : `أكثر من ${to}`}`
              }
              showFirstButton
              showLastButton
            />
          </>
        )}
      </Card>
    </Grid2>
  );
};

export default AlertsAnalytics;

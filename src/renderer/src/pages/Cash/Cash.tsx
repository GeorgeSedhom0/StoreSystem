import { useCallback, useEffect, useMemo, useState, useContext } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  Grid2,
  Button,
  Card,
  TextField,
  TableCell,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  ButtonGroup,
  Autocomplete,
  FormControlLabel,
  Switch,
  Box,
  Table,
  TableBody,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
  Chip,
  InputAdornment,
  TablePagination,
  Typography,
} from "@mui/material";
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
} from "@mui/icons-material";
import { CashFlow, Party } from "../utils/types";
import LoadingScreen from "../Shared/LoadingScreen";
import dayjs, { Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { DateTimePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { useParams } from "react-router-dom";
import FormatedNumber from "../Shared/FormatedNumber";
import useParties from "../Shared/hooks/useParties";
import { StoreContext } from "@renderer/StoreDataProvider";
import { exportToExcel } from "../Analytics/utils";

const getCashFlow = async (
  startDate: Dayjs,
  endDate: Dayjs,
  partyId: number | null,
  storeId: number,
) => {
  const { data } = await axios.get<CashFlow[]>("/cash-flow", {
    params: {
      start_date: startDate.format("YYYY-MM-DDTHH:mm:ss"),
      end_date: endDate.format("YYYY-MM-DDTHH:mm:ss"),
      party_id: partyId,
      store_id: storeId,
    },
  });
  return data;
};

const Cash = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [amount, setAmount] = useState(0);
  const [moveType, setMoveType] = useState<"in" | "out">("in");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("day"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs().endOf("day"));
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [addingParty, setAddingParty] = useState<boolean>(false);
  const [newParty, setNewParty] = useState<Party>({
    id: null,
    name: "",
    phone: "",
    address: "",
    type: "",
    extra_info: {},
  });
  const [localTotal, setLocalTotal] = useState<boolean>(() => {
    const localTotal = localStorage.getItem("localTotal");
    if (localTotal) {
      return true;
    }
    return false;
  });

  // New state for enhanced table functionality
  const [searchTerm, setSearchTerm] = useState("");
  const [orderBy, setOrderBy] = useState<keyof CashFlow>("time");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { partyId } = useParams();
  const { storeId } = useContext(StoreContext);

  useEffect(() => {
    if (partyId) setSelectedPartyId(parseInt(partyId));
  }, [partyId]);

  useEffect(() => {
    if (localTotal) {
      localStorage.setItem("localTotal", "true");
    } else {
      localStorage.removeItem("localTotal");
    }
  }, [localTotal]);

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

  const { parties, addPartyMutationAsync } = useParties(setMsg);

  const {
    data: rawCashFlow,
    isLoading: isCashFlowLoading,
    refetch: updateCashFlow,
  } = useQuery({
    queryKey: ["cashFlow", startDate, endDate, selectedPartyId],
    queryFn: () => getCashFlow(startDate, endDate, selectedPartyId, storeId),
    initialData: [],
  });

  const cashFlow = useMemo(() => {
    // Process the raw data
    const localCashFlow: CashFlow[] = [];
    if (localTotal) {
      // override the total column to have the first total as 0
      let total = 0;
      for (let i = rawCashFlow.length - 1; i >= 0; i--) {
        const row = rawCashFlow[i];
        total += row.amount;
        localCashFlow.unshift({ ...row, total });
      }
    } else {
      localCashFlow.push(...rawCashFlow);
    }

    return localCashFlow;
  }, [rawCashFlow, localTotal]);

  // Enhanced filtering and sorting logic
  const filteredAndSortedCashFlow = useMemo(() => {
    let filtered = cashFlow.filter((item) => {
      const matchesSearch =
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.party_name &&
          item.party_name.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesSearch;
    });

    // Sort the filtered data
    filtered.sort((a, b) => {
      const aValue = a[orderBy];
      const bValue = b[orderBy];

      if (orderBy === "time") {
        const aTime = new Date(aValue as string).getTime();
        const bTime = new Date(bValue as string).getTime();
        return order === "asc" ? aTime - bTime : bTime - aTime;
      }

      if (orderBy === "amount" || orderBy === "total") {
        const aNum = Number(aValue) || 0;
        const bNum = Number(bValue) || 0;
        return order === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aStr = String(aValue || "").toLowerCase();
      const bStr = String(bValue || "").toLowerCase();
      return order === "asc"
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });

    return filtered;
  }, [cashFlow, searchTerm, orderBy, order]);

  // Statistics calculations
  const statistics = useMemo(() => {
    const totalIn = filteredAndSortedCashFlow
      .filter((item) => item.type === "in")
      .reduce((sum, item) => sum + item.amount, 0);

    const totalOut = filteredAndSortedCashFlow
      .filter((item) => item.type === "out")
      .reduce((sum, item) => sum + item.amount, 0);

    const netFlow = totalIn - totalOut;

    return {
      totalIn,
      totalOut,
      netFlow,
      totalTransactions: filteredAndSortedCashFlow.length,
    };
  }, [filteredAndSortedCashFlow]);

  const loading = isShiftLoading || isCashFlowLoading;

  // Handler functions for enhanced functionality
  const handleSort = (property: keyof CashFlow) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExportToExcel = () => {
    const exportData = [
      ["الوقت", "المبلغ", "نوع الحركة", "الوصف", "المجموع", "الطرف الثاني"],
      ...filteredAndSortedCashFlow.map((item) => [
        new Date(item.time).toLocaleString("ar-EG"),
        item.amount,
        item.type === "in" ? "دخول" : "خروج",
        item.description,
        item.total,
        item.party_name || "بدون طرف ثاني",
      ]),
    ];
    exportToExcel(exportData);
  };

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

  const addCashFlow = async () => {
    try {
      let newPartyId = selectedPartyId;

      if (addingParty) {
        newPartyId = await addPartyMutationAsync(newParty);
        setAddingParty(false);
        setNewParty({
          id: null,
          name: "",
          phone: "",
          address: "",
          type: "",
          extra_info: {},
        });
      }

      await axios.post(
        "/cash-flow",
        {},
        {
          params: {
            amount,
            move_type: moveType,
            description,
            store_id: storeId,
            party_id: newPartyId,
          },
        },
      );
      await updateCashFlow();
      setAmount(0);
      setDescription("");
      setMoveType("in");
      setSelectedPartyId(null);
      setMsg({ type: "success", text: "تمت إضافة سجل التدفق النقدي بنجاح" });
    } catch (error) {
      setMsg({ type: "error", text: "لم تتم الإضافة بنجاح" });
    }
  };
  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={loading} />
      <Grid2 container spacing={3}>
        {/* Statistics Cards - full width, own card */}
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2, mt: 2 }}>
            <Grid2 container spacing={2}>
              <Grid2 size={{ xs: 12, sm: 4 }}>
                <Card
                  sx={{
                    p: 2,
                    textAlign: "center",
                    bgcolor: "success.light",
                    color: "success.contrastText",
                    boxShadow: 2,
                    borderRadius: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <TrendingUpIcon sx={{ fontSize: 32, mb: 1 }} />
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, mb: 0.5, fontSize: "1rem" }}
                  >
                    إجمالي الدخل
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    <FormatedNumber>{statistics.totalIn}</FormatedNumber>
                  </Typography>
                </Card>
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 4 }}>
                <Card
                  sx={{
                    p: 2,
                    textAlign: "center",
                    bgcolor: "error.light",
                    color: "error.contrastText",
                    boxShadow: 2,
                    borderRadius: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <TrendingDownIcon sx={{ fontSize: 32, mb: 1 }} />
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, mb: 0.5, fontSize: "1rem" }}
                  >
                    إجمالي الخروج
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    <FormatedNumber>{statistics.totalOut}</FormatedNumber>
                  </Typography>
                </Card>
              </Grid2>
              <Grid2 size={{ xs: 12, sm: 4 }}>
                <Card
                  sx={{
                    p: 2,
                    textAlign: "center",
                    bgcolor: "primary.light",
                    color: "primary.contrastText",
                    boxShadow: 2,
                    borderRadius: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <AccountBalanceIcon sx={{ fontSize: 32, mb: 1 }} />
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 600, mb: 0.5, fontSize: "1rem" }}
                  >
                    عدد المعاملات
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {statistics.totalTransactions}
                  </Typography>
                </Card>
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>

        {/* Add Cash Flow Form */}
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 3 }}>
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                color: "primary.main",
                fontWeight: 600,
                fontSize: "1.2rem",
              }}
            >
              إضافة حركة نقدية جديدة
            </Typography>
            <Grid2 container spacing={3}>
              <Grid2 container size={12} justifyContent="space-between">
                <Box display="flex" alignItems="center" gap={3}>
                  <TextField
                    label="المبلغ"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    slotProps={{
                      input: {
                        inputMode: "decimal",
                      },
                    }}
                  />
                  <FormControl>
                    <InputLabel>نوع الحركة</InputLabel>
                    <Select
                      label="نوع الحركة"
                      value={moveType}
                      onChange={(e) =>
                        setMoveType(e.target.value as "in" | "out")
                      }
                      sx={{ minWidth: 120 }}
                    >
                      <MenuItem value="in">دخول</MenuItem>
                      <MenuItem value="out">خروج</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="الوصف"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <Button
                    onClick={addCashFlow}
                    disabled={loading}
                    variant="contained"
                    sx={{ minWidth: 120 }}
                  >
                    إضافة تدفق نقدي
                  </Button>
                </Box>
                <FormControlLabel
                  control={
                    <Switch onChange={(e) => setLocalTotal(e.target.checked)} />
                  }
                  checked={localTotal}
                  label="إظهار الإجمالى المحلي"
                />
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
                  options={
                    [
                      {
                        id: null,
                        name: "بدون طرف ثانى",
                        phone: "01xxx",
                        address: "****",
                        type: "****",
                      },
                      {
                        id: null,
                        name: "طرف ثانى جديد",
                        phone: "01xxx",
                        address: "****",
                        type: "****",
                      },
                      ...parties,
                    ] as Party[]
                  }
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
                  onChange={(_, value) => {
                    if (value && value.id) {
                      setSelectedPartyId(value.id);
                      setAddingParty(false);
                    } else {
                      setSelectedPartyId(null);
                      if (value && value.name === "طرف ثانى جديد") {
                        setAddingParty(true);
                      } else {
                        setAddingParty(false);
                      }
                    }
                  }}
                  filterOptions={(options, params) => {
                    const filtered = options.filter(
                      (option) =>
                        option.name.toLowerCase().includes(params.inputValue) ||
                        option.phone.includes(params.inputValue),
                    );
                    return filtered;
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="اسم الطرف الثانى" />
                  )}
                />
              </Grid2>
              {addingParty && (
                <Grid2 container size={12} gap={3}>
                  <TextField
                    label="اسم الطرف الثانى"
                    value={newParty.name}
                    onChange={(e) =>
                      setNewParty({ ...newParty, name: e.target.value })
                    }
                  />
                  <TextField
                    label="رقم الهاتف"
                    value={newParty.phone}
                    onChange={(e) =>
                      setNewParty({ ...newParty, phone: e.target.value })
                    }
                  />
                  <TextField
                    label="العنوان"
                    value={newParty.address}
                    onChange={(e) =>
                      setNewParty({ ...newParty, address: e.target.value })
                    }
                  />
                  <FormControl>
                    <InputLabel>النوع</InputLabel>
                    <Select
                      label="النوع"
                      value={newParty.type}
                      onChange={(e) =>
                        setNewParty({ ...newParty, type: e.target.value })
                      }
                      sx={{ width: 200 }}
                    >
                      <MenuItem value="عميل">عميل</MenuItem>
                      <MenuItem value="مورد">مورد</MenuItem>
                    </Select>
                  </FormControl>
                </Grid2>
              )}
            </Grid2>
          </Card>
        </Grid2>
        {/* Search and Table Section */}
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 2 }}>
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                color: "primary.main",
                fontWeight: 600,
                fontSize: "1.2rem",
              }}
            >
              البحث في جدول التدفقات النقدية
            </Typography>
            <Grid2 container spacing={2} alignItems="center">
              <Grid2 size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  placeholder="البحث في الوصف أو الطرف الثاني..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                      ),
                    },
                  }}
                  size="small"
                />
              </Grid2>
              <Grid2 size={{ xs: 12, md: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportToExcel}
                  fullWidth
                >
                  تصدير Excel
                </Button>
              </Grid2>
            </Grid2>
          </Card>
        </Grid2>

        {/* Enhanced Table */}
        <Grid2 size={12}>
          <Card elevation={3}>
            <TableContainer component={Paper}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "time"}
                        direction={orderBy === "time" ? order : "asc"}
                        onClick={() => handleSort("time")}
                      >
                        الوقت
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "amount"}
                        direction={orderBy === "amount" ? order : "asc"}
                        onClick={() => handleSort("amount")}
                      >
                        المبلغ
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "type"}
                        direction={orderBy === "type" ? order : "asc"}
                        onClick={() => handleSort("type")}
                      >
                        نوع الحركة
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "description"}
                        direction={orderBy === "description" ? order : "asc"}
                        onClick={() => handleSort("description")}
                      >
                        الوصف
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "total"}
                        direction={orderBy === "total" ? order : "asc"}
                        onClick={() => handleSort("total")}
                      >
                        المجموع
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={orderBy === "party_name"}
                        direction={orderBy === "party_name" ? order : "asc"}
                        onClick={() => handleSort("party_name")}
                      >
                        الطرف الثاني
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAndSortedCashFlow
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((row, index) => (
                      <TableRow key={index} hover>
                        <TableCell>
                          {new Date(row.time).toLocaleString("ar-EG", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <FormatedNumber>{row.amount}</FormatedNumber>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.type === "in" ? "دخول" : "خروج"}
                            color={row.type === "in" ? "success" : "error"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell>
                          <FormatedNumber>{row.total}</FormatedNumber>
                        </TableCell>
                        <TableCell>
                          {row.party_name ? row.party_name : "بدون طرف ثاني"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={filteredAndSortedCashFlow.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="عدد الصفوف لكل صفحة:"
              labelDisplayedRows={({ from, to, count }) =>
                `${from}-${to} من ${count}`
              }
            />
          </Card>
        </Grid2>
      </Grid2>
    </>
  );
};

export default Cash;

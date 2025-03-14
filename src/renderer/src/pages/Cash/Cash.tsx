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
} from "@mui/material";
import { CashFlow, Party } from "../../utils/types";
import LoadingScreen from "../Shared/LoadingScreen";
import { TableVirtuoso } from "react-virtuoso";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";
import dayjs, { Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { DateTimePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { useParams } from "react-router-dom";
import FormatedNumber from "../Shared/FormatedNumber";
import useParties from "../Shared/hooks/useParties";
import { StoreContext } from "@renderer/StoreDataProvider";

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
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

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

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    rawCashFlow.forEach((row) => {
      types.add(row.description);
    });
    return Array.from(types);
  }, [rawCashFlow]);

  const cashFlow = useMemo(() => {
    // Step 1: Filter the rawCashFlow based on selectedTypes
    const filteredCashFlow = rawCashFlow.filter((row) =>
      selectedTypes.length > 0 ? selectedTypes.includes(row.description) : true,
    );

    // Step 2: Process the filtered data
    const localCashFlow: CashFlow[] = [];
    if (localTotal) {
      // override the total column to have the first total as 0
      let total = 0;
      for (let i = filteredCashFlow.length - 1; i >= 0; i--) {
        const row = filteredCashFlow[i];
        total += row.amount;
        localCashFlow.unshift({ ...row, total });
      }
    } else {
      localCashFlow.push(...filteredCashFlow);
    }

    return localCashFlow;
  }, [rawCashFlow, localTotal, selectedTypes]);

  const loading = isShiftLoading || isCashFlowLoading;

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
        <Grid2 size={12}>
          <Card elevation={3} sx={{ p: 3 }}>
            <Grid2 container spacing={3}>
              <Grid2 container size={12} justifyContent="space-between">
                <Box display="flex" alignItems="center" gap={3}>
                  <TextField
                    label="المبلغ"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    inputProps={{
                      inputMode: "decimal",
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
                      sx={{
                        minWidth: 120,
                      }}
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
                  <Button onClick={addCashFlow} disabled={loading}>
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

                <Autocomplete
                  multiple
                  options={availableTypes}
                  value={selectedTypes}
                  onChange={(_, value) => setSelectedTypes(value)}
                  renderInput={(params) => (
                    <TextField {...params} label="الأنواع" />
                  )}
                  sx={{
                    minWidth: 250,
                  }}
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
                      sx={{
                        width: 200,
                      }}
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
        <Grid2 size={12}>
          <Card
            elevation={3}
            sx={{
              position: "relative",
              height: 600,
            }}
          >
            <TableVirtuoso
              fixedHeaderContent={fixedHeaderContent}
              components={VirtuosoTableComponents}
              data={cashFlow}
              itemContent={(_, row) => (
                <>
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
                  <TableCell>{row.type === "in" ? "دخول" : "خروج"}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>
                    <FormatedNumber>{row.total}</FormatedNumber>
                  </TableCell>
                  <TableCell>
                    {row.party_name ? row.party_name : "بدون طرف ثانى"}
                  </TableCell>
                </>
              )}
            />
          </Card>
        </Grid2>
      </Grid2>
    </>
  );
};

export default Cash;

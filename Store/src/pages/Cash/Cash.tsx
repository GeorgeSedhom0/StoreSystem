import { useCallback, useState } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import {
  Grid,
  Button,
  Card,
  TextField,
  TableCell,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  ButtonGroup,
} from "@mui/material";
import { CashFlow } from "../../utils/types";
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

const getCashFlow = async (startDate: Dayjs, endDate: Dayjs) => {
  const { data } = await axios.get<CashFlow[]>(
    "http://localhost:8000/cash-flow",
    {
      params: {
        start_date: startDate.format("YYYY-MM-DDTHH:mm:ss"),
        end_date: endDate.format("YYYY-MM-DDTHH:mm:ss"),
      },
    }
  );
  return data;
};

const Cash = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [amount, setAmount] = useState(0);
  const [moveType, setMoveType] = useState<"in" | "out">("in");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().startOf("day"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs().endOf("day"));

  const { data: lastShift, isLoading: isShiftLoading } = useQuery({
    queryKey: ["lastShift"],
    queryFn: async () => {
      const { data } = await axios.get("http://localhost:8000/last-shift");
      return data;
    },
  });

  const {
    data: cashFlow,
    isLoading: isCashFlowLoading,
    refetch: updateCashFlow,
  } = useQuery({
    queryKey: ["cashFlow", startDate, endDate],
    queryFn: () => getCashFlow(startDate, endDate),
    initialData: [],
  });

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
    [lastShift]
  );

  const addCashFlow = async () => {
    try {
      await axios.post(
        "http://localhost:8000/cash-flow",
        {},
        {
          params: {
            amount,
            move_type: moveType,
            description,
          },
        }
      );
      await updateCashFlow();
      setMsg({ type: "success", text: "تمت إضافة سجل التدفق النقدي بنجاح" });
    } catch (error) {
      setMsg({ type: "error", text: "لم تتم الإضافة بنجاح" });
    }
  };

  return (
    <>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={loading} />
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card elevation={3} sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid item container xs={12} alignItems="center" gap={3}>
                <TextField
                  label="المبلغ"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
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
              </Grid>

              <Grid item container gap={3} xs={12}>
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
              </Grid>

              <Grid item xs={12}>
                <ButtonGroup>
                  <Button onClick={() => setRange("shift")}>اخر شيفت</Button>
                  <Button onClick={() => setRange("day")}>اليوم</Button>
                  <Button onClick={() => setRange("week")}>هذا الاسبوع</Button>
                  <Button onClick={() => setRange("month")}>هذا الشهر</Button>
                </ButtonGroup>
              </Grid>
            </Grid>
          </Card>
        </Grid>
        <Grid item xs={12}>
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
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>{row.type === "in" ? "دخول" : "خروج"}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>{row.total}</TableCell>
                </>
              )}
            />
          </Card>
        </Grid>
      </Grid>
    </>
  );
};

export default Cash;

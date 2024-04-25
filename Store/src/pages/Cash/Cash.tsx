import { useEffect, useState } from "react";
import axios from "axios";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import { ViewContainer } from "../Shared/Utils";
import {
  Grid,
  Button,
  Card,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
} from "@mui/material";
import { CashFlow } from "../../utils/types";
import LoadingScreen from "../Shared/LoadingScreen";

const Cash = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
  const [amount, setAmount] = useState(0);
  const [moveType, setMoveType] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const getCashFlow = async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:8000/cash-flow");
      setCashFlow(response.data);
    } catch (error) {
      setMsg({ type: "error", text: "حدث خطأ ما" });
    }
    setLoading(false);
  };

  useEffect(() => {
    getCashFlow();
  }, []);

  const addCashFlow = async () => {
    setLoading(true);
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
      setMsg({ type: "success", text: "تمت إضافة سجل التدفق النقدي بنجاح" });
      getCashFlow();
    } catch (error) {
      setMsg({ type: "error", text: "لم تتم الإضافة بنجاح" });
    }
    setLoading(false);
  };

  return (
    <ViewContainer>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={loading} />
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card elevation={3} sx={{ p: 3 }}>
            <Grid container alignItems="center" gap={3}>
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
                  onChange={(e) => setMoveType(e.target.value)}
                  sx={{
                    minWidth: 120,
                  }}
                >
                  <MenuItem value="دخول">دخول</MenuItem>
                  <MenuItem value="خروج">خروج</MenuItem>
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
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card elevation={3} sx={{ p: 3 }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>الوقت</TableCell>
                    <TableCell>المبلغ</TableCell>
                    <TableCell>النوع</TableCell>
                    <TableCell>الوصف</TableCell>
                    <TableCell>المجموع</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cashFlow.map((row) => (
                    <TableRow key={row.time}>
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
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>{row.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>
    </ViewContainer>
  );
};

export default Cash;

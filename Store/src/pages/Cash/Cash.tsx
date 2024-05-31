import { useEffect, useState } from "react";
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
} from "@mui/material";
import { CashFlow } from "../../utils/types";
import LoadingScreen from "../Shared/LoadingScreen";
import { TableVirtuoso } from "react-virtuoso";
import {
  fixedHeaderContent,
  VirtuosoTableComponents,
} from "./Components/VirtualTableHelpers";

const Cash = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
  const [amount, setAmount] = useState(0);
  const [moveType, setMoveType] = useState<"in" | "out">("in");
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
    <>
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
                  onChange={(e) => setMoveType(e.target.value as "in" | "out")}
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

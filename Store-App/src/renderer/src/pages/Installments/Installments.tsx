import {
  Button,
  Card,
  CardActions,
  CardContent,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import LoadingScreen from "../Shared/LoadingScreen";
import { useState } from "react";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import PayInstallment from "./Components/PayInstallment";

export interface Installment {
  id: number;
  paid: number;
  time: string;
  installments_count: number;
  installment_interval: number;
  party_name: string;
  flow: {
    id: number;
    amount: number;
    time: string;
  }[];
  total: number;
  products: {
    id: number;
    name: string;
    price: number;
    amount: number;
  }[];
  ended: boolean;
}
const getInstallments = async () => {
  const { data } = await axios.get<Installment[]>(
    import.meta.env.VITE_SERVER_URL + "/installments",
  );
  return data;
};

const Installments = () => {
  const [msg, setMsg] = useState<AlertMsg>({
    type: "",
    text: "",
  });
  const [showEnded, setShowEnded] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(
    null,
  );

  const { data, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ["installments"],
    queryFn: getInstallments,
    initialData: [],
    // filter nulls in the flow array
    select: (data: Installment[]) => {
      return data
        .map((installment) => ({
          ...installment,
          flow: installment.flow.filter((flow) => flow.id),
        }))
        .filter((installment) => {
          return showEnded ? true : !installment.ended;
        });
    },
  });

  return (
    <>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card elevation={3} sx={{ px: 3, py: 2, position: "relative" }}>
            <LoadingScreen loading={isFetching && isPlaceholderData} />
            <AlertMessage message={msg} setMessage={setMsg} />
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h4">الاقساط</Typography>
                <Typography variant="body1">
                  قم بالتحكم في الاقساط الخاصة بالمتجر
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    setShowEnded((prev) => !prev);
                  }}
                >
                  {showEnded
                    ? "اخفاء الاقساط المنتهية"
                    : "عرض الاقساط المنتهية"}
                </Button>
              </Grid>
              <Grid
                item
                container
                gap={3}
                xs={12}
                sx={{
                  maxHeight: "80vh",
                  overflowY: "auto",
                }}
              >
                {data.length === 0 && (
                  <Typography variant="body1">لا يوجد اقساط</Typography>
                )}
                {selectedInstallment ? (
                  <PayInstallment
                    selectedInstallment={
                      data.find(
                        (installment) => installment.id === selectedInstallment,
                      )!
                    }
                    setSelectedInstallment={setSelectedInstallment}
                    setMsg={setMsg}
                    refetchInstallments={refetch}
                  />
                ) : (
                  data.map((installment) => (
                    <Grid item xs={12}>
                      <Card elevation={3}>
                        <CardContent>
                          <Typography variant="h4">
                            قسط لـ {installment.party_name || "غير معروف"}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            اجمالى الفاتورة: {installment.total * -1}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            المقدم: {installment.paid}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            المدفوع حتى الان:{" "}
                            {installment.flow.reduce((acc, flow) => {
                              return acc + flow.amount;
                            }, 0) + installment.paid}
                          </Typography>
                          <Typography variant="body1" gutterBottom>
                            المتبقي:{" "}
                            {installment.total * -1 -
                              installment.paid -
                              installment.flow.reduce((acc, flow) => {
                                return acc + flow.amount;
                              }, 0)}
                          </Typography>
                          <Typography variant="h6" gutterBottom>
                            سجل الاقساط المدفوعة:
                          </Typography>
                          <TableContainer component={Paper}>
                            <Table>
                              <TableHead>
                                <TableRow>
                                  <TableCell>المبلغ</TableCell>
                                  <TableCell>الوقت</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {installment.flow.map((flow) => (
                                  <TableRow key={flow.id}>
                                    <TableCell>{flow.amount}</TableCell>
                                    <TableCell>
                                      {new Date(flow.time).toLocaleString(
                                        "ar-EG",
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </CardContent>
                        <CardActions>
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={() => {
                              setSelectedInstallment(installment.id);
                            }}
                          >
                            دفع
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))
                )}
              </Grid>
            </Grid>
          </Card>
        </Grid>
      </Grid>
    </>
  );
};

export default Installments;

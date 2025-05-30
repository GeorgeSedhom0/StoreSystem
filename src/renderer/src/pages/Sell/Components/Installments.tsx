import { Grid2, TextField, Typography } from "@mui/material";

const Installments = ({
  installments,
  setInstallments,
  installmentInterval,
  setInstallmentInterval,
  paid,
  setPaid,
  shoppingCart,
  discount,
}: {
  installments: number;
  setInstallments: React.Dispatch<React.SetStateAction<number>>;
  installmentInterval: number;
  setInstallmentInterval: React.Dispatch<React.SetStateAction<number>>;
  paid: number;
  setPaid: React.Dispatch<React.SetStateAction<number>>;
  shoppingCart: any[];
  discount: number;
}) => {
  return (
    <>
      <Grid2 container size={12} gap={3}>
        <TextField
          label="عدد الاقساط"
          type="number"
          value={installments}
          onChange={(e) => setInstallments(parseInt(e.target.value) || 1)}
          size="small"
        />
        <TextField
          label="الفترة بين الاقساط"
          type="number"
          value={installmentInterval}
          onChange={(e) =>
            setInstallmentInterval(parseInt(e.target.value) || 30)
          }
          size="small"
        />
        <TextField
          label="المقدم"
          type="number"
          value={paid}
          onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
          size="small"
          slotProps={{
            input: {
              inputMode: "decimal",
            },
          }}
        />
      </Grid2>
      <Grid2 size={12}>
        <Typography variant="h6">
          المتبقي:{" "}
          {shoppingCart.reduce(
            (acc, item) => acc + item.price * item.quantity,
            0,
          ) -
            discount -
            paid}{" "}
          جنيه
        </Typography>
        <Typography variant="h6">
          قيمة القسط:{" "}
          {shoppingCart.reduce(
            (acc, item) => acc + item.price * item.quantity,
            0,
          ) -
            discount -
            paid}{" "}
          / {installments} ={" "}
          {(shoppingCart.reduce(
            (acc, item) => acc + item.price * item.quantity,
            0,
          ) -
            discount -
            paid) /
            installments}{" "}
          جنيه
        </Typography>
      </Grid2>
    </>
  );
};

export default Installments;

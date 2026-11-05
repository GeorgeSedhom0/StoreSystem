import { Grid2, Typography } from "@mui/material";
import NumberField from "../../Shared/NumberField";

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

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
  const remaining =
    shoppingCart.reduce((acc, item) => acc + item.price * item.quantity, 0) -
    discount -
    paid;

  return (
    <>
      <Grid2 container size={12} spacing={2}>
        <Grid2 size={{ xs: 6, sm: 4 }}>
          <NumberField
            fullWidth
            label="عدد الأقساط"
            value={installments}
            onValueChange={setInstallments}
            integer
            min={1}
            size="small"
          />
        </Grid2>
        <Grid2 size={{ xs: 6, sm: 4 }}>
          <NumberField
            fullWidth
            label="الفترة بين الأقساط (يوم)"
            value={installmentInterval}
            onValueChange={setInstallmentInterval}
            integer
            min={1}
            size="small"
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 4 }}>
          <NumberField
            fullWidth
            label="المقدم"
            value={paid}
            onValueChange={setPaid}
            min={0}
            size="small"
          />
        </Grid2>
      </Grid2>
      <Grid2 size={12}>
        <Typography
          variant="h6"
          sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}
        >
          المتبقي: {fmt(remaining)} جنيه
        </Typography>
        <Typography
          variant="h6"
          sx={{ fontSize: { xs: "1rem", sm: "1.25rem" } }}
        >
          قيمة القسط: {fmt(remaining)} / {installments || "-"} ={" "}
          {installments > 0 ? fmt(remaining / installments) : "-"} جنيه
        </Typography>
      </Grid2>
    </>
  );
};

export default Installments;

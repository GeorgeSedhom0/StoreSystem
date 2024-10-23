const formatNumber = (value: number) => {
  if (Number.isInteger(value)) {
    return value;
  } else {
    return value.toFixed(2);
  }
};

const FormatedNumber = ({
  value,
  money,
}: {
  value: number;
  money?: boolean;
}) => {
  let formatedValue = formatNumber(value);
  if (money) {
    formatedValue = Intl.NumberFormat("ar-eg", {
      style: "currency",
      currency: "EGP",
    }).format(value);
  }
  return <span>{formatedValue}</span>;
};

export default FormatedNumber;

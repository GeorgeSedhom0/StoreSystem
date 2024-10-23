const formatNumber = (value: number) => {
  if (Number.isInteger(value)) {
    return value;
  } else {
    return value.toFixed(2);
  }
};

const FormatedNumber = ({
  children,
  money,
}: {
  children: number;
  money?: boolean;
}) => {
  let formatedValue = formatNumber(children);
  if (money) {
    formatedValue = Intl.NumberFormat("ar-eg", {
      style: "currency",
      currency: "EGP",
    }).format(children);
  }
  return <span>{formatedValue}</span>;
};

export default FormatedNumber;

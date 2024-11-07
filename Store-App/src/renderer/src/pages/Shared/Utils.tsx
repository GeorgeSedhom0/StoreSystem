import { Fab, styled } from "@mui/material";

export const ViewContainer = styled("div")(({ theme }) => ({
  margin: "30px",
  [theme.breakpoints.down("sm")]: {
    margin: "16px",
  },
  width: "98vw",
}));

export const ContentBox = styled("div")(({}) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
}));

export const Title = styled("span")(() => ({
  fontSize: ".85rem",
  fontWeight: "600",
  color: "#555",
  textTransform: "capitalize",
}));

export const SubTitle = styled("span")(({ theme }) => ({
  fontSize: "0.85rem",
  color: theme.palette.text.secondary,
  marginLeft: "5px",
}));

export const StatusCardSubTitle = styled("span")(({ theme }) => ({
  fontSize: "0.75rem",
  color: theme.palette.text.secondary,
  marginLeft: "5px",
}));

export const FabIcon = styled(Fab)(() => ({
  width: "44px !important",
  height: "44px !important",
  boxShadow: "none !important",
  zIndex: "0",
}));

export const H1 = styled("h1")(({ theme }) => ({
  fontSize: "1.2rem",
  margin: 0,
  flexGrow: 1,
  color: theme.palette.text.secondary,
}));

export const H2 = styled("h2")(({ theme }) => ({
  margin: 0,
  fontWeight: "500",
  color: theme.palette.text.secondary,
}));

export const StatusCardTitle = styled("h3")(({}) => ({
  margin: 0,
  fontWeight: "500",
  marginLeft: "12px",
}));

export const H4 = styled("h4")(({ theme }) => ({
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "16px",
  textTransform: "capitalize",
  lineHeight: "45px",
  color: theme.palette.text.secondary,
}));

export interface Profile {
  user: { name: string; pages: string[]; paths: string[] };
  store: {
    name: string;
    address: string;
    phone: string;
    extra_info: { [key: string]: string };
  };
}

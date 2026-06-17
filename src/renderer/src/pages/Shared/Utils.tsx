import { Fab, styled } from "@mui/material";

export const ViewContainer = styled("div")(({ theme }) => ({
  // A DEFINITE viewport-based width (not auto) is essential: it anchors the
  // layout so inner horizontal-scroll containers (e.g. wide tables in
  // TableContainer) actually scroll instead of stretching the whole page and
  // causing horizontal overflow on phones. width:100vw + box-sizing + LEFT/RIGHT
  // padding keeps the total width exactly 100vw (body overflow:hidden clips the
  // desktop scrollbar gutter). The horizontal inset uses padding; the vertical
  // spacing uses margin (margins don't affect width) — these vertical margins
  // are also counted in Layout's `100vh - …140px` height calc, so removing them
  // would leave vertical slack that the body's centering shows as a top gap.
  width: "100vw",
  boxSizing: "border-box",
  marginTop: "30px",
  marginBottom: "30px",
  paddingLeft: "30px",
  paddingRight: "30px",
  [theme.breakpoints.down("sm")]: {
    marginTop: "16px",
    marginBottom: "16px",
    paddingLeft: "16px",
    paddingRight: "16px",
  },
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

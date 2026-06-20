import { Card, Box, Typography } from "@mui/material";
import { ReactNode } from "react";

type StatColor =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info";

/** Compact horizontal stat tile (icon on the side, label + value stacked).
 * Replaces the older tall, centered stat cards so summary strips take far less
 * vertical space across Bills / BillsAdmin / Cash. */
const StatCard = ({
  icon,
  label,
  value,
  color = "primary",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  color?: StatColor;
}) => (
  <Card
    sx={{
      p: 1.25,
      display: "flex",
      alignItems: "center",
      gap: 1.25,
      bgcolor: `${color}.light`,
      color: `${color}.contrastText`,
      borderRadius: 2,
      boxShadow: 1,
      height: "100%",
    }}
  >
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        "& svg": { fontSize: 30, opacity: 0.9 },
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, display: "block", lineHeight: 1.25, opacity: 0.95 }}
      >
        {label}
      </Typography>
      <Typography
        variant="h6"
        noWrap
        sx={{ fontWeight: 700, lineHeight: 1.2 }}
      >
        {value}
      </Typography>
    </Box>
  </Card>
);

export default StatCard;

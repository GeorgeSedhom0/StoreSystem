import { Card, Box, Typography, Tooltip } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
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
  info,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  color?: StatColor;
  /** Optional explanation of exactly what this number includes/excludes. */
  info?: string;
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
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, lineHeight: 1.25, opacity: 0.95 }}
        >
          {label}
        </Typography>
        {info && (
          <Tooltip title={info} enterTouchDelay={0} arrow>
            <InfoOutlinedIcon sx={{ fontSize: 14, opacity: 0.8, cursor: "help" }} />
          </Tooltip>
        )}
      </Box>
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

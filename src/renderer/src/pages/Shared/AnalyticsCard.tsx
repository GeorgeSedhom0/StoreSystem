import { Card, Typography, Box, Skeleton, Tooltip } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import React from "react";

interface AnalyticsCardProps {
  title: string;
  value: number | string;
  color?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  /** Optional explanation of exactly what this number includes/excludes.
   * Shown as an info icon next to the title with a tooltip on hover/tap. */
  info?: string;
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  value,
  color = "primary.main",
  icon,
  loading = false,
  info,
}) => {
  return (
    <Card
      elevation={3}
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {title}
        </Typography>
        {info && (
          <Tooltip title={info} enterTouchDelay={0} arrow>
            <InfoOutlinedIcon
              sx={{
                fontSize: 16,
                color: "text.disabled",
                cursor: "help",
              }}
            />
          </Tooltip>
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", mt: 2 }}>
        {icon && <Box sx={{ mr: 1 }}>{icon}</Box>}
        {loading ? (
          <Skeleton variant="text" width={"80%"} height={40} />
        ) : (
          <Typography variant="h6" color={color} sx={{ fontWeight: "bold" }}>
            {value}
          </Typography>
        )}
      </Box>
    </Card>
  );
};

export default AnalyticsCard;

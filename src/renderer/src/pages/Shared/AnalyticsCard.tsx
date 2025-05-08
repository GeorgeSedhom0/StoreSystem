import { Card, Typography, Box, Skeleton } from "@mui/material";
import React from "react";

interface AnalyticsCardProps {
  title: string;
  value: number | string;
  color?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  value,
  color = "primary.main",
  icon,
  loading = false,
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
      <Typography variant="subtitle2" color="text.secondary">
        {title}
      </Typography>
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

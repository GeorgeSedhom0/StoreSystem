import { Box, ButtonBase, Typography, alpha } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import TimelapseIcon from "@mui/icons-material/Timelapse";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import { ReactNode } from "react";
import { AttendanceStatus } from "../types";
import { STATUS_META, STATUS_ORDER } from "../utils";

const ICONS: Record<AttendanceStatus, ReactNode> = {
  present: <CheckCircleOutlineIcon />,
  absent: <HighlightOffIcon />,
  half: <TimelapseIcon />,
  leave: <BeachAccessOutlinedIcon />,
};

/** Four big status toggles. Tapping the selected one clears it unless
 * ``allowDeselect`` is false (instant-save rows, where a double tap must not
 * undo the mark). */
const StatusButtons = ({
  value,
  onChange,
  disabled,
  dense,
  allowDeselect = true,
}: {
  value: AttendanceStatus | null;
  onChange: (s: AttendanceStatus | null) => void;
  disabled?: boolean;
  dense?: boolean;
  allowDeselect?: boolean;
}) => (
  <Box
    role="radiogroup"
    sx={{
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 0.75,
    }}
  >
    {STATUS_ORDER.map((s) => {
      const meta = STATUS_META[s];
      const selected = value === s;
      return (
        <ButtonBase
          key={s}
          role="radio"
          aria-checked={selected}
          aria-label={meta.label}
          disabled={disabled}
          onClick={() => {
            if (!selected) onChange(s);
            else if (allowDeselect) onChange(null);
          }}
          sx={(t) => {
            const c = t.palette[meta.color].main;
            return {
              minHeight: dense ? 44 : 52,
              borderRadius: 2,
              border: `1.5px solid ${selected ? c : alpha(c, 0.35)}`,
              bgcolor: selected ? c : alpha(c, 0.04),
              color: selected ? t.palette[meta.color].contrastText : c,
              display: "flex",
              flexDirection: dense ? "row" : "column",
              gap: dense ? 0.5 : 0.25,
              px: 0.5,
              py: 0.5,
              transition: "background-color 120ms, color 120ms",
              opacity: disabled ? 0.5 : 1,
              "& svg": { fontSize: dense ? 18 : 22 },
              "&:hover": {
                bgcolor: selected ? c : alpha(c, 0.12),
              },
              "&.Mui-focusVisible": { outline: `2px solid ${c}` },
            };
          }}
        >
          {ICONS[s]}
          <Typography
            component="span"
            sx={{
              fontSize: dense ? 13 : 13.5,
              fontWeight: selected ? 700 : 500,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {meta.label}
          </Typography>
        </ButtonBase>
      );
    })}
  </Box>
);

export default StatusButtons;

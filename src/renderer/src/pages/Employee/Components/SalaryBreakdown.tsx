import { Box, Divider, Stack, Typography, alpha } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { SalaryLine } from "../types";
import { arDigits, fmtMoney } from "../utils";

const kindColor = (kind: SalaryLine["kind"]) =>
  kind === "deduction"
    ? "error.main"
    : kind === "bonus"
      ? "success.main"
      : "text.primary";

/** The Arabic lines returned by salary-preview (or stored in salaries.details),
 * money lines first, then informational notes, then optional totals. */
const SalaryBreakdown = ({
  lines,
  totals,
}: {
  lines: SalaryLine[];
  totals?: { amount: number; bonus: number; deductions: number; net: number };
}) => {
  const money = lines.filter((l) => l.amount !== null);
  const notes = lines.filter((l) => l.amount === null);
  return (
    <Box>
      <Stack divider={<Divider flexItem />} spacing={0.75}>
        {money.map((l, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {arDigits(l.label)}
              </Typography>
              {l.detail && (
                <Typography variant="caption" color="text.secondary">
                  {arDigits(l.detail)}
                </Typography>
              )}
            </Box>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: kindColor(l.kind),
                whiteSpace: "nowrap",
              }}
            >
              {fmtMoney(l.amount)}
            </Typography>
          </Box>
        ))}
      </Stack>

      {notes.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: money.length ? 1.25 : 0 }}>
          {notes.map((l, i) => (
            <Box
              key={i}
              sx={{
                display: "flex",
                gap: 0.75,
                alignItems: "flex-start",
                color: l.kind === "warning" ? "warning.main" : "text.secondary",
              }}
            >
              {l.kind === "warning" ? (
                <WarningAmberIcon sx={{ fontSize: 18, mt: "2px" }} />
              ) : (
                <InfoOutlinedIcon sx={{ fontSize: 18, mt: "2px" }} />
              )}
              <Typography variant="caption" sx={{ lineHeight: 1.6 }}>
                {arDigits(l.label)}
                {l.detail ? ` — ${arDigits(l.detail)}` : ""}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}

      {totals && (
        <Box
          sx={(t) => ({
            mt: 1.5,
            p: 1.25,
            borderRadius: 2,
            bgcolor: alpha(t.palette.primary.main, 0.08),
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
          })}
        >
          <Typography variant="subtitle2">الصافي</Typography>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, color: "primary.main" }}
          >
            {fmtMoney(totals.net)}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SalaryBreakdown;

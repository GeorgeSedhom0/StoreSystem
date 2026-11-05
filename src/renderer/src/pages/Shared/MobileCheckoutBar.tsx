import { Box, Button, Paper, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { ReactNode } from "react";

const fmt = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "-";

/** Phone-only bottom bar of the POS pages: the total and the save actions
 * stay under the thumb while the cart scrolls. Render a <MobileBarSpacer />
 * at the end of the page so the last content isn't hidden behind it. */
const MobileCheckoutBar = ({
  total,
  count,
  onSave,
  onSavePrint,
  disabled,
  saveLabel = "حفظ",
  caption,
}: {
  total: number;
  count: number;
  onSave: () => void;
  onSavePrint?: () => void;
  disabled?: boolean;
  saveLabel?: string;
  caption?: ReactNode;
}) => (
  <Paper
    elevation={10}
    sx={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: (t) => t.zIndex.appBar,
      px: 2,
      pt: 1.25,
      pb: "calc(10px + env(safe-area-inset-bottom))",
      display: "flex",
      alignItems: "center",
      gap: 1,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        component="div"
        noWrap
      >
        {caption ?? `${count} صنف`}
      </Typography>
      <Typography
        sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}
        noWrap
      >
        {fmt(total)}
      </Typography>
    </Box>
    {onSavePrint && (
      <Button
        variant="outlined"
        onClick={onSavePrint}
        disabled={disabled}
        sx={{ minWidth: 0, px: 1.5, height: 48 }}
        aria-label="حفظ وطباعة"
      >
        <PrintIcon />
      </Button>
    )}
    <Button
      variant="contained"
      onClick={onSave}
      disabled={disabled}
      sx={{ height: 48, px: 3, fontSize: 16, fontWeight: 700 }}
    >
      {saveLabel}
    </Button>
  </Paper>
);

export const MobileBarSpacer = () => <Box sx={{ height: 88, width: "100%" }} />;

export default MobileCheckoutBar;

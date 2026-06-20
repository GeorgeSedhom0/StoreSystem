import { Button, Menu, MenuItem, ListItemText } from "@mui/material";
import {
  PictureAsPdf as PictureAsPdfIcon,
  ArrowDropDown as ArrowDropDownIcon,
} from "@mui/icons-material";
import { useState } from "react";

/** A single "تصدير PDF" button that opens a menu to pick summary vs. detailed.
 * Shared by Bills and BillsAdmin so the control looks identical on both. */
const ExportPdfMenu = ({
  onExport,
  size = "medium",
}: {
  onExport: (mode: "summary" | "full") => void;
  size?: "small" | "medium" | "large";
}) => {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const pick = (mode: "summary" | "full") => {
    setAnchor(null);
    onExport(mode);
  };
  return (
    <>
      <Button
        variant="outlined"
        size={size}
        startIcon={<PictureAsPdfIcon />}
        endIcon={<ArrowDropDownIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        تصدير PDF
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        <MenuItem onClick={() => pick("summary")}>
          <ListItemText primary="ملخص" secondary="صف واحد لكل فاتورة" />
        </MenuItem>
        <MenuItem onClick={() => pick("full")}>
          <ListItemText primary="تفصيلي" secondary="مع تفاصيل المنتجات" />
        </MenuItem>
      </Menu>
    </>
  );
};

export default ExportPdfMenu;

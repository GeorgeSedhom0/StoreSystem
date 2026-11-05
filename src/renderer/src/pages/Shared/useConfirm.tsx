import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { ReactNode, useCallback, useRef, useState } from "react";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button for destructive / money-moving actions. */
  danger?: boolean;
}

/**
 * Promise-based confirmation dialog:
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: "حذف المنتج؟", danger: true }))) return;
 *   ...
 *   return <>{confirmDialog}...</>;
 */
const useConfirm = (): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] => {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = (
    <Dialog open={!!opts} onClose={() => close(false)} maxWidth="xs" fullWidth>
      {opts && (
        <>
          <DialogTitle>{opts.title}</DialogTitle>
          {opts.message && (
            <DialogContent>
              {typeof opts.message === "string" ? (
                <DialogContentText>{opts.message}</DialogContentText>
              ) : (
                opts.message
              )}
            </DialogContent>
          )}
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => close(false)}>
              {opts.cancelText ?? "إلغاء"}
            </Button>
            <Button
              variant="contained"
              color={opts.danger ? "error" : "primary"}
              onClick={() => close(true)}
              autoFocus
            >
              {opts.confirmText ?? "تأكيد"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );

  return [confirm, dialog];
};

export default useConfirm;

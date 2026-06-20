import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Payments as PaymentsIcon,
  CallSplit as CallSplitIcon,
} from "@mui/icons-material";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { PaymentMethod } from "./../utils/types";

/** One line of the payment split: a method and the amount assigned to it. */
export interface PaymentLineState {
  method_id: number;
  amount: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Build the payments array to send with a bill. Lines with a zero amount are
 * dropped. Falls back to 100% of the default method when nothing is set.
 */
export const buildPayments = (
  total: number,
  methods: PaymentMethod[],
  lines: PaymentLineState[],
): { method_id: number; name: string; amount: number }[] | null => {
  const defaultMethod = methods[0];
  if (!defaultMethod) return null;

  const out = lines
    .filter((l) => l.amount > 0.001)
    .map((l) => {
      const m = methods.find((x) => x.id === l.method_id);
      return m
        ? { method_id: m.id, name: m.name, amount: round2(l.amount) }
        : null;
    })
    .filter(Boolean) as { method_id: number; name: string; amount: number }[];

  if (out.length === 0) {
    return [
      {
        method_id: defaultMethod.id,
        name: defaultMethod.name,
        amount: round2(total),
      },
    ];
  }
  return out;
};

/** Donor order when an amount needs to be pulled from other lines:
 * the lines holding the most money first. */
const orderedDonors = (lines: PaymentLineState[], editedId: number) =>
  lines
    .filter((l) => l.method_id !== editedId)
    .sort((a, b) => b.amount - a.amount);

/** Ensure the default line exists, drop deleted methods, and make the sum equal
 * the total by letting the default (cash) line absorb the difference. */
const normalize = (
  prev: PaymentLineState[],
  total: number,
  methods: PaymentMethod[],
): PaymentLineState[] => {
  const defaultId = methods[0].id;
  const validIds = new Set(methods.map((m) => m.id));

  let lines = prev
    .filter((l) => validIds.has(l.method_id))
    .map((l) => ({ ...l }));

  if (!lines.some((l) => l.method_id === defaultId)) {
    lines = [{ method_id: defaultId, amount: 0 }, ...lines];
  }

  const sum = lines.reduce((acc, l) => acc + l.amount, 0);
  const diff = round2(total - sum);

  if (Math.abs(diff) > 0.001) {
    const def = lines.find((l) => l.method_id === defaultId)!;
    const newDef = round2(def.amount + diff);
    if (newDef >= -0.001) {
      def.amount = Math.max(0, newDef);
    } else {
      // default can't absorb a large reduction; pull the rest from largest lines
      def.amount = 0;
      let deficit = -newDef;
      for (const d of orderedDonors(lines, defaultId)) {
        if (deficit <= 0.001) break;
        const take = Math.min(d.amount, deficit);
        d.amount = round2(d.amount - take);
        deficit = round2(deficit - take);
      }
    }
  }

  return lines.map((l) => ({ ...l, amount: round2(Math.max(0, l.amount)) }));
};

interface PaymentSplitProps {
  total: number;
  methods: PaymentMethod[];
  lines: PaymentLineState[];
  setLines: Dispatch<SetStateAction<PaymentLineState[]>>;
  /** When set, methods homed at a different store are labelled as off-store. */
  currentStoreId?: number;
  /** Tighter spacing + no helper caption, for the compact POS layout. */
  dense?: boolean;
}

const PaymentSplit = ({
  total,
  methods,
  lines,
  setLines,
  currentStoreId,
  dense = false,
}: PaymentSplitProps) => {
  const methodLabel = (m: PaymentMethod) =>
    m.home_store_id != null && m.home_store_id !== currentStoreId
      ? `${m.name} — متجر آخر`
      : m.name;

  // In-progress text per method id, so "50%" and partial entries can be typed.
  const [rawInputs, setRawInputs] = useState<Record<number, string>>({});
  const defaultMethod = methods[0];

  // Keep the default line present and the sum balanced to the total.
  useEffect(() => {
    if (!defaultMethod) return;
    setLines((prev) => normalize(prev, total, methods));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, methods]);

  // Render from a balanced view of the lines. The effect above re-balances
  // `lines` one tick after `total` changes (e.g. a product is added/removed),
  // and for that single frame the raw `lines` sum no longer matches the new
  // total — which used to flash the warning border/“remaining” text red. By
  // deriving what we display from `normalize(lines, total, methods)` every
  // render, the displayed split is always consistent with the current total
  // and the flicker is gone. Editing still mutates the real `lines` state.
  const balancedLines = useMemo(
    () => (defaultMethod ? normalize(lines, total, methods) : lines),
    [lines, total, methods, defaultMethod],
  );

  if (!defaultMethod) return null;

  const defaultId = defaultMethod.id;
  const sum = balancedLines.reduce((acc, l) => acc + l.amount, 0);
  const remaining = round2(total - sum);

  const usedIds = new Set(balancedLines.map((l) => l.method_id));
  const availableMethods = methods.filter(
    (m) => m.id !== defaultId && !usedIds.has(m.id),
  );

  /** Set a line's amount, auto-rebalancing the rest so the sum stays = total.
   * Added money is pulled from the line(s) currently holding the most. */
  const applyEdit = (editedId: number, rawAmount: number) => {
    setLines((prev) => {
      const next = prev.map((l) => ({ ...l }));
      const edited = next.find((l) => l.method_id === editedId);
      if (!edited) return prev;

      const target = Math.max(0, Math.min(total, round2(rawAmount)));
      const delta = round2(target - edited.amount);
      edited.amount = target;
      if (Math.abs(delta) < 0.001) return next;

      if (delta > 0) {
        // Take `delta` from the largest other line(s)
        let remainingToTake = delta;
        for (const d of orderedDonors(next, editedId)) {
          if (remainingToTake <= 0.001) break;
          const take = Math.min(d.amount, remainingToTake);
          d.amount = round2(d.amount - take);
          remainingToTake = round2(remainingToTake - take);
        }
        // Couldn't fully cover (others were all 0): clamp the edited line down
        if (remainingToTake > 0.001) {
          edited.amount = round2(edited.amount - remainingToTake);
        }
      } else {
        // Give the freed amount back to cash (or the largest line if cash was edited)
        const giveBack = -delta;
        const sink =
          editedId !== defaultId
            ? next.find((l) => l.method_id === defaultId)
            : orderedDonors(next, editedId)[0];
        if (sink) sink.amount = round2(sink.amount + giveBack);
      }

      return next.map((l) => ({ ...l, amount: round2(Math.max(0, l.amount)) }));
    });
  };

  /** Parse a field value: a trailing "%" means percent-of-total. */
  const parseAmount = (value: string): number => {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
      const pct = parseFloat(trimmed.slice(0, -1));
      if (!Number.isFinite(pct)) return 0;
      return round2((total * pct) / 100);
    }
    return parseFloat(trimmed) || 0;
  };

  const handleAmountChange = (methodId: number, value: string) => {
    setRawInputs((prev) => ({ ...prev, [methodId]: value }));
    applyEdit(methodId, parseAmount(value));
  };

  const handleAmountBlur = (methodId: number) => {
    setRawInputs((prev) => {
      const next = { ...prev };
      delete next[methodId];
      return next;
    });
  };

  const addLine = () => {
    if (availableMethods.length === 0) return;
    setLines((prev) => [
      ...prev,
      { method_id: availableMethods[0].id, amount: 0 },
    ]);
  };

  const removeLine = (methodId: number) => {
    setLines((prev) => {
      const removed = prev.find((l) => l.method_id === methodId);
      const next = prev
        .filter((l) => l.method_id !== methodId)
        .map((l) => ({ ...l }));
      if (removed && removed.amount > 0) {
        const def = next.find((l) => l.method_id === defaultId);
        if (def) def.amount = round2(def.amount + removed.amount);
      }
      return next;
    });
  };

  const changeLineMethod = (oldMethodId: number, newMethodId: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.method_id === oldMethodId ? { ...l, method_id: newMethodId } : l,
      ),
    );
  };

  // ---- Quick actions ----

  /** Split the total evenly across all lines (first line absorbs the rounding). */
  const evenSplit = () => {
    setLines((prev) => {
      const n = prev.length;
      if (n === 0) return prev;
      const base = Math.floor((total / n) * 100) / 100;
      const next = prev.map((l) => ({ ...l, amount: base }));
      const remainder = round2(total - base * n);
      if (next[0]) next[0].amount = round2(next[0].amount + remainder);
      return next;
    });
  };

  /** Put 100% of the total on one method and zero out the rest. */
  const allHere = (methodId: number) => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        amount: l.method_id === methodId ? round2(total) : 0,
      })),
    );
  };


  const pct = (amount: number) =>
    total > 0 ? Math.round((amount / total) * 100) : 0;

  return (
    <Box
      sx={{
        p: dense ? 1 : 2,
        mt: dense ? 0 : 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: Math.abs(remaining) > 0.01 ? "warning.main" : "divider",
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          rowGap: 1,
          mb: dense ? 1 : 2,
        }}
      >
        <PaymentsIcon color="primary" fontSize={dense ? "small" : "medium"} />
        <Typography
          variant={dense ? "body2" : "subtitle1"}
          fontWeight={600}
        >
          طرق الدفع
        </Typography>
        {!dense && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: { xs: "none", sm: "inline" } }}
          >
            (يمكنك كتابة نسبة مئوية مثل %50)
          </Typography>
        )}
        <Box sx={{ ml: "auto", display: "flex", flexWrap: "wrap", gap: 1 }}>
          {balancedLines.length > 1 && (
            <Chip
              icon={<CallSplitIcon />}
              label="توزيع بالتساوي"
              variant="outlined"
              size={dense ? "small" : "medium"}
              onClick={evenSplit}
              clickable
            />
          )}
          {availableMethods.length > 0 && (
            <Chip
              icon={<AddIcon />}
              label="إضافة طريقة دفع"
              color="primary"
              variant="outlined"
              size={dense ? "small" : "medium"}
              onClick={addLine}
              clickable
            />
          )}
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: dense ? 1 : 1.5 }}>
        {balancedLines.map((line) => {
          const isDefault = line.method_id === defaultId;
          const method = methods.find((m) => m.id === line.method_id);
          const selectableForLine = methods.filter(
            (m) =>
              m.id !== defaultId &&
              (m.id === line.method_id || !usedIds.has(m.id)),
          );
          const displayValue =
            rawInputs[line.method_id] !== undefined
              ? rawInputs[line.method_id]
              : String(line.amount);

          return (
            <Box
              key={line.method_id}
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1.5,
                rowGap: 1,
              }}
            >
              {/* Method label / selector */}
              <Box
                sx={{
                  flex: { xs: "1 1 100%", sm: "0 0 24%" },
                  minWidth: 0,
                }}
              >
                {isDefault ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography fontWeight={600} noWrap>
                      {method?.name}
                    </Typography>
                    <Chip label="افتراضي" size="small" color="primary" />
                  </Box>
                ) : (
                  <FormControl fullWidth size="small">
                    <InputLabel>طريقة الدفع</InputLabel>
                    <Select
                      label="طريقة الدفع"
                      value={line.method_id}
                      onChange={(e) =>
                        changeLineMethod(line.method_id, Number(e.target.value))
                      }
                    >
                      {selectableForLine.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {methodLabel(m)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Box>

              {/* Amount */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="text"
                  inputMode="decimal"
                  label="المبلغ"
                  value={displayValue}
                  onChange={(e) =>
                    handleAmountChange(line.method_id, e.target.value)
                  }
                  onBlur={() => handleAmountBlur(line.method_id)}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">جنيه</InputAdornment>
                      ),
                    },
                  }}
                />
              </Box>

              {/* Percentage */}
              <Box
                sx={{
                  flex: "0 0 44px",
                  textAlign: "center",
                  color: "text.secondary",
                }}
              >
                <Typography variant="body2">{pct(line.amount)}%</Typography>
              </Box>

              {/* Per-line quick actions */}
              <Box
                sx={{
                  flex: "0 0 56px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <Tooltip title="ضع كامل الإجمالي على هذه الطريقة">
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => allHere(line.method_id)}
                  >
                    الكل
                  </Button>
                </Tooltip>
              </Box>

              {/* Delete (or spacer to keep rows aligned) */}
              <Box
                sx={{
                  flex: "0 0 40px",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {!isDefault && (
                  <IconButton
                    color="error"
                    size="small"
                    onClick={() => removeLine(line.method_id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {Math.abs(remaining) > 0.01 && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 1.5 }}>
          {remaining > 0
            ? `المتبقي غير الموزع: ${remaining} جنيه`
            : `الموزع أكبر من الإجمالي بمقدار ${Math.abs(remaining)} جنيه`}
        </Typography>
      )}
    </Box>
  );
};

export default PaymentSplit;

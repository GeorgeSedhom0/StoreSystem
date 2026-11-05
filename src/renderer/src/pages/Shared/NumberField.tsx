import { TextField, TextFieldProps } from "@mui/material";
import { useEffect, useRef, useState } from "react";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Arabic/Persian digits and separators → ASCII (phones often type ٫ or ،). */
export const normalizeDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٫,،]/g, ".");

/** Parse what the user typed; "" / "-" / "." count as 0. */
export const parseNumber = (s: string, integer = false): number => {
  const n = integer ? parseInt(s, 10) : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * A numeric input that keeps what the user is typing ("12.", "", "0.0") while
 * reporting a number. The usual `parseFloat(e.target.value) || 0` on a
 * controlled field turns "12." into "12" (so 12.5 becomes 125) and snaps an
 * emptied field back to 0.
 */
const NumberField = ({
  value,
  onValueChange,
  integer = false,
  allowNegative = false,
  min,
  max,
  slotProps,
  ...rest
}: Omit<TextFieldProps, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (value: number) => void;
  integer?: boolean;
  allowNegative?: boolean;
  min?: number;
  max?: number;
}) => {
  const [text, setText] = useState<string>(() =>
    value === 0 ? "0" : String(value),
  );
  const focused = useRef(false);

  // Follow outside changes (reset after save, +/- buttons) without fighting
  // the user's in-progress text.
  useEffect(() => {
    if (parseNumber(text, integer) !== value) {
      setText(value === 0 && focused.current ? "" : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pattern = integer
    ? allowNegative
      ? /^-?\d*$/
      : /^\d*$/
    : allowNegative
      ? /^-?\d*\.?\d*$/
      : /^\d*\.?\d*$/;

  return (
    <TextField
      {...rest}
      type="text"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        // Typing over a lone 0 is what everyone expects.
        if (text === "0") e.target.select();
        rest.onFocus?.(e as any);
      }}
      onBlur={(e) => {
        focused.current = false;
        let n = parseNumber(text, integer);
        if (min !== undefined && n < min) n = min;
        if (max !== undefined && n > max) n = max;
        setText(String(n));
        if (n !== value) onValueChange(n);
        rest.onBlur?.(e as any);
      }}
      onChange={(e) => {
        const raw = normalizeDigits(e.target.value.trim());
        if (!pattern.test(raw)) return;
        setText(raw);
        onValueChange(parseNumber(raw, integer));
      }}
      slotProps={{
        ...slotProps,
        htmlInput: {
          inputMode: integer ? "numeric" : "decimal",
          autoComplete: "off",
          ...(slotProps?.htmlInput as object),
        },
      }}
    />
  );
};

export default NumberField;

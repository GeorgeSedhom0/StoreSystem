import { Autocomplete, TextField } from "@mui/material";
import { Party } from "../utils/types";

/** Pick a bill's customer/supplier. Store parties are excluded: those belong
 * to transfers between stores and can't be assigned by hand. */
const PartySelect = ({
  parties,
  value,
  onChange,
  disabled,
  helperText,
}: {
  parties: Party[];
  value: number | null;
  onChange: (partyId: number | null) => void;
  disabled?: boolean;
  helperText?: string;
}) => {
  const options = parties.filter((p) => p.type !== "store" && p.id != null);
  const selected = options.find((p) => p.id === value) ?? null;
  return (
    <Autocomplete
      size="small"
      options={options}
      value={selected}
      disabled={disabled}
      onChange={(_, p) => onChange(p ? (p.id as number) : null)}
      getOptionLabel={(p) => (p.phone ? `${p.name} - ${p.phone}` : p.name)}
      getOptionKey={(p) => p.id as number}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => (
        <TextField {...params} label="الطرف الثاني (عميل / مورد)" helperText={helperText} />
      )}
      sx={{ minWidth: 280 }}
    />
  );
};

export default PartySelect;

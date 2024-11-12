import { useState } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import {
  Autocomplete,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { Party } from "../../../utils/types";
import useParties from "../../Shared/hooks/useParties";

const Parties = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [partyId, setPartyId] = useState<number | null>(null);
  const [partyName, setPartyName] = useState("");
  const [partyPhone, setPartyPhone] = useState("");
  const [partyAddress, setPartyAddress] = useState("");
  const [partyType, setPartyType] = useState("عميل");

  const {
    parties,
    addPartyMutation,
    addPartyLoading,
    updatePartyMutation,
    updatePartyLoading,
  } = useParties(setMsg);

  return (
    <Grid item container xs={12} spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid item xs={12}>
        <Typography variant="h4">العملاء والموردين</Typography>
      </Grid>
      <Grid item xs={12}>
        <Typography variant="h6">
          قم باختيار عميل او مورد لعرض و تعديل بياناته لأضافة عميل او مورد جديد
          قم باختيار اضافة جديد
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Autocomplete
          options={
            [
              {
                id: null,
                name: "اضافة جديد",
                address: "",
                phone: "",
                type: "",
              },
              ...parties,
            ] as Party[]
          }
          getOptionLabel={(option) =>
            option.name + " - " + option.phone + " - " + option.type
          }
          value={
            parties.find((party) => party.id === partyId) ||
            ({
              id: null,
              name: "اضافة جديد",
              address: "",
              phone: "",
              type: "",
            } as Party)
          }
          filterOptions={(options, params) => {
            return options.filter(
              (option) =>
                option.name
                  .toLowerCase()
                  .includes(params.inputValue.toLowerCase()) ||
                option.phone
                  .toLowerCase()
                  .includes(params.inputValue.toLowerCase()) ||
                option.address
                  .toLowerCase()
                  .includes(params.inputValue.toLowerCase()) ||
                option.type
                  .toLowerCase()
                  .includes(params.inputValue.toLowerCase()),
            );
          }}
          onChange={(_, value) => {
            if (value && value.id !== null) {
              setPartyId(value.id);
              setPartyName(value.name);
              setPartyPhone(value.phone);
              setPartyAddress(value.address);
              setPartyType(value.type);
            } else {
              setPartyId(null);
              setPartyName("");
              setPartyPhone("");
              setPartyAddress("");
              setPartyType("عميل");
            }
          }}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          renderInput={(params) => (
            <TextField {...params} label="العملاء والموردين" />
          )}
        />
      </Grid>
      <Grid item xs={12}>
        <Divider
          flexItem
          sx={{
            borderColor: (theme) =>
              theme.palette.mode === "light" ? "#000000" : "#ffffff",
          }}
        />
      </Grid>
      <Grid item container xs={12} gap={3} direction="column">
        <TextField
          label="الاسم"
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
        />
        <TextField
          label="الهاتف"
          value={partyPhone}
          onChange={(e) => setPartyPhone(e.target.value)}
        />
        <TextField
          label="العنوان"
          value={partyAddress}
          onChange={(e) => setPartyAddress(e.target.value)}
        />
        <FormControl>
          <InputLabel>النوع</InputLabel>
          <Select
            label="النوع"
            value={partyType}
            onChange={(e) => setPartyType(e.target.value)}
          >
            <MenuItem value="عميل">عميل</MenuItem>
            <MenuItem value="مورد">مورد</MenuItem>
          </Select>
        </FormControl>
        <LoadingButton
          variant="contained"
          loading={addPartyLoading || updatePartyLoading}
          onClick={() => {
            if (partyId) {
              updatePartyMutation({
                id: partyId,
                name: partyName,
                phone: partyPhone,
                address: partyAddress,
                type: partyType,
                extra_info: {},
              });
              setPartyId(null);
              setPartyName("");
              setPartyPhone("");
              setPartyAddress("");
              setPartyType("عميل");
            } else {
              addPartyMutation({
                id: partyId,
                name: partyName,
                phone: partyPhone,
                address: partyAddress,
                type: partyType,
                extra_info: {},
              });
              setPartyId(null);
              setPartyName("");
              setPartyPhone("");
              setPartyAddress("");
              setPartyType("عميل");
            }
          }}
        >
          حفظ
        </LoadingButton>
      </Grid>
    </Grid>
  );
};

export default Parties;

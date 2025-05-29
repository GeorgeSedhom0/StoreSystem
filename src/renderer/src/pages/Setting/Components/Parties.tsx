import { useState } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import {
  Autocomplete,
  FormControl,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Paper,
  Box,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { Party } from "../../../utils/types";
import useParties from "../../Shared/hooks/useParties";
import {
  Groups as GroupsIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
} from "@mui/icons-material";

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
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

      {/* Header */}
      <Paper
        elevation={2}
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.05) 100%)",
          border: "1px solid",
          borderColor: "primary.light",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <GroupsIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "primary.main" }}
          >
            العملاء والموردين
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          إدارة بيانات العملاء والموردين - يمكنك إضافة جديد أو تعديل البيانات
          الموجودة
        </Typography>
      </Paper>

      <Grid2 container spacing={3}>
        {/* Selection Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              اختيار العميل أو المورد
            </Typography>
            <Autocomplete
              options={
                [
                  {
                    id: null,
                    name: "إضافة جديد",
                    address: "",
                    phone: "",
                    type: "",
                  },
                  ...parties,
                ] as Party[]
              }
              getOptionLabel={(option) =>
                option.id === null
                  ? "إضافة جديد"
                  : `${option.name} - ${option.phone} - ${option.type}`
              }
              value={
                parties.find((party) => party.id === partyId) ||
                ({
                  id: null,
                  name: "إضافة جديد",
                  address: "",
                  phone: "",
                  type: "",
                } as Party)
              }
              filterOptions={(options, params) => {
                return options.filter(
                  (option) =>
                    option.id === null ||
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
          </Paper>
        </Grid2>

        {/* Form Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
              {partyId ? "تعديل البيانات" : "إضافة جديد"}
            </Typography>

            <Grid2 container spacing={3}>
              <Grid2 size={12}>
                <TextField
                  fullWidth
                  label="الاسم"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <PersonIcon sx={{ mr: 1, color: "text.secondary" }} />
                    ),
                  }}
                />
              </Grid2>

              <Grid2 size={12}>
                <TextField
                  fullWidth
                  label="الهاتف"
                  value={partyPhone}
                  onChange={(e) => setPartyPhone(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <PhoneIcon sx={{ mr: 1, color: "text.secondary" }} />
                    ),
                  }}
                />
              </Grid2>

              <Grid2 size={12}>
                <TextField
                  fullWidth
                  label="العنوان"
                  value={partyAddress}
                  onChange={(e) => setPartyAddress(e.target.value)}
                  multiline
                  rows={3}
                  InputProps={{
                    startAdornment: (
                      <LocationIcon
                        sx={{
                          mr: 1,
                          color: "text.secondary",
                          alignSelf: "flex-start",
                          mt: 1,
                        }}
                      />
                    ),
                  }}
                />
              </Grid2>

              <Grid2 size={12}>
                <FormControl fullWidth>
                  <InputLabel>النوع</InputLabel>
                  <Select
                    label="النوع"
                    value={partyType}
                    onChange={(e) => setPartyType(e.target.value)}
                    startAdornment={
                      <BusinessIcon sx={{ mr: 1, color: "text.secondary" }} />
                    }
                  >
                    <MenuItem value="عميل">عميل</MenuItem>
                    <MenuItem value="مورد">مورد</MenuItem>
                  </Select>
                </FormControl>
              </Grid2>

              <Grid2 size={12}>
                <LoadingButton
                  fullWidth
                  variant="contained"
                  size="large"
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
                  sx={{
                    py: 1.5,
                    borderRadius: 2,
                    fontWeight: 600,
                  }}
                >
                  {partyId ? "تحديث البيانات" : "إضافة جديد"}
                </LoadingButton>
              </Grid2>
            </Grid2>
          </Paper>
        </Grid2>
      </Grid2>
    </Box>
  );
};

export default Parties;

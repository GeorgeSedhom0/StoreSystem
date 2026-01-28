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
  IconButton,
  InputAdornment,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import { Party } from "../../utils/types";
import useParties from "../../Shared/hooks/useParties";
import {
  Groups as GroupsIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  QrCode as QrCodeIcon,
  AutoAwesome as AutoAwesomeIcon,
  Print as PrintIcon,
} from "@mui/icons-material";
import PrintBarCode from "../../Shared/PrintBarCode";

const Parties = () => {
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [partyId, setPartyId] = useState<number | null>(null);
  const [partyName, setPartyName] = useState("");
  const [partyPhone, setPartyPhone] = useState("");
  const [partyAddress, setPartyAddress] = useState("");
  const [partyType, setPartyType] = useState("عميل");
  const [partyBarcode, setPartyBarcode] = useState("");
  const [printBarcodeOpen, setPrintBarcodeOpen] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  const {
    parties,
    addPartyMutation,
    addPartyLoading,
    updatePartyMutation,
    updatePartyLoading,
    generateClientBarcode,
  } = useParties(setMsg);

  const handleGenerateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      const barcode = await generateClientBarcode();
      setPartyBarcode(barcode);
    } catch {
      setMsg({ type: "error", text: "حدث خطأ اثناء توليد الباركود" });
    } finally {
      setGeneratingBarcode(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <AlertMessage message={msg} setMessage={setMsg} />

      {printBarcodeOpen && partyBarcode && (
        <PrintBarCode
          code={partyBarcode}
          name={partyName}
          setOpen={setPrintBarcodeOpen}
        />
      )}

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
                    extra_info: {},
                    bar_code: "",
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
                  extra_info: {},
                  bar_code: "",
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
                      .includes(params.inputValue.toLowerCase()) ||
                    (option.bar_code || "")
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
                  setPartyBarcode(value.bar_code || "");
                } else {
                  setPartyId(null);
                  setPartyName("");
                  setPartyPhone("");
                  setPartyAddress("");
                  setPartyType("عميل");
                  setPartyBarcode("");
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
                  slotProps={{
                    input: {
                      startAdornment: (
                        <PersonIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                    },
                  }}
                />
              </Grid2>

              <Grid2 size={12}>
                <TextField
                  fullWidth
                  label="الهاتف"
                  value={partyPhone}
                  onChange={(e) => setPartyPhone(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <PhoneIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                    },
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
                  slotProps={{
                    input: {
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
                    },
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
                <TextField
                  fullWidth
                  label="الباركود"
                  value={partyBarcode}
                  onChange={(e) => setPartyBarcode(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <QrCodeIcon sx={{ mr: 1, color: "text.secondary" }} />
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={handleGenerateBarcode}
                            disabled={generatingBarcode}
                            title="توليد باركود تلقائي"
                          >
                            <AutoAwesomeIcon />
                          </IconButton>
                          {partyBarcode && (
                            <IconButton
                              onClick={() => setPrintBarcodeOpen(true)}
                              title="طباعة الباركود"
                            >
                              <PrintIcon />
                            </IconButton>
                          )}
                        </InputAdornment>
                      ),
                    },
                  }}
                />
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
                        bar_code: partyBarcode || undefined,
                      });
                      setPartyId(null);
                      setPartyName("");
                      setPartyPhone("");
                      setPartyAddress("");
                      setPartyType("عميل");
                      setPartyBarcode("");
                    } else {
                      addPartyMutation({
                        id: partyId,
                        name: partyName,
                        phone: partyPhone,
                        address: partyAddress,
                        type: partyType,
                        extra_info: {},
                        bar_code: partyBarcode || undefined,
                      });
                      setPartyId(null);
                      setPartyName("");
                      setPartyPhone("");
                      setPartyAddress("");
                      setPartyType("عميل");
                      setPartyBarcode("");
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

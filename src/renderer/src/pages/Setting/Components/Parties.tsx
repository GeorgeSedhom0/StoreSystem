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
  Button,
  IconButton,
  InputAdornment,
  Tooltip,
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
import { normalizeArabic } from "../../Shared/ProductAutocomplete";
import { apiError } from "../../utils/errors";

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
    } catch (e) {
      setMsg({
        type: "error",
        text: apiError(e, "حدث خطأ أثناء توليد الباركود"),
      });
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const resetForm = () => {
    setPartyId(null);
    setPartyName("");
    setPartyPhone("");
    setPartyAddress("");
    setPartyType("عميل");
    setPartyBarcode("");
  };

  const handleSave = () => {
    const name = partyName.trim();
    if (!name) {
      setMsg({ type: "error", text: "اكتب الاسم" });
      return;
    }
    const party = {
      id: partyId,
      name,
      phone: partyPhone.trim(),
      address: partyAddress.trim(),
      type: partyType,
      extra_info: {},
      bar_code: partyBarcode.trim() || undefined,
    };
    // Clear the form only after the server accepted it, so a failed save
    // (e.g. duplicate barcode) keeps what was typed.
    const options = {
      onSuccess: resetForm,
      onError: (e: unknown) =>
        setMsg({
          type: "error",
          text: apiError(
            e,
            partyId
              ? "حدث خطأ أثناء تعديل العميل أو المورد"
              : "حدث خطأ أثناء إضافة العميل أو المورد",
          ),
        }),
    };
    if (partyId) updatePartyMutation(party, options);
    else addPartyMutation(party, options);
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
          p: { xs: 2, sm: 3 },
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
            sx={{
              fontWeight: 600,
              color: "primary.main",
              fontSize: { xs: "1.4rem", sm: "2.125rem" },
            }}
          >
            العملاء والموردين
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          إدارة بيانات العملاء والموردين: اختر اسمًا لتعديله أو اترك "إضافة
          جديد" لإضافة عميل أو مورد
        </Typography>
      </Paper>

      <Grid2 container spacing={3}>
        {/* Selection Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: { xs: 2, sm: 3 },
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
                  : [option.name, option.phone, option.type]
                      .filter(Boolean)
                      .join(" - ")
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
                const words = normalizeArabic(params.inputValue)
                  .split(/\s+/)
                  .filter(Boolean);
                if (words.length === 0) return options;
                return options.filter((option) => {
                  if (option.id === null) return true;
                  const hay = normalizeArabic(
                    [
                      option.name,
                      option.phone,
                      option.address,
                      option.type,
                      option.bar_code,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  );
                  return words.every((w) => hay.includes(w));
                });
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
                <TextField
                  {...params}
                  label="ابحث بالاسم أو الهاتف أو الباركود"
                />
              )}
            />
          </Paper>
        </Grid2>

        {/* Form Section */}
        <Grid2 size={12}>
          <Paper
            elevation={1}
            sx={{
              p: { xs: 2, sm: 3 },
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
                  required
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
                    htmlInput: { dir: "ltr", inputMode: "tel" },
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
                  minRows={2}
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
                          <Tooltip
                            title="توليد باركود تلقائي"
                            enterTouchDelay={0}
                          >
                            <span>
                              <IconButton
                                onClick={handleGenerateBarcode}
                                disabled={generatingBarcode}
                                aria-label="توليد باركود تلقائي"
                              >
                                <AutoAwesomeIcon />
                              </IconButton>
                            </span>
                          </Tooltip>
                          {partyBarcode && (
                            <Tooltip title="طباعة الباركود" enterTouchDelay={0}>
                              <IconButton
                                onClick={() => setPrintBarcodeOpen(true)}
                                aria-label="طباعة الباركود"
                              >
                                <PrintIcon />
                              </IconButton>
                            </Tooltip>
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
                  disabled={!partyName.trim()}
                  onClick={handleSave}
                  sx={{
                    py: 1.5,
                    borderRadius: 2,
                    fontWeight: 600,
                  }}
                >
                  {partyId ? "حفظ التعديلات" : "إضافة"}
                </LoadingButton>
                {partyId && (
                  <Box sx={{ textAlign: "center", mt: 1 }}>
                    <Button onClick={resetForm} sx={{ minHeight: 40 }}>
                      إلغاء التعديل وإضافة جديد
                    </Button>
                  </Box>
                )}
              </Grid2>
            </Grid2>
          </Paper>
        </Grid2>
      </Grid2>
    </Box>
  );
};

export default Parties;

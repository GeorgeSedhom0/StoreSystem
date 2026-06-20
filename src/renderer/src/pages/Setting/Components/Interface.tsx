import {
  Grid2,
  Card,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Box,
} from "@mui/material";
import { useEffect, useState } from "react";
import {
  POS_PAGES,
  POS_PAGE_LABELS,
  POS_MODE_OPTIONS,
  VISIBILITY_OPTIONS,
  PosMode,
  PosPage,
  VisibilityPolicy,
  loadPosUi,
  savePosModes,
  savePolicy,
} from "../../Shared/PosLayout";

const Interface = () => {
  const [modes, setModes] = useState<Record<string, PosMode>>({});
  const [partiesPolicy, setPartiesPolicy] = useState<VisibilityPolicy>("ask");
  const [paymentsPolicy, setPaymentsPolicy] = useState<VisibilityPolicy>("ask");
  const [applyAll, setApplyAll] = useState<PosMode | "">("");

  useEffect(() => {
    (async () => {
      const { modes: m, partiesPolicy: pp, paymentsPolicy: payp } =
        await loadPosUi();
      setModes(m);
      setPartiesPolicy(pp);
      setPaymentsPolicy(payp);
    })();
  }, []);

  const persistModes = (next: Record<string, PosMode>) => {
    setModes(next);
    savePosModes(next);
  };

  const setPageMode = (page: PosPage, mode: PosMode) =>
    persistModes({ ...modes, [page]: mode });

  const setAllModes = (mode: PosMode) => {
    setApplyAll(mode);
    const next: Record<string, PosMode> = {};
    POS_PAGES.forEach((p) => (next[p] = mode));
    persistModes(next);
  };

  const setPartiesPolicyValue = (value: VisibilityPolicy) => {
    setPartiesPolicy(value);
    savePolicy("parties", value);
  };

  const setPaymentsPolicyValue = (value: VisibilityPolicy) => {
    setPaymentsPolicy(value);
    savePolicy("payments", value);
  };

  return (
    <Grid2 container spacing={3}>
      <Grid2 size={12}>
        <Typography variant="h6" gutterBottom>
          نمط عرض صفحات البيع والشراء
        </Typography>
        <Typography variant="body2" color="text.secondary">
          اختر شكل صفحات المبيعات والشراء ونقل المنتجات لتقليل التمرير وزيادة
          المساحة المخصصة للمنتجات. يمكنك أيضاً تغيير النمط مباشرة من أعلى كل
          صفحة.
        </Typography>
      </Grid2>

      <Grid2 size={{ xs: 12, sm: 6 }}>
        <Card variant="outlined" sx={{ p: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>تطبيق نمط على كل الصفحات</InputLabel>
            <Select
              label="تطبيق نمط على كل الصفحات"
              value={applyAll}
              onChange={(e) => setAllModes(e.target.value as PosMode)}
            >
              {POS_MODE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Card>
      </Grid2>

      {POS_PAGES.map((page) => (
        <Grid2 key={page} size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined" sx={{ p: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{POS_PAGE_LABELS[page]}</InputLabel>
              <Select
                label={POS_PAGE_LABELS[page]}
                value={modes[page] || "normal"}
                onChange={(e) => setPageMode(page, e.target.value as PosMode)}
              >
                {POS_MODE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Card>
        </Grid2>
      ))}

      <Grid2 size={12}>
        <Divider sx={{ my: 1 }} />
      </Grid2>

      <Grid2 size={12}>
        <Typography variant="h6" gutterBottom>
          إظهار طرق الدفع والعملاء
        </Typography>
        <Typography variant="body2" color="text.secondary">
          تحكم في ظهور قسم طرق الدفع وقسم العملاء/الموردين في صفحات البيع. عند
          اختيار «إظهار دائماً» أو «إخفاء دائماً» لن يظهر مفتاح التبديل داخل
          الصفحة.
        </Typography>
      </Grid2>

      <Grid2 size={{ xs: 12, sm: 6 }}>
        <Card variant="outlined" sx={{ p: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>طرق الدفع</InputLabel>
            <Select
              label="طرق الدفع"
              value={paymentsPolicy}
              onChange={(e) =>
                setPaymentsPolicyValue(e.target.value as VisibilityPolicy)
              }
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Card>
      </Grid2>

      <Grid2 size={{ xs: 12, sm: 6 }}>
        <Card variant="outlined" sx={{ p: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>العملاء / الموردين</InputLabel>
            <Select
              label="العملاء / الموردين"
              value={partiesPolicy}
              onChange={(e) =>
                setPartiesPolicyValue(e.target.value as VisibilityPolicy)
              }
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Card>
      </Grid2>

      <Grid2 size={12}>
        <Box sx={{ color: "text.secondary", fontSize: 13, mt: 1 }}>
          تُطبَّق التغييرات عند فتح الصفحة. إذا كانت الصفحة مفتوحة بالفعل فقد
          تحتاج إلى إعادة الدخول إليها.
        </Box>
      </Grid2>
    </Grid2>
  );
};

export default Interface;

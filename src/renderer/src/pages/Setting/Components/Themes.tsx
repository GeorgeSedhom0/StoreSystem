import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardActionArea,
  Chip,
  Grid2,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import { AUTO_THEME, THEME_EVENT, themes } from "../../../themes";

/** Theme picker: a live mini-preview of each theme; tap to apply. */
const Themes = () => {
  const [selectedTheme, setSelectedTheme] = useState(themes[0].name);

  useEffect(() => {
    (async () => {
      const themeName = await window.electron.ipcRenderer.invoke(
        "get",
        "themeName",
      );
      if (themeName) setSelectedTheme(themeName);
    })();
  }, []);

  const choose = async (name: string) => {
    setSelectedTheme(name);
    await window.electron.ipcRenderer.invoke("set", "themeName", name);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: name }));
  };

  const autoSelected = selectedTheme === AUTO_THEME;
  return (
    <Grid2 container spacing={2}>
      <Grid2 size={12}>
        <Card
          variant="outlined"
          sx={{
            borderRadius: 3,
            borderWidth: autoSelected ? 2 : 1,
            borderColor: autoSelected ? "primary.main" : "divider",
          }}
        >
          <CardActionArea onClick={() => choose(AUTO_THEME)} sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <BrightnessAutoIcon color="primary" />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>تلقائي</Typography>
                <Typography variant="body2" color="text.secondary">
                  فاتح نهاراً وداكن ليلاً حسب إعداد الجهاز أو الموبايل
                </Typography>
              </Box>
              {autoSelected ? (
                <Chip size="small" color="primary" label="مُستخدم" />
              ) : (
                <Chip size="small" variant="outlined" label="اختيار" />
              )}
            </Box>
          </CardActionArea>
        </Card>
      </Grid2>
      {themes.map((t) => {
        const selected = selectedTheme === t.name;
        return (
          <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={t.name}>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? "primary.main" : "divider",
                overflow: "hidden",
              }}
            >
              <CardActionArea onClick={() => choose(t.name)}>
                <Box
                  sx={{
                    backgroundImage: t.backgroundImage,
                    bgcolor: t.background,
                    p: 2,
                  }}
                >
                  <Box
                    sx={{
                      bgcolor: t.paper,
                      border: `1px solid ${t.surface.border}`,
                      borderRadius: 2,
                      p: 1.5,
                      color: t.text.primary,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <Typography
                        sx={{ fontWeight: 700, color: t.text.primary }}
                      >
                        {t.label || t.name}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      {selected && (
                        <CheckCircleIcon sx={{ color: t.primary }} />
                      )}
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{ color: t.text.secondary, mb: 1.5 }}
                    >
                      فاتورة بيع · 1,250 جنيه
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <Box
                        sx={{
                          bgcolor: t.primary,
                          color: t.mode === "light" ? "#fff" : "#000",
                          borderRadius: 1.5,
                          px: 1.5,
                          py: 0.5,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        حفظ
                      </Box>
                      <Box
                        sx={{
                          border: `1px solid ${t.secondary}`,
                          color: t.secondary,
                          borderRadius: 1.5,
                          px: 1.5,
                          py: 0.5,
                          fontSize: 13,
                        }}
                      >
                        طباعة
                      </Box>
                      <Box sx={{ flex: 1 }} />
                      {[t.success, t.warning, t.error].map((c) => (
                        <Box
                          key={c}
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            bgcolor: c,
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                </Box>
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {t.mode === "dark" ? "داكن" : "فاتح"}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  {selected ? (
                    <Chip size="small" color="primary" label="مُستخدم" />
                  ) : (
                    <Chip size="small" variant="outlined" label="اختيار" />
                  )}
                </Box>
              </CardActionArea>
            </Card>
          </Grid2>
        );
      })}
    </Grid2>
  );
};

export default Themes;

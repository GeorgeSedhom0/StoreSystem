import { useState, useEffect } from "react";
import { Grid, Card, Typography, Button } from "@mui/material";
import { themes } from "../../../themes";

const Themes = () => {
  const [selectedTheme, setSelectedTheme] = useState(() => {
    const savedTheme = localStorage.getItem("themeName");
    return savedTheme ? savedTheme : themes[0].name;
  });

  useEffect(() => {
    localStorage.setItem("themeName", selectedTheme);
  }, [selectedTheme]);

  return (
    <Grid container spacing={2}>
      {themes.map((theme) => (
        <Grid item xs={6} key={theme.name}>
          <Card
            style={{
              backgroundColor: theme.background,
              color: theme.mode === "dark" ? "#fff" : "#000",
              padding: "16px",
              textAlign: "center",
            }}
          >
            <Typography variant="h6">{theme.name}</Typography>
            <div
              style={{
                backgroundColor: theme.primary,
                height: "50px",
                margin: "8px 0",
              }}
            />
            <div
              style={{
                backgroundColor: theme.secondary,
                height: "50px",
                margin: "8px 0",
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                setSelectedTheme(theme.name);
                window.location.reload();
              }}
            >
              Select
            </Button>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default Themes;

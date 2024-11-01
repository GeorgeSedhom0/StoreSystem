import React, { useState, useEffect } from 'react';
import { Grid, Card, Typography, Button } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';

const themes = {
  light: createTheme({
    palette: {
      mode: 'light',
      background: {
        default: '#d5e5ff',
        paper: '#c1d9ff',
      },
      divider: '#94b6ff',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: 'radial-gradient(circle at center, #8cb2ed 0%, #aabbff 70%);',
            backgroundAttachment: 'fixed',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            minHeight: '100vh',
          },
        },
      },
    },
  }),
  dark: createTheme({
    palette: {
      mode: 'dark',
      background: {
        default: '#323f54',
        paper: '#293649',
      },
      divider: '#3d4d64',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: 'radial-gradient(circle at center, #3d4d64 0%, #263245 100%);',
            backgroundAttachment: 'fixed',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            minHeight: '100vh',
          },
        },
      },
    },
  }),
  theme1: createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: '#ff5722',
      },
      background: {
        default: '#ffe0b2',
        paper: '#ffcc80',
      },
      divider: '#ffab40',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: 'radial-gradient(circle at center, #ffab40 0%, #ffcc80 70%);',
            backgroundAttachment: 'fixed',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            minHeight: '100vh',
          },
        },
      },
    },
  }),
  theme2: createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#4caf50',
      },
      background: {
        default: '#2e7d32',
        paper: '#388e3c',
      },
      divider: '#66bb6a',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: 'radial-gradient(circle at center, #66bb6a 0%, #388e3c 100%);',
            backgroundAttachment: 'fixed',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            minHeight: '100vh',
          },
        },
      },
    },
  }),
  theme3: createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: '#2196f3',
      },
      background: {
        default: '#bbdefb',
        paper: '#90caf9',
      },
      divider: '#64b5f6',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: 'radial-gradient(circle at center, #64b5f6 0%, #90caf9 70%);',
            backgroundAttachment: 'fixed',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            minHeight: '100vh',
          },
        },
      },
    },
  }),
  theme4: createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#9c27b0',
      },
      background: {
        default: '#6a1b9a',
        paper: '#7b1fa2',
      },
      divider: '#ba68c8',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: 'radial-gradient(circle at center, #ba68c8 0%, #7b1fa2 100%);',
            backgroundAttachment: 'fixed',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            minHeight: '100vh',
          },
        },
      },
    },
  }),
};

const Themes = () => {
  const [selectedTheme, setSelectedTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    localStorage.setItem('theme', selectedTheme);
  }, [selectedTheme]);

  return (
    <ThemeProvider theme={themes[selectedTheme]}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Typography variant="h4">اختر السمة</Typography>
        </Grid>
        {Object.keys(themes).map((themeKey) => (
          <Grid item xs={4} key={themeKey}>
            <Card
              onClick={() => setSelectedTheme(themeKey)}
              sx={{
                cursor: 'pointer',
                padding: 2,
                textAlign: 'center',
                backgroundColor: themes[themeKey].palette.background.default,
                color: themes[themeKey].palette.text.primary,
              }}
            >
              <Typography variant="h6">{themeKey}</Typography>
              <Button variant="contained" color="primary">
                اختر
              </Button>
            </Card>
          </Grid>
        ))}
      </Grid>
    </ThemeProvider>
  );
};

export default Themes;

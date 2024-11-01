import React, { useState, useEffect } from 'react';
import { Grid, Card, Typography, Button } from '@mui/material';

const themes = [
  {
    name: 'Light Blue',
    mode: 'light',
    primary: '#1976d2',
    secondary: '#ff4081',
    background: '#e3f2fd',
  },
  {
    name: 'Light Green',
    mode: 'light',
    primary: '#388e3c',
    secondary: '#ffeb3b',
    background: '#e8f5e9',
  },
  {
    name: 'Light Orange',
    mode: 'light',
    primary: '#f57c00',
    secondary: '#ffca28',
    background: '#fff3e0',
  },
  {
    name: 'Dark Blue',
    mode: 'dark',
    primary: '#0d47a1',
    secondary: '#ff4081',
    background: '#1a237e',
  },
  {
    name: 'Dark Green',
    mode: 'dark',
    primary: '#1b5e20',
    secondary: '#ffeb3b',
    background: '#2e7d32',
  },
  {
    name: 'Dark Orange',
    mode: 'dark',
    primary: '#e65100',
    secondary: '#ffca28',
    background: '#bf360c',
  },
];

const Themes = () => {
  const [selectedTheme, setSelectedTheme] = useState(() => {
    const savedTheme = localStorage.getItem('selectedTheme');
    return savedTheme ? JSON.parse(savedTheme) : themes[0];
  });

  useEffect(() => {
    localStorage.setItem('selectedTheme', JSON.stringify(selectedTheme));
  }, [selectedTheme]);

  return (
    <Grid container spacing={2}>
      {themes.map((theme) => (
        <Grid item xs={12} sm={6} md={4} key={theme.name}>
          <Card
            style={{
              backgroundColor: theme.background,
              color: theme.mode === 'dark' ? '#fff' : '#000',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <Typography variant="h6">{theme.name}</Typography>
            <div
              style={{
                backgroundColor: theme.primary,
                height: '50px',
                margin: '8px 0',
              }}
            />
            <div
              style={{
                backgroundColor: theme.secondary,
                height: '50px',
                margin: '8px 0',
              }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={() => setSelectedTheme(theme)}
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

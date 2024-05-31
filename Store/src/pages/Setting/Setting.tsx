import { Card, Grid, Typography } from "@mui/material";

const Settings = () => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Card elevation={3} sx={{ p: 3 }}>
          <Typography variant="h4">الاعدادات</Typography>
        </Card>
      </Grid>
    </Grid>
  );
};

export default Settings;

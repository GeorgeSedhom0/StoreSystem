import { Grid } from "@mui/material";
import UpdateUser from "./EditUser";
import SignUp from "./SignUp";

const Users = () => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <SignUp />
      </Grid>
      <Grid item xs={12}>
        <UpdateUser />
      </Grid>
    </Grid>
  );
};

export default Users;

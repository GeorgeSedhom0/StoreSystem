import { Grid2 } from "@mui/material";
import UpdateUser from "./EditUser";
import SignUp from "./SignUp";

const Users = () => {
  return (
    <Grid2 container spacing={3}>
      <Grid2 size={12}>
        <SignUp />
      </Grid2>
      <Grid2 size={12}>
        <UpdateUser />
      </Grid2>
    </Grid2>
  );
};

export default Users;

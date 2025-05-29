import { Grid2, Typography, Box, Paper } from "@mui/material";
import UpdateUser from "./EditUser";
import SignUp from "./SignUp";
import {
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
} from "@mui/icons-material";

const Users = () => {
  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
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
          <PersonAddIcon sx={{ fontSize: "2rem", color: "primary.main" }} />
          <Typography
            variant="h4"
            sx={{ fontWeight: 600, color: "primary.main" }}
          >
            إدارة المستخدمين
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          إضافة مستخدمين جدد وتعديل بيانات المستخدمين الحاليين
        </Typography>
      </Paper>

      <Grid2 container spacing={4}>
        {/* Add New User Section */}
        <Grid2 size={{ xs: 12, lg: 6 }}>
          <Paper
            elevation={1}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              height: "fit-content",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <PersonAddIcon sx={{ color: "success.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                إضافة مستخدم جديد
              </Typography>
            </Box>
            <SignUp />
          </Paper>
        </Grid2>

        {/* Edit User Section */}
        <Grid2 size={{ xs: 12, lg: 6 }}>
          <Paper
            elevation={1}
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
              height: "fit-content",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <EditIcon sx={{ color: "warning.main" }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                تعديل مستخدم موجود
              </Typography>
            </Box>
            <UpdateUser />
          </Paper>
        </Grid2>
      </Grid2>
    </Box>
  );
};

export default Users;

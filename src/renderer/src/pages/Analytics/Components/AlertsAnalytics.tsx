import { Card, Grid2, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface AlertAnalytics {
  name: string;
  stock: number;
  days_left: number;
  urgent: boolean;
}
const getAnalytics = async () => {
  const { data } = await axios.get<AlertAnalytics[]>("/analytics/alerts");
  return data;
};
const AlertsAnalytics = () => {
  const { data } = useQuery({
    queryKey: ["analytics", "alerts"],
    queryFn: getAnalytics,
    initialData: [],
  });

  return (
    <Grid2 size={12}>
      <Card elevation={3} sx={{ px: 3, py: 2, position: "relative" }}>
        <Grid2 container spacing={2}>
          <Grid2 size={12}>
            <Typography variant="h4">تحذيرات الاقتراب من الانتهاء</Typography>
            <Typography variant="body1">
              تم تصميم هذة الاشعارات للتنبيه عند اقتراب بعض المنتجات من الانتهاء
              يتم الاخذ بعين الاعتبار جميع المنتجات المباعة خلال اخر 30 يوم يرجى
              الانتباه الى الاشعارات المحددة باللون الاحمر بشكل خاص
            </Typography>
          </Grid2>
          <Grid2 container gap={3} size={12}>
            {data.length === 0 && (
              <Typography variant="body1">لا يوجد اشعارات</Typography>
            )}
            {data.map((alert) => (
              <Grid2 size={12}>
                <Card
                  elevation={3}
                  sx={{
                    p: 2,
                    bgcolor: alert.urgent ? "error.main" : "background.paper",
                    color: alert.urgent ? "white" : "text.primary",
                  }}
                >
                  <Typography variant="h6">{alert.name}</Typography>
                  <Typography variant="body1">
                    المخزون: {alert.stock}
                  </Typography>
                  <Typography variant="body1">
                    الايام المتبقية: {alert.days_left}
                  </Typography>
                </Card>
              </Grid2>
            ))}
          </Grid2>
        </Grid2>
      </Card>
    </Grid2>
  );
};

export default AlertsAnalytics;

import { Card, Grid2, Typography } from "@mui/material";
import { StoreContext } from "@renderer/StoreDataProvider";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useContext } from "react";

interface AlertAnalytics {
  name: string;
  stock: number;
  days_left: number;
  urgent: boolean;
}
const getAnalytics = async ({ queryKey }) => {
  const [_analytics, _alerts, storeId] = queryKey;
  const { data } = await axios.get<AlertAnalytics[]>("/analytics/alerts", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const AlertsAnalytics = () => {
  const { storeId } = useContext(StoreContext);

  const { data } = useQuery({
    queryKey: ["analytics", "alerts", storeId],
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
          <Grid2 container spacing={3} size={12}>
            {data.length === 0 && (
              <Typography variant="body1">لا يوجد اشعارات</Typography>
            )}
            {data.map((alert, i) => (
              <Grid2 size={4} key={i}>
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

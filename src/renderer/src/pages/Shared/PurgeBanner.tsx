// Global banner while a scheduled data purge is about to run (2-minute cancel
// window) or running. Spec: docs/specs/v28-data-purge.md
import { Alert, Button } from "@mui/material";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { PurgeStatus } from "../DataPurge/DataPurge";

const fmt = (iso?: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "-");

const PurgeBanner = ({ enabled }: { enabled: boolean }) => {
  const queryClient = useQueryClient();
  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["purge-status"],
    queryFn: async () => (await axios.get<PurgeStatus>("/purge/status")).data,
    refetchInterval: (q) => (q.state.data?.pending || q.state.data?.running.running ? 5000 : 15000),
    enabled,
    retry: false,
  });

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!data?.pending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [data?.pending]);

  const { mutate: cancel, isPending } = useMutation({
    mutationFn: () => axios.post("/purge/cancel"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["purge-status"] }),
  });

  if (!enabled || !data) return null;

  if (data.running.running) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        جاري حذف السجلات القديمة (قبل {fmt(data.running.cutoff)})… قد يتوقف البيع لحظات.
      </Alert>
    );
  }

  if (data.pending) {
    const left = Math.max(0, data.pending.seconds_left - Math.floor((now - dataUpdatedAt) / 1000));
    const mm = Math.floor(left / 60);
    const ss = String(left % 60).padStart(2, "0");
    return (
      <Alert
        severity="warning"
        sx={{ mb: 2 }}
        action={
          <Button color="inherit" size="small" disabled={isPending} onClick={() => cancel()}>
            إلغاء
          </Button>
        }
      >
        سيتم حذف كل السجلات قبل {fmt(data.pending.slot)} خلال {mm}:{ss} (حذف تلقائي مجدول).
      </Alert>
    );
  }
  return null;
};

export default PurgeBanner;

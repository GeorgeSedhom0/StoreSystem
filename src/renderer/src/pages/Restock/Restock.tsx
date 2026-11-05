import {
  Badge,
  Box,
  Card,
  Stack,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import OutboxIcon from "@mui/icons-material/Outbox";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { StoreContext } from "@renderer/StoreDataProvider";
import AlertMessage, { AlertMsg } from "../Shared/AlertMessage";
import LoadingScreen from "../Shared/LoadingScreen";
import useProducts from "../Shared/hooks/useProducts";
import { Product, StoreData } from "../utils/types";
import RequestForm, { FormMode } from "./Components/RequestForm";
import RequestList, { useRestockList } from "./Components/RequestList";
import RequestDetail from "./Components/RequestDetail";
import SupplyPlan from "./Components/SupplyPlan";
import { RestockRequest, addToDraft, loadDraft, saveDraft } from "./api";

type TabKey = "new" | "mine" | "incoming";

const getStores = async () =>
  (await axios.get<StoreData[]>("/admin/stores-data")).data;

const tabKey = (storeId: number) => `restockTab_${storeId}`;

const Restock = () => {
  const { storeId, profile } = useContext(StoreContext);
  const { products, isLoading: productsLoading } = useProducts();
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });
  const [params, setParams] = useSearchParams();

  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ["storesData"],
    queryFn: getStores,
  });
  const canMove = !!profile?.user.paths?.includes("/admin/move-products");

  const { data: mine } = useRestockList(storeId, "mine");
  const { data: incoming } = useRestockList(storeId, "incoming");
  const mineOpen = (mine || []).filter((r) => r.status === "open").length;
  const incomingOpen = (incoming || []).filter((r) => r.status === "open");
  const incomingUnseen = incomingOpen.filter((r) => !r.seen_at).length;

  const [tab, setTab] = useState<TabKey>(
    () => (localStorage.getItem(tabKey(storeId)) as TabKey) || "new",
  );
  useEffect(() => {
    setTab((localStorage.getItem(tabKey(storeId)) as TabKey) || "new");
  }, [storeId]);
  // A storage with unseen requests lands on them once.
  const [autoJumped, setAutoJumped] = useState(false);
  useEffect(() => {
    if (!autoJumped && incoming) {
      setAutoJumped(true);
      if (incomingUnseen > 0) setTab("incoming");
    }
  }, [incoming, incomingUnseen, autoJumped]);
  const changeTab = (t: TabKey) => {
    setTab(t);
    try {
      localStorage.setItem(tabKey(storeId), t);
    } catch {
      // ignore
    }
  };

  const [incomingView, setIncomingView] = useState<"requests" | "products">(
    () =>
      (localStorage.getItem("restockIncomingView") as
        | "requests"
        | "products") || "requests",
  );

  const [mode, setMode] = useState<FormMode>({ kind: "new" });
  // Bumped when the stored draft changes outside the form (copy from a
  // request), so a mounted form reloads it.
  const [draftNonce, setDraftNonce] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  // Deep link from a notification: #/restock-requests?id=12
  useEffect(() => {
    const id = Number(params.get("id"));
    if (id) {
      setOpenId(id);
      params.delete("id");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const byId = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of products) if (p.id != null) m.set(p.id, p);
    return m;
  }, [products]);
  const packUnits = useCallback(
    (pid: number, pkgId: number) =>
      byId.get(pid)?.packages?.find((k) => k.id === pkgId)?.units || 0,
    [byId],
  );

  const onCopy = (r: RestockRequest, what: "remaining" | "all") => {
    const lines = r.lines
      .map((l) => ({
        product_id: l.product_id,
        units: what === "remaining" ? l.remaining : l.quantity,
        package_id: l.package_id,
      }))
      .filter((l) => l.units > 0);
    const draft = addToDraft(loadDraft(storeId), lines, packUnits);
    if (what === "remaining" && r.status === "closed" && !r.followed_up_at)
      draft.carry_from = Array.from(new Set([...draft.carry_from, r.id]));
    if (draft.to_store_id == null) draft.to_store_id = r.to_store_id;
    saveDraft(storeId, draft);
    setDraftNonce((n) => n + 1);
    setOpenId(null);
    setMode({ kind: "new" });
    changeTab("new");
    setMsg({
      type: "success",
      text: `أُضيف ${lines.length} صنف إلى الطلب الجديد — راجعه ثم أرسله`,
    });
  };

  const onEdit = (r: RestockRequest) => {
    setOpenId(null);
    setMode({ kind: "edit", request: r });
    changeTab("new");
  };

  const onDone = (r: RestockRequest, merged: boolean) => {
    setMsg({
      type: "success",
      text:
        mode.kind === "edit"
          ? `تم حفظ تعديل الطلب #${r.id}`
          : merged
            ? `أُضيفت الأصناف إلى الطلب #${r.id}`
            : `تم إرسال الطلب #${r.id} إلى ${r.to_store_name}`,
    });
    setMode({ kind: "new" });
    changeTab("mine");
  };

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <LoadingScreen loading={productsLoading || storesLoading} />

      <Card sx={{ px: { xs: 0.5, md: 1 } }}>
        <Tabs
          value={tab}
          onChange={(_, v) => changeTab(v)}
          variant="fullWidth"
          sx={{ "& .MuiTab-root": { minHeight: 56, px: 1 } }}
        >
          <Tab
            value="new"
            icon={<AddShoppingCartIcon />}
            iconPosition="start"
            label={
              mode.kind === "edit" ? `تعديل #${mode.request.id}` : "طلب جديد"
            }
          />
          <Tab
            value="mine"
            icon={
              <Badge color="primary" badgeContent={mineOpen} max={99}>
                <OutboxIcon />
              </Badge>
            }
            iconPosition="start"
            label="طلباتي"
          />
          <Tab
            value="incoming"
            icon={
              <Badge
                color={incomingUnseen ? "error" : "primary"}
                badgeContent={incomingUnseen || incomingOpen.length}
                max={99}
              >
                <MoveToInboxIcon />
              </Badge>
            }
            iconPosition="start"
            label="الوارد"
          />
        </Tabs>
      </Card>

      {tab === "new" && (
        <RequestForm
          key={
            mode.kind === "edit"
              ? `edit-${mode.request.id}`
              : `new-${storeId}-${draftNonce}`
          }
          storeId={storeId}
          stores={stores}
          products={products}
          mode={mode}
          onDone={onDone}
          onCancelEdit={() => setMode({ kind: "new" })}
          setMsg={setMsg}
        />
      )}

      {tab === "mine" && (
        <RequestList storeId={storeId} box="mine" onOpen={setOpenId} />
      )}

      {tab === "incoming" && (
        <Stack spacing={1.5}>
          <Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={incomingView}
              onChange={(_, v) => {
                if (!v) return;
                setIncomingView(v);
                try {
                  localStorage.setItem("restockIncomingView", v);
                } catch {
                  // ignore
                }
              }}
            >
              <ToggleButton value="requests">حسب الطلب</ToggleButton>
              <ToggleButton value="products">حسب المنتج</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {incomingView === "requests" ? (
            <RequestList storeId={storeId} box="incoming" onOpen={setOpenId} />
          ) : (
            <SupplyPlan storeId={storeId} canMove={canMove} />
          )}
        </Stack>
      )}

      <RequestDetail
        requestId={openId}
        onClose={() => setOpenId(null)}
        onEdit={onEdit}
        onCopy={onCopy}
        canMove={canMove}
        setMsg={setMsg}
      />
    </Stack>
  );
};

export default Restock;

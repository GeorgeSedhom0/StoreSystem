import { useCallback, useEffect, useState } from "react";

// ─── POS layout (UI density / arrangement) modes ───────────────────────────
// Applies to the four cart pages (Sell, AdminSell, Buy, MoveProducts). The
// chosen mode is persisted per-page through the generic settings IPC channel
// ("get"/"set"), so it survives reloads and works on both desktop and web.

export type PosMode = "normal" | "compact" | "split" | "split-compact";
export type PosPage = "Sell" | "AdminSell" | "Buy" | "MoveProducts";
/** Visibility policy for the payment-methods / clients sections:
 *  - ask: show an on-page toggle (current behaviour)
 *  - always: always shown, no toggle
 *  - never: always hidden, no toggle */
export type VisibilityPolicy = "ask" | "always" | "never";

export const POS_MODE_OPTIONS: { value: PosMode; label: string }[] = [
  { value: "normal", label: "عادي" },
  { value: "compact", label: "مدمج" },
  { value: "split", label: "تقسيم عمودي" },
  { value: "split-compact", label: "تقسيم مدمج" },
];

export const POS_PAGES: PosPage[] = ["Sell", "AdminSell", "Buy", "MoveProducts"];

export const POS_PAGE_LABELS: Record<PosPage, string> = {
  Sell: "المبيعات",
  AdminSell: "مبيعات الأدمن",
  Buy: "المشتريات",
  MoveProducts: "نقل المنتجات",
};

export const VISIBILITY_OPTIONS: { value: VisibilityPolicy; label: string }[] = [
  { value: "ask", label: "اختيار في الصفحة" },
  { value: "always", label: "إظهار دائماً" },
  { value: "never", label: "إخفاء دائماً" },
];

export interface PosDensity {
  /** Grid spacing for the root layout + the controls grid. */
  spacing: number;
  /** Padding of the controls Card. */
  cardPadding: number;
  /** Height of the cart scroll area (stacked modes). */
  cartHeight: string;
  /** Whether the page is in a side-by-side (cart left / actions right) layout. */
  isSplit: boolean;
  /** Whether a denser look applies (compact + split-compact): tighter payment
   * split, smaller gaps, and (in horizontal compact) paired input fields. */
  isCompact: boolean;
  /** Shared fixed height for BOTH cards in split mode, so they line up. */
  splitHeight: string;
}

export const getPosDensity = (mode: PosMode): PosDensity => {
  // In split mode both columns get this exact height so they match edge-to-edge.
  // 15% shorter than the full available height so it doesn't force a scrollbar
  // on normal screens.
  const splitHeight = "calc((100vh - 120px) * 0.85)";
  switch (mode) {
    // Compact: ~10% tighter than normal, a bit more room for the cart.
    case "compact":
      return {
        spacing: 1.35,
        cardPadding: 1.5,
        cartHeight: "65vh",
        isSplit: false,
        isCompact: true,
        splitHeight,
      };
    case "split":
      return {
        spacing: 2,
        cardPadding: 2,
        cartHeight: splitHeight,
        isSplit: true,
        isCompact: false,
        splitHeight,
      };
    case "split-compact":
      return {
        spacing: 1.35,
        cardPadding: 1.5,
        cartHeight: splitHeight,
        isSplit: true,
        isCompact: true,
        splitHeight,
      };
    default:
      return {
        spacing: 3,
        cardPadding: 3,
        cartHeight: "50vh",
        isSplit: false,
        isCompact: false,
        splitHeight,
      };
  }
};

const MODES_KEY = "posUiModes";
const PARTIES_POLICY_KEY = "partiesPolicy";
const PAYMENTS_POLICY_KEY = "paymentsPolicy";
// Synchronous mirror of the above so the FIRST render already has the saved
// values. Without it the page renders once in "normal" and then snaps to the
// saved mode when the async ipc read resolves — a visible flicker.
const CACHE_KEY = "posUiCache";

const ipc = () => window?.electron?.ipcRenderer;

interface PosUiCache {
  modes?: Record<string, PosMode>;
  partiesPolicy?: VisibilityPolicy;
  paymentsPolicy?: VisibilityPolicy;
}

const readCache = (): PosUiCache => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeCache = (patch: PosUiCache) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...readCache(), ...patch }),
    );
  } catch {
    /* ignore */
  }
};

/** Persist the per-page modes to the durable store AND the sync cache. */
export const savePosModes = async (modes: Record<string, PosMode>) => {
  writeCache({ modes });
  try {
    await ipc()?.invoke("set", MODES_KEY, modes);
  } catch {
    /* ignore */
  }
};

/** Persist a visibility policy to the durable store AND the sync cache. */
export const savePolicy = async (
  which: "parties" | "payments",
  value: VisibilityPolicy,
) => {
  writeCache(
    which === "parties"
      ? { partiesPolicy: value }
      : { paymentsPolicy: value },
  );
  try {
    await ipc()?.invoke(
      "set",
      which === "parties" ? PARTIES_POLICY_KEY : PAYMENTS_POLICY_KEY,
      value,
    );
  } catch {
    /* ignore */
  }
};

/** Read everything from the durable store, refreshing the sync cache. */
export const loadPosUi = async (): Promise<{
  modes: Record<string, PosMode>;
  partiesPolicy: VisibilityPolicy;
  paymentsPolicy: VisibilityPolicy;
}> => {
  const cache = readCache();
  let modes = cache.modes || {};
  let partiesPolicy = cache.partiesPolicy || "ask";
  let paymentsPolicy = cache.paymentsPolicy || "ask";
  try {
    const bridge = ipc();
    if (bridge) {
      const [m, pp, payp] = await Promise.all([
        bridge.invoke("get", MODES_KEY),
        bridge.invoke("get", PARTIES_POLICY_KEY),
        bridge.invoke("get", PAYMENTS_POLICY_KEY),
      ]);
      if (m && typeof m === "object") modes = m;
      if (pp) partiesPolicy = pp;
      if (payp) paymentsPolicy = payp;
      writeCache({ modes, partiesPolicy, paymentsPolicy });
    }
  } catch {
    /* ignore */
  }
  return { modes, partiesPolicy, paymentsPolicy };
};

/** Read the per-page mode map + the two visibility policies. Initial state
 * comes from the synchronous cache (no flicker); the ipc store reconciles it. */
export const usePosUi = (page: PosPage) => {
  const [mode, setModeState] = useState<PosMode>(
    () => readCache().modes?.[page] || "normal",
  );
  const [partiesPolicy, setPartiesPolicy] = useState<VisibilityPolicy>(
    () => readCache().partiesPolicy || "ask",
  );
  const [paymentsPolicy, setPaymentsPolicy] = useState<VisibilityPolicy>(
    () => readCache().paymentsPolicy || "ask",
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const { modes, partiesPolicy: pp, paymentsPolicy: payp } =
        await loadPosUi();
      if (!active) return;
      setModeState(modes[page] || "normal");
      setPartiesPolicy(pp);
      setPaymentsPolicy(payp);
    })();
    return () => {
      active = false;
    };
  }, [page]);

  const setMode = useCallback(
    async (next: PosMode) => {
      setModeState(next);
      await savePosModes({ ...(readCache().modes || {}), [page]: next });
    },
    [page],
  );

  return {
    mode,
    setMode,
    density: getPosDensity(mode),
    partiesPolicy,
    paymentsPolicy,
  };
};

/** Resolve an effective on/off given a policy and the user's on-page choice. */
export const resolveVisibility = (
  policy: VisibilityPolicy,
  pageChoice: boolean,
): boolean => (policy === "ask" ? pageChoice : policy === "always");

// ── Inline layout helpers ──────────────────────────────────────────────────
// The four cart pages keep their existing two-card structure (actions Card +
// cart Card as siblings of a Grid2 container). These helpers drive the
// arrangement from the density so the pages stay DRY: in split mode the actions
// card shrinks to 5/12 (and sticks) while the cart grows to 7/12. In RTL the
// first sibling (actions) sits on the right and the cart on the left.

/** Responsive Grid2 `size` values for the actions / cart cards. */
export const posCardSizes = (isSplit: boolean) => ({
  actions: isSplit ? { xs: 12, md: 5 } : 12,
  cart: isSplit ? { xs: 12, md: 7 } : 12,
});

/** sx for the actions Card: padding always, plus a fixed equal height + own
 * scroll in split mode so it matches the cart card height. */
export const posActionsCardSx = (d: PosDensity) =>
  d.isSplit
    ? {
        p: d.cardPadding,
        height: { md: d.splitHeight },
        overflowY: { md: "auto" as const },
      }
    : { p: d.cardPadding };

/** sx for the cart Card: a fixed-height flex column in split so it lines up
 * with the actions card regardless of any toolbar above the table. */
export const posCartCardSx = (d: PosDensity) =>
  d.isSplit
    ? {
        height: { md: d.splitHeight },
        display: "flex" as const,
        flexDirection: "column" as const,
      }
    : {};

/** sx for the scroll region inside the cart card. In split it fills the
 * remaining height; otherwise it uses the per-mode cart height. */
export const posCartScrollSx = (d: PosDensity) =>
  d.isSplit
    ? { flex: { md: 1 }, minHeight: { md: 0 }, height: { xs: d.cartHeight, md: "auto" } }
    : { height: d.cartHeight };

/** Grid2 `size` value: a column count or a per-breakpoint map. */
type GridSize =
  | number
  | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };

/** Field width helper: in split mode the controls column is narrow, so fields
 * should take more of each row (fewer per row). Returns `split` when split. */
export const splitField = (
  isSplit: boolean,
  normal: GridSize,
  split: GridSize,
): GridSize => (isSplit ? split : normal);

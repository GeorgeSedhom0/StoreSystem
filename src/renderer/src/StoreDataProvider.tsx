import { createContext, useState, useEffect, useCallback } from "react";
import { Profile } from "./pages/Shared/Utils";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import LoadingScreen from "./pages/Shared/LoadingScreen";

const DEFAULT_STORE = {
  id: 1,
  name: "Store",
  address: "Address",
  phone: "Phone",
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface StoreContextType {
  storeId: number;
  setGlobalStoreId: (storeId: number) => Promise<void>;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  store: {
    id: number;
    name: string;
    address: string;
    phone: string;
  };
}

const StoreContext = createContext<StoreContextType>({} as StoreContextType);

const getProfile = async () => {
  const { data } = await axios.get<Profile>("/profile");
  return data;
};

const StoreDataProvider = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [storeId, setStoreId] = useState<number>(1);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isStoreLoading, setIsStoreLoading] = useState(true);
  const [store, setStore] = useState(DEFAULT_STORE);

  const refreshProfile = useCallback(async () => {
    setIsProfileLoading(true);
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (error) {
      navigate("/login");
    } finally {
      setIsProfileLoading(false);
    }
  }, [navigate]);

  const refreshStore = useCallback(async (storeIdInner: number) => {
    setIsStoreLoading(true);
    try {
      let lastError: unknown;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const { data } = await axios.get("/store-data", {
            params: {
              store_id: storeIdInner,
            },
          });

          if (!data) {
            throw new Error(`Store data not found for store ${storeIdInner}`);
          }

          setStore(data);
          return;
        } catch (error) {
          lastError = error;

          if (attempt < 3) {
            await delay(400);
          }
        }
      }

      throw lastError;
    } finally {
      setIsStoreLoading(false);
    }
  }, []);

  const setGlobalStoreId = useCallback(
    async (storeIdInner: number) => {
      await window.electron.ipcRenderer.invoke("set", "store_id", storeIdInner);
      setStoreId(storeIdInner);
      await refreshStore(storeIdInner);
    },
    [refreshStore],
  );

  useEffect(() => {
    if (location.pathname !== "/login" && !profile) {
      refreshProfile();
    } else if (location.pathname !== "/login") {
      setIsProfileLoading(false);
    } else {
      setIsProfileLoading(false);
      setIsStoreLoading(false);
    }
  }, [location.pathname, refreshProfile, profile]);

  useEffect(() => {
    const bootstrapStore = async () => {
      if (!profile || location.pathname === "/login") {
        return;
      }

      setIsStoreLoading(true);
      try {
        const storedStoreId = await window.electron.ipcRenderer.invoke(
          "get",
          "store_id",
        );
        const effectiveStoreId =
          storedStoreId !== null && typeof storedStoreId === "number"
            ? storedStoreId
            : 1;

        if (effectiveStoreId !== storedStoreId) {
          await window.electron.ipcRenderer.invoke("set", "store_id", 1);
        }

        setStoreId(effectiveStoreId);
        await refreshStore(effectiveStoreId);
      } catch (error) {
        setStore(DEFAULT_STORE);
        setIsStoreLoading(false);
      }
    };

    bootstrapStore();
  }, [profile, refreshStore]);

  if (
    (isProfileLoading || isStoreLoading || !profile) &&
    location.pathname !== "/login"
  ) {
    return <LoadingScreen loading={true} />;
  }

  return (
    <StoreContext.Provider
      value={{ store, storeId, setGlobalStoreId, profile, refreshProfile }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export { StoreContext, StoreDataProvider };

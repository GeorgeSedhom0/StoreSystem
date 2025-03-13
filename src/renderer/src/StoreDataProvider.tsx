import { createContext, useState, useEffect, useCallback } from "react";
import { Profile } from "./pages/Shared/Utils";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import LoadingScreen from "./pages/Shared/LoadingScreen";

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
  const [isLoading, setIsLoading] = useState(true);
  const [store, setStore] = useState({
    id: 1,
    name: "Store",
    address: "Address",
    phone: "Phone",
  });

  const refreshProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getProfile();
      setProfile(data);
    } catch (error) {
      navigate("/login");
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const refreshStore = useCallback(async (storeIdInner: number) => {
    const { data } = await axios.get("/store-data", {
      params: {
        store_id: storeIdInner,
      },
    });
    setStore(data);
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
      setIsLoading(false);
    }
  }, [location.pathname, refreshProfile, profile]);

  useEffect(() => {
    const getStoreId = async () => {
      const storeIdInner = await window.electron.ipcRenderer.invoke(
        "get",
        "store_id",
      );
      console.log("storeIdInner", storeIdInner);
      if (storeIdInner !== null && typeof storeIdInner === "number") {
        setStoreId(storeIdInner);
      } else {
        await window.electron.ipcRenderer.invoke("set", "store_id", 1);
        setStoreId(1);
      }
      await refreshStore(storeIdInner);
    };
    getStoreId();
  }, []);

  if (isLoading && !profile && location.pathname !== "/login") {
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

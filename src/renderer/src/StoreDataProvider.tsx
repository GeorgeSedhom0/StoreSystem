import { createContext, useState, useEffect } from "react";
import { Profile } from "./pages/Shared/Utils";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import LoadingScreen from "./pages/Shared/LoadingScreen";

const StoreContext = createContext<Profile>({} as Profile);

const getProfile = async () => {
  const { data } = await axios.get<Profile>("/profile");

  return data;
};

const StoreDataProvider = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      try {
        const data = await getProfile();
        setProfile(data);
      } catch (error) {
        navigate("/login");
      }
      setIsLoading(false);
    };

    if (location.pathname !== "/login" && !profile) {
      fetchProfile();
    }

    const interval = setInterval(() => {
      fetchProfile();
    }, 1000 * 60);

    return () => clearInterval(interval);
  }, [location.pathname]);

  if (isLoading && !profile && location.pathname !== "/login") {
    return <LoadingScreen loading={true} />;
  }

  return (
    <StoreContext.Provider value={profile!}>{children}</StoreContext.Provider>
  );
};

export { StoreContext, StoreDataProvider };

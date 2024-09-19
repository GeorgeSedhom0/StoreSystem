import { createContext, useState, useEffect } from "react";

interface SettingDataType {
  showExpandedBills: boolean;
}

interface SettingsContextType {
  settingsData: SettingDataType;
  updateSetting: (e: SettingDataType) => void;
}

const initialSettingContext: SettingsContextType = {
  updateSetting: () => { },
  settingsData: {
    showExpandedBills: false
  }
}

const SettingsContext = createContext<SettingsContextType>(initialSettingContext);

const SettingsDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [settingsData, setSettingsData] = useState<SettingDataType>({ showExpandedBills: false });

  const handleUpdateSetting = (updatedSetting: SettingDataType) => {
    setSettingsData(updatedSetting);
    localStorage.setItem('settingsData', JSON.stringify(updatedSetting));
  }

  useEffect(() => {
    const lastSettingsData = localStorage.getItem('settingsData');
    if (lastSettingsData) {
      handleUpdateSetting(JSON.parse(lastSettingsData));
    }

  }, []);

  return (
    <SettingsContext.Provider
      value={{
        updateSetting: handleUpdateSetting,
        settingsData: settingsData
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export { SettingsContext, SettingsDataProvider };

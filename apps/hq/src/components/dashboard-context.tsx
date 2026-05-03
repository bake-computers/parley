import { createContext, useContext, useState, useCallback } from "react";

type DashboardContextValue = {
  selectedGuildId: string | null | undefined;
  setSelectedGuildId: (guildId: string | null | undefined) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
};

const DashboardContext = createContext<DashboardContextValue>({
  selectedGuildId: undefined,
  setSelectedGuildId: () => {},
  mobileSidebarOpen: false,
  setMobileSidebarOpen: () => {},
  toggleMobileSidebar: () => {},
});

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [selectedGuildId, setSelectedGuildId] = useState<string | null | undefined>(undefined);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        selectedGuildId,
        setSelectedGuildId,
        mobileSidebarOpen,
        setMobileSidebarOpen,
        toggleMobileSidebar,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  return useContext(DashboardContext);
}

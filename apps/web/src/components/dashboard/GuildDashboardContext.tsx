import { createContext, useContext } from "react";
import type { GuildSettingsBundleJson } from "#/lib/dashboard/api-types";

export type GuildDashboardGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
};

export type GuildDashboardUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

type GuildDashboardContextValue = {
  guildId: string;
  guild: GuildDashboardGuild;
  user: GuildDashboardUser;
  settings: GuildSettingsBundleJson;
  patchSettings: (partial: Partial<GuildSettingsBundleJson>) => void;
};

const GuildDashboardContext = createContext<GuildDashboardContextValue | null>(null);

export function GuildDashboardProvider({
  value,
  children,
}: {
  value: GuildDashboardContextValue;
  children: React.ReactNode;
}) {
  return <GuildDashboardContext.Provider value={value}>{children}</GuildDashboardContext.Provider>;
}

export function useGuildDashboard() {
  const ctx = useContext(GuildDashboardContext);
  if (!ctx) {
    throw new Error("useGuildDashboard must be used within GuildDashboardProvider");
  }
  return ctx;
}

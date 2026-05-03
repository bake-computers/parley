import { useQuery } from "@tanstack/react-query";
import { getGuildAccessForUser } from "#/lib/server/guild-access";
import type { GuildAccessResult } from "#/lib/server/guild-access";

export type { GuildAccessResult };

export interface GuildInfo {
  id: string;
  name: string | null;
  icon: string | null;
  permissions: number;
}

export function useGuildAccess(enabled = true) {
  const query = useQuery({
    queryKey: ["guild-access"],
    queryFn: () => getGuildAccessForUser(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const result = query.data ?? { guilds: [], isGlobalAdmin: false };

  return {
    guilds: result.guilds as GuildInfo[],
    adminGuilds: result.guilds as GuildInfo[],
    isGlobalAdmin: result.isGlobalAdmin,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

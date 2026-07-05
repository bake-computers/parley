import { buildBotInviteUrl, botInstalledGuildIds } from "./bot.js";
import type { CookieGuild, PublicGuild } from "./oauth.js";
import { canManageCookieGuild } from "./permissions.js";

export async function publicGuildsForDashboard(
  guilds: CookieGuild[],
  clientId: string,
  botToken?: string,
): Promise<PublicGuild[]> {
  const manageable = guilds.filter(canManageCookieGuild);
  const installed =
    botToken && manageable.length > 0
      ? await botInstalledGuildIds(
          botToken,
          manageable.map((g) => g.id),
        )
      : new Set<string>();

  return sortDashboardGuilds(
    guilds.map((g) => {
      const canManage = canManageCookieGuild(g);
      const parleyInstalled = canManage && installed.has(g.id);
      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        canManage,
        parleyInstalled,
        inviteUrl: canManage && !parleyInstalled ? buildBotInviteUrl(clientId, g.id) : null,
      };
    }),
  );
}

function guildSortKey(g: PublicGuild): number {
  if (g.canManage && !g.parleyInstalled) {
    return 0;
  }
  if (g.canManage) {
    return 1;
  }
  return 2;
}

export function sortDashboardGuilds(guilds: PublicGuild[]): PublicGuild[] {
  return [...guilds].sort(
    (a, b) => guildSortKey(a) - guildSortKey(b) || a.name.localeCompare(b.name),
  );
}

export function partitionDashboardGuilds(guilds: PublicGuild[]): {
  primary: PublicGuild[];
  other: PublicGuild[];
} {
  const sorted = sortDashboardGuilds(guilds);
  return {
    primary: sorted.filter((g) => g.canManage),
    other: sorted.filter((g) => !g.canManage),
  };
}

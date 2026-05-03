import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createDashboardAuth } from "./auth";
import {
  readGuildAccess,
  filterGuildsByPermissions,
  isGlobalAdmin,
  readDiscordAccountIdForUser,
} from "@parley/auth";
import type { GuildWithPermissions } from "@parley/auth";
import { withDb } from "./db";

export interface GuildAccessResult {
  guilds: GuildWithPermissions[];
  adminGuilds: GuildWithPermissions[];
  isGlobalAdmin: boolean;
}

export const getGuildAccessForUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<GuildAccessResult> => {
    const headers = getRequestHeaders();
    return withDb(async (db) => {
      const auth = createDashboardAuth(db);
      const session = await auth.api.getSession({ headers });
      if (!session) return { guilds: [], adminGuilds: [], isGlobalAdmin: false };

      const discordUserId = await readDiscordAccountIdForUser(db, session.user.id);
      if (!discordUserId) return { guilds: [], adminGuilds: [], isGlobalAdmin: false };

      const allGuilds = await readGuildAccess(auth, db, headers);
      const adminGuilds = filterGuildsByPermissions(allGuilds);

      return {
        guilds: allGuilds,
        adminGuilds,
        isGlobalAdmin: isGlobalAdmin(discordUserId),
      };
    });
  },
);

import { eq, desc } from "drizzle-orm";
import { guildSettings, guildPlayers, players } from "@parley/db/schema";
import { withDb } from "./db";
import { readDashboardSession } from "./auth";

interface GuildSettingsInput {
  defaultTeamFormat?: string;
  autoBalance?: boolean;
  crossGuildMatchmaking?: boolean;
}

interface GuildSettingsRow {
  guildId: string;
  defaultTeamFormat: string | null;
  autoBalance: boolean;
  crossGuildMatchmaking: boolean;
  updatedAt: number;
  updatedByDiscordUserId: string;
}

interface GuildPlayerRow {
  id: number;
  guildId: string;
  discordUserId: string;
  playerId: number;
  createdAt: number;
  updatedAt: number;
  username: string;
  platform: string;
  level: number;
  internalElo: number;
  internalMatches: number;
}

function getGuildSettingsCacheKey(guildId: string): string {
  return `guild_settings:${guildId}`;
}

async function getCachedGuildSettings(guildId: string): Promise<GuildSettingsRow | null> {
  try {
    const cache = await caches.open("default");
    const key = getGuildSettingsCacheKey(guildId);
    const response = await cache.match(key);
    if (response) {
      return await response.json<GuildSettingsRow>();
    }
  } catch {}
  return null;
}

async function setCachedGuildSettings(settings: GuildSettingsRow): Promise<void> {
  try {
    const cache = await caches.open("default");
    const key = getGuildSettingsCacheKey(settings.guildId);
    const response = new Response(JSON.stringify(settings), {
      headers: { "Content-Type": "application/json" },
    });
    await cache.put(key, response);
  } catch {}
}

async function invalidateGuildSettingsCache(guildId: string): Promise<void> {
  try {
    const cache = await caches.open("default");
    const key = getGuildSettingsCacheKey(guildId);
    await cache.delete(key);
  } catch {}
}

export async function getGuildSettings(
  headers: Headers,
  guildId: string,
): Promise<GuildSettingsRow | null> {
  const cached = await getCachedGuildSettings(guildId);
  if (cached) {
    return cached;
  }

  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const rows = await db
      .select({
        guildId: guildSettings.guildId,
        defaultTeamFormat: guildSettings.defaultTeamFormat,
        autoBalance: guildSettings.autoBalance,
        crossGuildMatchmaking: guildSettings.crossGuildMatchmaking,
        updatedAt: guildSettings.updatedAt,
        updatedByDiscordUserId: guildSettings.updatedByDiscordUserId,
      })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1);

    const settings = rows[0] ?? null;
    if (settings) {
      await setCachedGuildSettings(settings);
    }
    return settings;
  }).catch(() => null);
}

export async function upsertGuildSettings(
  headers: Headers,
  guildId: string,
  input: GuildSettingsInput,
): Promise<GuildSettingsRow | null> {
  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    await db
      .insert(guildSettings)
      .values({
        guildId,
        defaultTeamFormat: input.defaultTeamFormat ?? null,
        autoBalance: input.autoBalance ?? true,
        crossGuildMatchmaking: input.crossGuildMatchmaking ?? true,
        updatedAt: now,
        updatedByDiscordUserId: access.discordUserId,
      })
      .onConflictDoUpdate({
        target: guildSettings.guildId,
        set: {
          defaultTeamFormat: input.defaultTeamFormat ?? null,
          autoBalance: input.autoBalance ?? true,
          crossGuildMatchmaking: input.crossGuildMatchmaking ?? true,
          updatedAt: now,
          updatedByDiscordUserId: access.discordUserId,
        },
      });

    await invalidateGuildSettingsCache(guildId);

    const rows = await db
      .select({
        guildId: guildSettings.guildId,
        defaultTeamFormat: guildSettings.defaultTeamFormat,
        autoBalance: guildSettings.autoBalance,
        crossGuildMatchmaking: guildSettings.crossGuildMatchmaking,
        updatedAt: guildSettings.updatedAt,
        updatedByDiscordUserId: guildSettings.updatedByDiscordUserId,
      })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1);

    const settings = rows[0] ?? null;
    if (settings) {
      await setCachedGuildSettings(settings);
    }
    return settings;
  }).catch(() => null);
}

export async function getGuildPlayers(
  headers: Headers,
  guildId: string,
): Promise<GuildPlayerRow[]> {
  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const rows = await db
      .select({
        id: guildPlayers.id,
        guildId: guildPlayers.guildId,
        discordUserId: guildPlayers.discordUserId,
        playerId: guildPlayers.playerId,
        createdAt: guildPlayers.createdAt,
        updatedAt: guildPlayers.updatedAt,
        username: players.username,
        platform: players.platform,
        level: players.level,
        internalElo: players.internalElo,
        internalMatches: players.internalMatches,
      })
      .from(guildPlayers)
      .innerJoin(players, eq(guildPlayers.playerId, players.id))
      .where(eq(guildPlayers.guildId, guildId))
      .orderBy(desc(guildPlayers.createdAt));

    return rows;
  }).catch(() => []);
}

import { eq, desc } from "drizzle-orm";
import {
  guildSettings,
  guildLimits,
  guildPlayers,
  players,
  guildMatchRules,
} from "@parley/db/schema";
import { upsertGuildLimit } from "@parley/db/guild-limits";
import { withDb } from "./db";
import { readDashboardSession } from "./auth";

interface GuildSettingsInput {
  dailyMatchLimit?: number;
  defaultTeamFormat?: string;
  autoBalance?: boolean;
  crossGuildMatchmaking?: boolean;
}

interface GuildSettingsRow {
  guildId: string;
  dailyMatchLimit: number | null;
  defaultTeamFormat: string | null;
  autoBalance: boolean;
  crossGuildMatchmaking: boolean;
  updatedAt: number;
  updatedByDiscordUserId: string;
}

interface GuildMatchRulesRow {
  guildId: string;
  minElo: number | null;
  maxElo: number | null;
  platforms: string[] | null;
  requireVerified: boolean;
  maxEloGap: number;
  updatedAt: number;
}

interface GuildMatchRulesInput {
  minElo?: number | null;
  maxElo?: number | null;
  platforms?: string[] | null;
  requireVerified?: boolean;
  maxEloGap?: number;
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
  internalWins: number;
  internalLosses: number;
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

function getGuildMatchRulesCacheKey(guildId: string): string {
  return `guild_match_rules:${guildId}`;
}

async function getCachedGuildMatchRules(guildId: string): Promise<GuildMatchRulesRow | null> {
  try {
    const cache = await caches.open("default");
    const key = getGuildMatchRulesCacheKey(guildId);
    const response = await cache.match(key);
    if (response) {
      return await response.json<GuildMatchRulesRow>();
    }
  } catch {}
  return null;
}

async function setCachedGuildMatchRules(rules: GuildMatchRulesRow): Promise<void> {
  try {
    const cache = await caches.open("default");
    const key = getGuildMatchRulesCacheKey(rules.guildId);
    const response = new Response(JSON.stringify(rules), {
      headers: { "Content-Type": "application/json" },
    });
    await cache.put(key, response);
  } catch {}
}

async function invalidateGuildMatchRulesCache(guildId: string): Promise<void> {
  try {
    const cache = await caches.open("default");
    const key = getGuildMatchRulesCacheKey(guildId);
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

    const [settingsRows, limitRows] = await Promise.all([
      db
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
        .limit(1),
      db
        .select({ dailyMatchLimit: guildLimits.dailyMatchLimit })
        .from(guildLimits)
        .where(eq(guildLimits.guildId, guildId))
        .limit(1),
    ]);

    const settings = settingsRows[0] ?? null;
    const limit = limitRows[0] ?? null;
    const result: GuildSettingsRow | null = settings
      ? {
          ...settings,
          dailyMatchLimit: limit?.dailyMatchLimit ?? null,
        }
      : null;

    if (result) {
      await setCachedGuildSettings(result);
    }
    return result;
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

    if (input.dailyMatchLimit !== undefined) {
      await upsertGuildLimit(db, {
        guildId,
        dailyMatchLimit: input.dailyMatchLimit,
        updatedByDiscordUserId: access.discordUserId,
      });
    }

    await invalidateGuildSettingsCache(guildId);

    const [settingsRows, limitRows] = await Promise.all([
      db
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
        .limit(1),
      db
        .select({ dailyMatchLimit: guildLimits.dailyMatchLimit })
        .from(guildLimits)
        .where(eq(guildLimits.guildId, guildId))
        .limit(1),
    ]);

    const settings = settingsRows[0] ?? null;
    const limit = limitRows[0] ?? null;
    const result: GuildSettingsRow | null = settings
      ? {
          ...settings,
          dailyMatchLimit: limit?.dailyMatchLimit ?? null,
        }
      : null;

    if (result) {
      await setCachedGuildSettings(result);
    }
    return result;
  }).catch(() => null);
}

export async function getGuildMatchRules(
  headers: Headers,
  guildId: string,
): Promise<GuildMatchRulesRow | null> {
  const cached = await getCachedGuildMatchRules(guildId);
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
        guildId: guildMatchRules.guildId,
        minElo: guildMatchRules.minElo,
        maxElo: guildMatchRules.maxElo,
        platforms: guildMatchRules.platforms,
        requireVerified: guildMatchRules.requireVerified,
        maxEloGap: guildMatchRules.maxEloGap,
        updatedAt: guildMatchRules.updatedAt,
      })
      .from(guildMatchRules)
      .where(eq(guildMatchRules.guildId, guildId))
      .limit(1);

    const rules = rows[0] ?? null;
    if (rules) {
      await setCachedGuildMatchRules(rules);
    }
    return rules;
  }).catch(() => null);
}

export async function upsertGuildMatchRules(
  headers: Headers,
  guildId: string,
  input: GuildMatchRulesInput,
): Promise<GuildMatchRulesRow | null> {
  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    await db
      .insert(guildMatchRules)
      .values({
        guildId,
        minElo: input.minElo ?? null,
        maxElo: input.maxElo ?? null,
        platforms: input.platforms ?? null,
        requireVerified: input.requireVerified ?? false,
        maxEloGap: input.maxEloGap ?? 500,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: guildMatchRules.guildId,
        set: {
          minElo: input.minElo ?? null,
          maxElo: input.maxElo ?? null,
          platforms: input.platforms ?? null,
          requireVerified: input.requireVerified ?? false,
          maxEloGap: input.maxEloGap ?? 500,
          updatedAt: now,
        },
      });

    await invalidateGuildMatchRulesCache(guildId);

    const rows = await db
      .select({
        guildId: guildMatchRules.guildId,
        minElo: guildMatchRules.minElo,
        maxElo: guildMatchRules.maxElo,
        platforms: guildMatchRules.platforms,
        requireVerified: guildMatchRules.requireVerified,
        maxEloGap: guildMatchRules.maxEloGap,
        updatedAt: guildMatchRules.updatedAt,
      })
      .from(guildMatchRules)
      .where(eq(guildMatchRules.guildId, guildId))
      .limit(1);

    const rules = rows[0] ?? null;
    if (rules) {
      await setCachedGuildMatchRules(rules);
    }
    return rules;
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
        internalWins: players.internalWins,
        internalLosses: players.internalLosses,
      })
      .from(guildPlayers)
      .innerJoin(players, eq(guildPlayers.playerId, players.id))
      .where(eq(guildPlayers.guildId, guildId))
      .orderBy(desc(guildPlayers.createdAt));

    return rows;
  }).catch(() => []);
}

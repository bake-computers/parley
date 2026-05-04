import { count, desc, eq } from "drizzle-orm";
import type { DbClient } from "./client";
import { customMatches, guildLimits, guildPlayers, guildSettings, tournaments } from "./schema";

export async function hasBotInGuild(
  database: DbClient | null | undefined,
  guildId: string,
): Promise<boolean> {
  if (!database) return false;

  const db = database;

  const [settingsRow, limitsRow, playersRow, matchesRow] = await Promise.all([
    db
      .select({ guildId: guildSettings.guildId })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
    db
      .select({ guildId: guildLimits.guildId })
      .from(guildLimits)
      .where(eq(guildLimits.guildId, guildId))
      .limit(1),
    db
      .select({ guildId: guildPlayers.guildId })
      .from(guildPlayers)
      .where(eq(guildPlayers.guildId, guildId))
      .limit(1),
    db
      .select({ guildId: customMatches.guildId })
      .from(customMatches)
      .where(eq(customMatches.guildId, guildId))
      .limit(1),
  ]);

  return (
    settingsRow.length > 0 || limitsRow.length > 0 || playersRow.length > 0 || matchesRow.length > 0
  );
}

export async function getGuildDashboardData(
  database: DbClient | null | undefined,
  guildId: string,
): Promise<{
  settings: {
    defaultTeamFormat: string | null;
    autoBalance: boolean;
    crossGuildMatchmaking: boolean;
    updatedAt: number;
    updatedByDiscordUserId: string;
  } | null;
  limits: {
    dailyMatchLimit: number;
    updatedAt: number;
    updatedByDiscordUserId: string;
  } | null;
  stats: {
    playerCount: number;
    matchCount: number;
    tournamentCount: number;
  };
} | null> {
  if (!database) return null;

  const db = database;

  const [settingsRows, limitsRows, playerCountRows, matchCountRows, tournamentCountRows] =
    await Promise.all([
      db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).limit(1),
      db.select().from(guildLimits).where(eq(guildLimits.guildId, guildId)).limit(1),
      db.select({ value: count() }).from(guildPlayers).where(eq(guildPlayers.guildId, guildId)),
      db.select({ value: count() }).from(customMatches).where(eq(customMatches.guildId, guildId)),
      db
        .select({ value: count() })
        .from(tournaments)
        .where(eq(tournaments.createdByGuildId, guildId)),
    ]);

  const settings = settingsRows[0] ?? null;
  const limits = limitsRows[0] ?? null;

  return {
    settings: settings
      ? {
          defaultTeamFormat: settings.defaultTeamFormat,
          autoBalance: settings.autoBalance,
          crossGuildMatchmaking: settings.crossGuildMatchmaking,
          updatedAt: settings.updatedAt,
          updatedByDiscordUserId: settings.updatedByDiscordUserId,
        }
      : null,
    limits: limits
      ? {
          dailyMatchLimit: limits.dailyMatchLimit,
          updatedAt: limits.updatedAt,
          updatedByDiscordUserId: limits.updatedByDiscordUserId,
        }
      : null,
    stats: {
      playerCount: playerCountRows[0]?.value ?? 0,
      matchCount: matchCountRows[0]?.value ?? 0,
      tournamentCount: tournamentCountRows[0]?.value ?? 0,
    },
  };
}

export interface DashboardMatch {
  id: number;
  status: string;
  matchType: string;
  teamASeedTotal: number;
  teamBSeedTotal: number;
  winningTeam: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MatchHistoryResult {
  matches: DashboardMatch[];
  total: number;
}

export async function getGuildMatchHistory(
  database: DbClient | null | undefined,
  guildId: string,
  page: number,
  pageSize: number,
): Promise<MatchHistoryResult> {
  if (!database) {
    return { matches: [], total: 0 };
  }

  const db = database;
  const offset = (page - 1) * pageSize;

  const [totalRows, matchRows] = await Promise.all([
    db.select({ value: count() }).from(customMatches).where(eq(customMatches.guildId, guildId)),
    db
      .select()
      .from(customMatches)
      .where(eq(customMatches.guildId, guildId))
      .orderBy(desc(customMatches.createdAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = totalRows[0]?.value ?? 0;

  return {
    matches: matchRows.map((m) => ({
      id: m.id,
      status: m.status,
      matchType: m.matchType,
      teamASeedTotal: m.teamASeedTotal,
      teamBSeedTotal: m.teamBSeedTotal,
      winningTeam: m.winningTeam,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
    total,
  };
}

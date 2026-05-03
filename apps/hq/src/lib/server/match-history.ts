import { eq, and, desc, gte, lte } from "drizzle-orm";
import { customMatches, customMatchPlayers, players } from "@parley/db/schema";
import { withDb } from "./db";
import { readDashboardSession } from "./auth";

interface MatchHistoryFilters {
  period?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface MatchHistoryRow {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string;
  createdByDiscordUserId: string;
  status: string;
  matchType: string;
  opponentGuildId: string | null;
  opponentChannelId: string | null;
  opponentMessageId: string | null;
  teamASeedTotal: number;
  teamBSeedTotal: number;
  seedGap: number;
  winningTeam: string | null;
  resolutionType: string;
  createdAt: number;
  updatedAt: number;
  playerCount: number;
  teamAKills: number;
  teamBKills: number;
}

interface PlayerStatsRow {
  playerId: number;
  username: string;
  platform: string;
  level: number;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  internalUpdatedAt: number | null;
  winRate: number;
}

function parsePeriodToTimestamps(period?: string): { start: number; end: number } {
  const end = Date.now();
  let days = 30;
  if (period === "7d") {
    days = 7;
  } else if (period === "90d") {
    days = 90;
  }
  const start = end - days * 24 * 60 * 60 * 1000;
  return { start, end };
}

export async function getMatchHistory(
  headers: Headers,
  guildId: string,
  filters: MatchHistoryFilters = {},
): Promise<{ matches: MatchHistoryRow[]; total: number }> {
  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = filters.offset ?? 0;
  const { start, end } = parsePeriodToTimestamps(filters.period);

  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const conditions = [
      eq(customMatches.guildId, guildId),
      gte(customMatches.createdAt, start),
      lte(customMatches.createdAt, end),
    ];

    if (filters.status && filters.status !== "all") {
      conditions.push(eq(customMatches.status, filters.status));
    }

    const countResult = await db
      .select({ count: customMatches.id })
      .from(customMatches)
      .where(and(...conditions));

    const total = countResult.length;

    const matchRows = await db
      .select({
        id: customMatches.id,
        guildId: customMatches.guildId,
        channelId: customMatches.channelId,
        messageId: customMatches.messageId,
        createdByDiscordUserId: customMatches.createdByDiscordUserId,
        status: customMatches.status,
        matchType: customMatches.matchType,
        opponentGuildId: customMatches.opponentGuildId,
        opponentChannelId: customMatches.opponentChannelId,
        opponentMessageId: customMatches.opponentMessageId,
        teamASeedTotal: customMatches.teamASeedTotal,
        teamBSeedTotal: customMatches.teamBSeedTotal,
        seedGap: customMatches.seedGap,
        winningTeam: customMatches.winningTeam,
        resolutionType: customMatches.resolutionType,
        createdAt: customMatches.createdAt,
        updatedAt: customMatches.updatedAt,
      })
      .from(customMatches)
      .where(and(...conditions))
      .orderBy(desc(customMatches.createdAt))
      .limit(limit)
      .offset(offset);

    const matchIds = matchRows.map((m) => m.id);

    if (matchIds.length === 0) {
      return { matches: [], total };
    }

    const playerCounts = await db
      .select({
        matchId: customMatchPlayers.matchId,
      })
      .from(customMatchPlayers)
      .where(eq(customMatchPlayers.matchId, matchIds[0]!));

    const playerCountByMatch = new Map<number, number>();
    for (const row of playerCounts) {
      const current = playerCountByMatch.get(row.matchId) ?? 0;
      playerCountByMatch.set(row.matchId, current + 1);
    }

    const killsByMatchAndTeam = await db
      .select({
        matchId: customMatchPlayers.matchId,
        team: customMatchPlayers.team,
        kills: customMatchPlayers.kills,
      })
      .from(customMatchPlayers)
      .where(and(eq(customMatchPlayers.matchId, matchIds[0]!)));

    const killsMap = new Map<string, number>();
    for (const row of killsByMatchAndTeam) {
      const key = `${row.matchId}:${row.team}`;
      killsMap.set(key, (killsMap.get(key) ?? 0) + (row.kills ?? 0));
    }

    const matches: MatchHistoryRow[] = matchRows.map((m) => ({
      ...m,
      playerCount: playerCountByMatch.get(m.id) ?? 0,
      teamAKills: killsMap.get(`${m.id}:A`) ?? 0,
      teamBKills: killsMap.get(`${m.id}:B`) ?? 0,
    }));

    return { matches, total };
  }).catch(() => ({ matches: [], total: 0 }));
}

export async function getPlayerStats(
  headers: Headers,
  playerId: number,
): Promise<PlayerStatsRow | null> {
  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const rows = await db
      .select({
        playerId: players.id,
        username: players.username,
        platform: players.platform,
        level: players.level,
        internalElo: players.internalElo,
        internalMatches: players.internalMatches,
        internalWins: players.internalWins,
        internalLosses: players.internalLosses,
        internalUpdatedAt: players.internalUpdatedAt,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    const player = rows[0];
    if (!player) {
      return null;
    }

    const winRate =
      player.internalMatches > 0 ? (player.internalWins / player.internalMatches) * 100 : 0;

    return {
      ...player,
      winRate,
    };
  }).catch(() => null);
}

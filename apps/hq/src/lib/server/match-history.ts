import { eq, and, desc, gte, lte, inArray, like, sql } from "drizzle-orm";
import { customMatches, customMatchPlayers, players } from "@parley/db/schema";
import { withDb } from "./db";
import { readDashboardSession } from "./auth";

interface MatchHistoryFilters {
  period?: string;
  status?: string;
  winningTeam?: string;
  search?: string;
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

interface MatchAnalytics {
  eloTrend: { date: string; avgElo: number }[];
  winRate: { name: string; value: number }[];
  matchesPerDay: { date: string; count: number }[];
  topPlayers: { username: string; platform: string; eloGain: number }[];
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

    if (filters.winningTeam && filters.winningTeam !== "all") {
      if (filters.winningTeam === "draw") {
        conditions.push(sql`${customMatches.winningTeam} IS NULL`);
      } else {
        conditions.push(eq(customMatches.winningTeam, filters.winningTeam));
      }
    }

    if (filters.search && filters.search.trim().length > 0) {
      const searchTerm = `%${filters.search.trim()}%`;
      const matchingPlayers = await db
        .selectDistinct({ matchId: customMatchPlayers.matchId })
        .from(customMatchPlayers)
        .innerJoin(players, eq(customMatchPlayers.playerId, players.id))
        .where(like(players.username, searchTerm));

      if (matchingPlayers.length === 0) {
        return { matches: [], total: 0 };
      }

      conditions.push(
        inArray(
          customMatches.id,
          matchingPlayers.map((m) => m.matchId),
        ),
      );
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
      .where(inArray(customMatchPlayers.matchId, matchIds));

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
      .where(inArray(customMatchPlayers.matchId, matchIds));

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

export async function getMatchAnalytics(
  headers: Headers,
  guildId: string,
  period?: string,
): Promise<MatchAnalytics> {
  const { start, end } = parsePeriodToTimestamps(period);

  return withDb(async (db) => {
    const access = await readDashboardSession(db, headers);
    if (access.status !== "authorized") {
      throw new Error("Unauthorized");
    }

    const matchRows = await db
      .select({
        id: customMatches.id,
        teamASeedTotal: customMatches.teamASeedTotal,
        teamBSeedTotal: customMatches.teamBSeedTotal,
        winningTeam: customMatches.winningTeam,
        createdAt: customMatches.createdAt,
      })
      .from(customMatches)
      .where(
        and(
          eq(customMatches.guildId, guildId),
          gte(customMatches.createdAt, start),
          lte(customMatches.createdAt, end),
        ),
      )
      .orderBy(desc(customMatches.createdAt));

    const eloTrendMap = new Map<string, { sum: number; count: number }>();
    const matchesPerDayMap = new Map<string, number>();
    const winCounts = { A: 0, B: 0, other: 0 };

    for (const match of matchRows) {
      const date = new Date(match.createdAt).toISOString().split("T")[0]!;

      const avgElo = (match.teamASeedTotal + match.teamBSeedTotal) / 2;
      const existing = eloTrendMap.get(date);
      if (existing) {
        existing.sum += avgElo;
        existing.count += 1;
      } else {
        eloTrendMap.set(date, { sum: avgElo, count: 1 });
      }

      matchesPerDayMap.set(date, (matchesPerDayMap.get(date) ?? 0) + 1);

      if (match.winningTeam === "A") winCounts.A++;
      else if (match.winningTeam === "B") winCounts.B++;
      else winCounts.other++;
    }

    const eloTrend = Array.from(eloTrendMap.entries())
      .map(([date, { sum, count }]) => ({ date, avgElo: Math.round(sum / count) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const matchesPerDay = Array.from(matchesPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const winRate = [
      { name: "Team A Wins", value: winCounts.A },
      { name: "Team B Wins", value: winCounts.B },
      { name: "Draw / Unresolved", value: winCounts.other },
    ].filter((item) => item.value > 0);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentMatchIds = matchRows.filter((m) => m.createdAt >= sevenDaysAgo).map((m) => m.id);

    let topPlayers: { username: string; platform: string; eloGain: number }[] = [];

    if (recentMatchIds.length > 0) {
      const playerResults = await db
        .select({
          matchId: customMatchPlayers.matchId,
          team: customMatchPlayers.team,
          username: players.username,
          platform: players.platform,
        })
        .from(customMatchPlayers)
        .innerJoin(players, eq(customMatchPlayers.playerId, players.id))
        .where(inArray(customMatchPlayers.matchId, recentMatchIds));

      const playerStats = new Map<
        string,
        { username: string; platform: string; wins: number; losses: number }
      >();

      const matchWinners = new Map<number, string | null>();
      for (const m of matchRows) {
        if (m.createdAt >= sevenDaysAgo) {
          matchWinners.set(m.id, m.winningTeam);
        }
      }

      for (const row of playerResults) {
        const winner = matchWinners.get(row.matchId);
        if (!winner) continue;

        const key = `${row.username}:${row.platform}`;
        let stats = playerStats.get(key);
        if (!stats) {
          stats = { username: row.username, platform: row.platform, wins: 0, losses: 0 };
          playerStats.set(key, stats);
        }

        if (winner === row.team) {
          stats.wins++;
        } else {
          stats.losses++;
        }
      }

      topPlayers = Array.from(playerStats.values())
        .map((p) => ({
          username: p.username,
          platform: p.platform,
          eloGain: p.wins * 25 - p.losses * 25,
        }))
        .filter((p) => p.eloGain !== 0)
        .sort((a, b) => b.eloGain - a.eloGain)
        .slice(0, 10);
    }

    return { eloTrend, winRate, matchesPerDay, topPlayers };
  }).catch(() => ({ eloTrend: [], winRate: [], matchesPerDay: [], topPlayers: [] }));
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

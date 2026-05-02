import { and, asc, count, desc, eq, gte } from "drizzle-orm";
import type { DbClient } from "./client";
import { discordAccounts, players } from "./schema";

export type LeaderboardPlatformFilter = "all" | "pc" | "xbox" | "playstation";

export interface GlobalLeaderboardQueryInput {
  platform: LeaderboardPlatformFilter;
  minMatches: number;
  limit: number;
  offset: number;
}

export interface GlobalLeaderboardEntry {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  discordUserId: string | null;
}

function buildLeaderboardConditions(input: {
  platform: LeaderboardPlatformFilter;
  minMatches: number;
}) {
  const conditions = [gte(players.internalMatches, Math.max(0, Math.trunc(input.minMatches)))];

  if (input.platform !== "all") {
    conditions.push(eq(players.platform, input.platform));
  }

  return and(...conditions);
}

export async function listGlobalLeaderboardPage(
  database: DbClient | null | undefined,
  input: GlobalLeaderboardQueryInput,
): Promise<GlobalLeaderboardEntry[]> {
  if (!database) {
    return [];
  }

  const limit = Math.max(1, Math.min(25, Math.trunc(input.limit)));
  const offset = Math.max(0, Math.trunc(input.offset));

  const rows = await database
    .select({
      playerId: players.id,
      username: players.username,
      platform: players.platform,
      internalElo: players.internalElo,
      internalMatches: players.internalMatches,
      internalWins: players.internalWins,
      internalLosses: players.internalLosses,
      discordUserId: discordAccounts.discordUserId,
    })
    .from(players)
    .leftJoin(discordAccounts, eq(discordAccounts.playerId, players.id))
    .where(
      buildLeaderboardConditions({
        platform: input.platform,
        minMatches: input.minMatches,
      }),
    )
    .orderBy(
      desc(players.internalElo),
      desc(players.internalMatches),
      asc(players.username),
      asc(players.id),
    )
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    playerId: row.playerId,
    username: row.username,
    platform: row.platform,
    internalElo: row.internalElo,
    internalMatches: row.internalMatches,
    internalWins: row.internalWins,
    internalLosses: row.internalLosses,
    discordUserId: row.discordUserId,
  }));
}

export async function countGlobalLeaderboard(
  database: DbClient | null | undefined,
  input: Pick<GlobalLeaderboardQueryInput, "platform" | "minMatches">,
): Promise<number> {
  if (!database) {
    return 0;
  }

  const rows = await database
    .select({
      total: count(players.id),
    })
    .from(players)
    .where(
      buildLeaderboardConditions({
        platform: input.platform,
        minMatches: input.minMatches,
      }),
    );

  return Number(rows[0]?.total ?? 0);
}

import { count, eq, gte } from "drizzle-orm";
import type { DbClient } from "./client";
import { customMatches, guildPlayers, players, tournaments } from "./schema";

export interface AggregateStats {
  totalPlayers: number;
  matchesToday: number;
  tournamentsCompleted: number;
  serverCount: number;
}

export async function getAggregateStats(
  database: DbClient | null | undefined,
  todayMs: number,
): Promise<AggregateStats> {
  if (!database) {
    return { totalPlayers: 0, matchesToday: 0, tournamentsCompleted: 0, serverCount: 0 };
  }

  const [playersResult, matchesResult, tournamentsResult, serversResult] = await Promise.all([
    database.select({ count: count(players.id) }).from(players),
    database
      .select({ count: count(customMatches.id) })
      .from(customMatches)
      .where(gte(customMatches.createdAt, todayMs)),
    database
      .select({ count: count(tournaments.id) })
      .from(tournaments)
      .where(eq(tournaments.status, "completed")),
    database.select({ count: count(guildPlayers.id) }).from(guildPlayers),
  ]);

  return {
    totalPlayers: Number(playersResult[0]?.count ?? 0),
    matchesToday: Number(matchesResult[0]?.count ?? 0),
    tournamentsCompleted: Number(tournamentsResult[0]?.count ?? 0),
    serverCount: Number(serversResult[0]?.count ?? 0),
  };
}

import { and, eq } from "drizzle-orm";
import type { DbClient } from "@parley/db/client";
import { players } from "@parley/db/schema";
import { normalizePlayerUsername } from "../player/identity";

export const EXTERNAL_STATS_REFRESH_INTERNAL_MATCH_CAP = 10;

export interface InternalPlayerSummary {
  playerId: number;
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  internalUpdatedAt: number | null;
}

function toInternalPlayerSummary(
  row: typeof players.$inferSelect | undefined,
): InternalPlayerSummary | null {
  if (!row) {
    return null;
  }

  return {
    playerId: row.id,
    username: row.username,
    platform: row.platform,
    internalElo: row.internalElo,
    internalMatches: row.internalMatches,
    internalWins: row.internalWins,
    internalLosses: row.internalLosses,
    internalUpdatedAt: row.internalUpdatedAt,
  };
}

export function isExternalStatsRefreshLocked(summary: InternalPlayerSummary | null): boolean {
  return (summary?.internalMatches ?? 0) >= EXTERNAL_STATS_REFRESH_INTERNAL_MATCH_CAP;
}

export async function getInternalPlayerSummaryByPlayerId(
  database: DbClient | null | undefined,
  playerId: number,
): Promise<InternalPlayerSummary | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const rows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return toInternalPlayerSummary(rows[0]);
}

export async function getInternalPlayerSummaryByIdentity(
  database: DbClient | null | undefined,
  username: string,
  platform: string,
): Promise<InternalPlayerSummary | null> {
  if (!database) {
    return null;
  }

  const db = database;
  const normalizedUsername = normalizePlayerUsername(username);
  const rows =
    platform === "auto"
      ? await db.select().from(players).where(eq(players.usernameNormalized, normalizedUsername))
      : await db
          .select()
          .from(players)
          .where(
            and(eq(players.usernameNormalized, normalizedUsername), eq(players.platform, platform)),
          )
          .limit(1);

  const [bestMatch] = [...rows].sort((left, right) => {
    if (right.internalMatches !== left.internalMatches) {
      return right.internalMatches - left.internalMatches;
    }
    return right.updatedAt - left.updatedAt;
  });
  return toInternalPlayerSummary(bestMatch);
}

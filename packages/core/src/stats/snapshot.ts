import { and, eq } from "drizzle-orm";
import type { DbClient } from "@parley/db/client";
import { players, statSnapshots } from "@parley/db/schema";
import { seedScoreToInternalElo } from "../lib/elo";
import { calculateSeedMetrics } from "../team/balance";

type DataMap = Record<string, unknown>;

export interface PersistStatsSnapshotInput {
  profile: DataMap;
  rankedStats: DataMap;
  calculatedMetrics: DataMap;
  cacheVersion: number;
  fetchedAt: number;
  source: "live" | "refresh";
}

function normalizeUsername(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function toOptionalText(value: unknown): string | null {
  const parsed = toText(value).trim();
  return parsed.length > 0 ? parsed : null;
}

function rankLabel(rank: unknown, tier: unknown): string {
  const rankText = toText(rank, "Unknown").trim();
  const tierText = toText(tier).trim();

  if (!tierText || tierText.toLowerCase() === rankText.toLowerCase()) {
    return rankText;
  }

  return `${rankText} ${tierText}`;
}

async function resolvePlayerId(database: DbClient, profile: DataMap): Promise<number | null> {
  const db = database;

  const profileId = toOptionalText(profile.profile_id);
  const username = toText(profile.username, "unknown");
  const usernameNormalized = normalizeUsername(username);
  const platform = toText(profile.platform, "unknown");
  const profileUrl = toOptionalText(profile.profile_url);
  const level = toNumber(profile.level, 0);
  const now = Date.now();

  if (profileId) {
    await db
      .insert(players)
      .values({
        profileId,
        username,
        usernameNormalized,
        platform,
        profileUrl,
        level,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: players.profileId,
        set: {
          username,
          usernameNormalized,
          platform,
          profileUrl,
          level,
          updatedAt: now,
        },
      });

    const row = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.profileId, profileId))
      .limit(1);

    return row[0]?.id ?? null;
  }

  await db
    .insert(players)
    .values({
      username,
      usernameNormalized,
      platform,
      profileUrl,
      level,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [players.usernameNormalized, players.platform],
      set: {
        username,
        profileUrl,
        level,
        updatedAt: now,
      },
    });

  const row = await db
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.usernameNormalized, usernameNormalized), eq(players.platform, platform)))
    .limit(1);

  return row[0]?.id ?? null;
}

export async function persistStatsSnapshot(
  database: DbClient | null | undefined,
  input: PersistStatsSnapshotInput,
): Promise<void> {
  if (!database) {
    return;
  }

  const db = database;
  const playerId = await resolvePlayerId(database, input.profile);

  if (!playerId) {
    return;
  }

  const ranked = input.rankedStats;
  const payloadJson = JSON.stringify({
    profile: input.profile,
    ranked_stats: input.rankedStats,
    calculated_metrics: input.calculatedMetrics,
  });
  const seedMetrics = calculateSeedMetrics({
    rankPoints: toNumber(ranked.rank_points, 0),
    kdRatio: toNumber(ranked.kd_ratio, 0),
    kost: toNumber(input.calculatedMetrics.kost, 0),
    kills: toNumber(ranked.kills, 0),
    headshotPercentage: toNumber(ranked.headshot_percentage, 0),
    payloadJson,
  });

  await db.insert(statSnapshots).values({
    playerId,
    fetchedAt: input.fetchedAt,
    source: input.source,
    cacheVersion: input.cacheVersion,
    currentRank: rankLabel(ranked.current_rank, ranked.current_rank_tier),
    rankPoints: toNumber(ranked.rank_points, 0),
    matches: toNumber(ranked.matches, 0),
    wins: toNumber(ranked.wins, 0),
    losses: toNumber(ranked.losses, 0),
    kills: toNumber(ranked.kills, 0),
    deaths: toNumber(ranked.deaths, 0),
    assists: toNumber(ranked.assists, 0),
    headshots: toNumber(ranked.headshots, 0),
    kdRatio: toNumber(ranked.kd_ratio, 0),
    headshotPercentage: toNumber(ranked.headshot_percentage, 0),
    winRate: toNumber(ranked.win_rate, 0),
    kost: toNumber(input.calculatedMetrics.kost, 0),
    payloadJson,
    createdAt: Date.now(),
  });

  await db
    .update(players)
    .set({
      internalElo: seedScoreToInternalElo(seedMetrics.seedScore),
      updatedAt: Date.now(),
    })
    .where(and(eq(players.id, playerId), eq(players.internalMatches, 0)));
}

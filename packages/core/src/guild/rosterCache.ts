import type { KVNamespace } from "@cloudflare/workers-types";
import { calculateSeedMetrics, type TeamSeedMetrics } from "../team/balance";
import type { GuildRosterEntry } from "@parley/db/guild-roster";
import { seedScoreToInternalElo } from "../lib/elo";

const GUILD_ROSTER_CACHE_PREFIX = "team:guild-roster:v1";
const GUILD_ROSTER_CACHE_TTL_SECONDS = 5 * 60;

export interface CachedGuildRosterMember {
  guildId: string;
  discordUserId: string;
  playerId: number;
  username: string;
  platform: string;
  profileUrl: string | null;
  level: number;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  internalUpdatedAt: number | null;
  balanceRating: number | null;
  registeredAt: number;
  updatedAt: number;
  ready: boolean;
  snapshotFetchedAt: number | null;
  metrics: TeamSeedMetrics | null;
}

interface CachedGuildRosterEnvelope {
  version: 1;
  cachedAt: number;
  members: CachedGuildRosterMember[];
}

function buildGuildRosterCacheKey(guildId: string): string {
  return `${GUILD_ROSTER_CACHE_PREFIX}:${guildId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseMember(value: unknown): CachedGuildRosterMember | null {
  if (!isObject(value)) {
    return null;
  }

  const metricsValue = value.metrics;
  const metrics =
    isObject(metricsValue) &&
    typeof metricsValue.rankPoints === "number" &&
    typeof metricsValue.kdRatio === "number" &&
    typeof metricsValue.kost === "number" &&
    typeof metricsValue.kpr === "number" &&
    typeof metricsValue.headshotPercentage === "number" &&
    typeof metricsValue.seedScore === "number"
      ? {
          rankPoints: metricsValue.rankPoints,
          kdRatio: metricsValue.kdRatio,
          kost: metricsValue.kost,
          kpr: metricsValue.kpr,
          headshotPercentage: metricsValue.headshotPercentage,
          seedScore: metricsValue.seedScore,
        }
      : null;

  if (
    typeof value.guildId !== "string" ||
    typeof value.discordUserId !== "string" ||
    typeof value.playerId !== "number" ||
    typeof value.username !== "string" ||
    typeof value.platform !== "string" ||
    typeof value.level !== "number" ||
    typeof value.internalElo !== "number" ||
    typeof value.internalMatches !== "number" ||
    typeof value.internalWins !== "number" ||
    typeof value.internalLosses !== "number" ||
    typeof value.registeredAt !== "number" ||
    typeof value.updatedAt !== "number" ||
    typeof value.ready !== "boolean"
  ) {
    return null;
  }

  return {
    guildId: value.guildId,
    discordUserId: value.discordUserId,
    playerId: value.playerId,
    username: value.username,
    platform: value.platform,
    profileUrl: typeof value.profileUrl === "string" ? value.profileUrl : null,
    level: value.level,
    internalElo: value.internalElo,
    internalMatches: value.internalMatches,
    internalWins: value.internalWins,
    internalLosses: value.internalLosses,
    internalUpdatedAt: typeof value.internalUpdatedAt === "number" ? value.internalUpdatedAt : null,
    balanceRating: typeof value.balanceRating === "number" ? value.balanceRating : null,
    registeredAt: value.registeredAt,
    updatedAt: value.updatedAt,
    ready: value.ready,
    snapshotFetchedAt: typeof value.snapshotFetchedAt === "number" ? value.snapshotFetchedAt : null,
    metrics,
  };
}

function resolveBalanceRating(
  entry: GuildRosterEntry,
  metrics: TeamSeedMetrics | null,
): number | null {
  if (entry.internalMatches > 0) {
    return entry.internalElo;
  }

  return metrics ? seedScoreToInternalElo(metrics.seedScore) : null;
}

export function buildCachedGuildRosterMembers(
  roster: readonly GuildRosterEntry[],
): CachedGuildRosterMember[] {
  return roster.map((entry) => {
    const metrics =
      entry.snapshot === null
        ? null
        : calculateSeedMetrics({
            rankPoints: entry.snapshot.rankPoints,
            kdRatio: entry.snapshot.kdRatio,
            kost: entry.snapshot.kost,
            kills: entry.snapshot.kills,
            headshotPercentage: entry.snapshot.headshotPercentage,
            payloadJson: entry.snapshot.payloadJson,
          });
    const balanceRating = resolveBalanceRating(entry, metrics);
    const internalElo =
      entry.internalMatches > 0 ? entry.internalElo : (balanceRating ?? entry.internalElo);

    return {
      guildId: entry.guildId,
      discordUserId: entry.discordUserId,
      playerId: entry.playerId,
      username: entry.username,
      platform: entry.platform,
      profileUrl: entry.profileUrl,
      level: entry.level,
      internalElo,
      internalMatches: entry.internalMatches,
      internalWins: entry.internalWins,
      internalLosses: entry.internalLosses,
      internalUpdatedAt: entry.internalUpdatedAt,
      balanceRating,
      registeredAt: entry.registeredAt,
      updatedAt: entry.updatedAt,
      ready: balanceRating !== null,
      snapshotFetchedAt: entry.snapshot?.fetchedAt ?? null,
      metrics,
    };
  });
}

export async function readGuildRosterCache(
  cache: KVNamespace | null | undefined,
  guildId: string,
): Promise<CachedGuildRosterMember[] | null> {
  if (!cache) {
    return null;
  }

  try {
    const raw = await cache.get(buildGuildRosterCacheKey(guildId), "text");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.members)) {
      return null;
    }

    const members: CachedGuildRosterMember[] = [];
    for (const value of parsed.members) {
      const member = parseMember(value);
      if (!member) {
        return null;
      }
      members.push(member);
    }

    return members;
  } catch {
    return null;
  }
}

export async function writeGuildRosterCache(
  cache: KVNamespace | null | undefined,
  guildId: string,
  members: readonly CachedGuildRosterMember[],
): Promise<void> {
  if (!cache) {
    return;
  }

  const payload: CachedGuildRosterEnvelope = {
    version: 1,
    cachedAt: Date.now(),
    members: [...members],
  };

  await cache.put(buildGuildRosterCacheKey(guildId), JSON.stringify(payload), {
    expirationTtl: GUILD_ROSTER_CACHE_TTL_SECONDS,
  });
}

export async function deleteGuildRosterCache(
  cache: KVNamespace | null | undefined,
  guildId: string,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.delete(buildGuildRosterCacheKey(guildId));
}

export async function deleteGuildRosterCaches(
  cache: KVNamespace | null | undefined,
  guildIds: readonly string[],
): Promise<void> {
  if (!cache || guildIds.length === 0) {
    return;
  }

  for (const guildId of new Set(guildIds)) {
    await deleteGuildRosterCache(cache, guildId);
  }
}

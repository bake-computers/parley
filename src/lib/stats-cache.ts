import { err, ok, type Result } from "neverthrow";
import { logger } from "./logger";

const STATS_CACHE_KEY_PREFIX = "stats:v1";

export const STATS_CACHE_SCHEMA_VERSION = 1;
export const STATS_CACHE_SOFT_TTL_MS = 60 * 60 * 1000;
export const STATS_CACHE_HARD_TTL_SECONDS = 24 * 60 * 60;

export type DataMap = Record<string, unknown>;
export type StatsCachePlatform = "auto" | "pc" | "xbox" | "playstation";

export interface StatsCacheEnvelope {
  version: number;
  cachedAt: number;
  username: string;
  profile: DataMap;
  rankedStats: DataMap;
  calculatedMetrics: DataMap;
}

export interface StatsCacheError {
  kind: "stats-cache";
  message: string;
  key: string;
  retryable: boolean;
  cause?: unknown;
}

function isDataMap(value: unknown): value is DataMap {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeLookupValue(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function buildStatsCacheKey(
  username: string,
  platform: StatsCachePlatform = "auto",
): string {
  return `${STATS_CACHE_KEY_PREFIX}:${platform}:${normalizeLookupValue(username)}`;
}

function parseEnvelope(raw: unknown): StatsCacheEnvelope | null {
  if (!isDataMap(raw)) {
    return null;
  }

  const version = Number(raw.version ?? 0);
  const cachedAt = Number(raw.cachedAt ?? 0);
  const username = typeof raw.username === "string" ? raw.username : "";

  if (version !== STATS_CACHE_SCHEMA_VERSION || cachedAt <= 0 || !username) {
    return null;
  }

  const profile = isDataMap(raw.profile) ? raw.profile : {};
  const rankedStats = isDataMap(raw.rankedStats) ? raw.rankedStats : {};
  const calculatedMetrics = isDataMap(raw.calculatedMetrics) ? raw.calculatedMetrics : {};

  return {
    version,
    cachedAt,
    username,
    profile,
    rankedStats,
    calculatedMetrics,
  };
}

export async function readStatsCache(
  cache: KVNamespace | null | undefined,
  key: string,
): Promise<StatsCacheEnvelope | null> {
  if (!cache) {
    return null;
  }

  try {
    const raw = await cache.get(key, "text");
    if (!raw) {
      return null;
    }

    return parseEnvelope(JSON.parse(raw));
  } catch (error) {
    logger.error("stats.cache.read_failed", "Failed to read stats cache", { key, error });
    return null;
  }
}

export async function writeStatsCache(
  cache: KVNamespace | null | undefined,
  key: string,
  value: StatsCacheEnvelope,
): Promise<void> {
  const result = await writeStatsCacheResult(cache, key, value);
  if (result.isErr()) {
    logger.error("stats.cache.write_failed", "Failed to write stats cache", {
      key,
      error: result.error,
    });
  }
}

export async function writeStatsCacheResult(
  cache: KVNamespace | null | undefined,
  key: string,
  value: StatsCacheEnvelope,
): Promise<Result<void, StatsCacheError>> {
  if (!cache) {
    return ok(undefined);
  }

  try {
    await cache.put(key, JSON.stringify(value), {
      expirationTtl: STATS_CACHE_HARD_TTL_SECONDS,
    });
    return ok(undefined);
  } catch (error) {
    return err({
      kind: "stats-cache",
      message: "Failed to write stats cache",
      key,
      retryable: true,
      cause: error,
    });
  }
}

export function isStatsCacheStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > STATS_CACHE_SOFT_TTL_MS;
}

export function statsCacheAgeMinutes(cachedAt: number): number {
  const ageMs = Math.max(0, Date.now() - cachedAt);
  return Math.floor(ageMs / (60 * 1000));
}

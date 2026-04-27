import type { KVNamespace } from "@cloudflare/workers-types";
import { err, ok, type Result } from "neverthrow";
import { logger } from "../lib/logger";
import { mergeSeasonCatalog, normalizeSeasonSelector, type SeasonCatalogEntry } from "./season";

const STATS_CACHE_KEY_PREFIX = "stats:v2";
const PLAYER_SEASON_CATALOG_PREFIX = "stats:season-catalog:v1:player";
const GLOBAL_SEASON_CATALOG_KEY = "stats:season-catalog:v1:global";
const SEASON_CATALOG_SCHEMA_VERSION = 1;

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

interface SeasonCatalogEnvelope {
  version: number;
  cachedAt: number;
  entries: SeasonCatalogEntry[];
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

function normalizeSeasonLookupValue(value: string): string {
  const normalized = normalizeSeasonSelector(value);
  return normalized.length > 0 ? normalized : "latest";
}

function normalizeCatalogEntry(value: unknown): SeasonCatalogEntry | null {
  if (!isDataMap(value)) {
    return null;
  }

  const slug = typeof value.slug === "string" ? normalizeSeasonSelector(value.slug) : "";
  const display = typeof value.display === "string" ? value.display.trim() : "";
  const startedAt = typeof value.startedAt === "string" ? value.startedAt : "";

  if (!slug || !display) {
    return null;
  }

  return {
    slug,
    display,
    startedAt,
  };
}

function parseSeasonCatalog(raw: unknown): SeasonCatalogEntry[] | null {
  if (!isDataMap(raw)) {
    return null;
  }

  const version = Number(raw.version ?? 0);
  const entriesRaw = Array.isArray(raw.entries) ? raw.entries : null;
  if (version !== SEASON_CATALOG_SCHEMA_VERSION || !entriesRaw) {
    return null;
  }

  const entries: SeasonCatalogEntry[] = [];
  for (const entryRaw of entriesRaw) {
    const entry = normalizeCatalogEntry(entryRaw);
    if (!entry) {
      return null;
    }
    entries.push(entry);
  }

  return mergeSeasonCatalog(entries);
}

export function buildStatsCacheKey(
  username: string,
  platform: StatsCachePlatform = "auto",
  seasonSelector = "latest",
): string {
  return `${STATS_CACHE_KEY_PREFIX}:${platform}:${normalizeLookupValue(username)}:${normalizeSeasonLookupValue(seasonSelector)}`;
}

function buildPlayerSeasonCatalogKey(
  username: string,
  platform: StatsCachePlatform = "auto",
): string {
  return `${PLAYER_SEASON_CATALOG_PREFIX}:${platform}:${normalizeLookupValue(username)}`;
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

async function readSeasonCatalogByKey(
  cache: KVNamespace | null | undefined,
  key: string,
): Promise<SeasonCatalogEntry[] | null> {
  if (!cache) {
    return null;
  }

  try {
    const raw = await cache.get(key, "text");
    if (!raw) {
      return null;
    }

    return parseSeasonCatalog(JSON.parse(raw));
  } catch (error) {
    logger.error("stats.cache.catalog_read_failed", "Failed to read season catalog cache", {
      key,
      error,
    });
    return null;
  }
}

async function writeSeasonCatalogByKey(
  cache: KVNamespace | null | undefined,
  key: string,
  catalog: readonly SeasonCatalogEntry[],
): Promise<void> {
  if (!cache) {
    return;
  }

  const payload: SeasonCatalogEnvelope = {
    version: SEASON_CATALOG_SCHEMA_VERSION,
    cachedAt: Date.now(),
    entries: mergeSeasonCatalog(catalog),
  };

  try {
    await cache.put(key, JSON.stringify(payload), {
      expirationTtl: STATS_CACHE_HARD_TTL_SECONDS,
    });
  } catch (error) {
    logger.error("stats.cache.catalog_write_failed", "Failed to write season catalog cache", {
      key,
      error,
    });
  }
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

export async function readPlayerSeasonCatalog(
  cache: KVNamespace | null | undefined,
  username: string,
  platform: StatsCachePlatform = "auto",
): Promise<SeasonCatalogEntry[] | null> {
  return readSeasonCatalogByKey(cache, buildPlayerSeasonCatalogKey(username, platform));
}

export async function writePlayerSeasonCatalog(
  cache: KVNamespace | null | undefined,
  username: string,
  platform: StatsCachePlatform,
  catalog: readonly SeasonCatalogEntry[],
): Promise<void> {
  await writeSeasonCatalogByKey(cache, buildPlayerSeasonCatalogKey(username, platform), catalog);
}

export async function readGlobalSeasonCatalog(
  cache: KVNamespace | null | undefined,
): Promise<SeasonCatalogEntry[] | null> {
  return readSeasonCatalogByKey(cache, GLOBAL_SEASON_CATALOG_KEY);
}

export async function writeGlobalSeasonCatalog(
  cache: KVNamespace | null | undefined,
  catalog: readonly SeasonCatalogEntry[],
): Promise<void> {
  await writeSeasonCatalogByKey(cache, GLOBAL_SEASON_CATALOG_KEY, catalog);
}

export function isStatsCacheStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > STATS_CACHE_SOFT_TTL_MS;
}

export function statsCacheAgeMinutes(cachedAt: number): number {
  const ageMs = Math.max(0, Date.now() - cachedAt);
  return Math.floor(ageMs / (60 * 1000));
}

import type { KVNamespace } from "@cloudflare/workers-types";
import { logger } from "../lib/logger";
import {
  STATS_CACHE_HARD_TTL_SECONDS,
  STATS_CACHE_SCHEMA_VERSION,
  type StatsCacheEnvelope,
} from "./cache";

const STATS_VIEW_STATE_PREFIX = "stats:view-state:v1";

export interface StatsViewStateEnvelope {
  cacheKey: string;
  cacheEnvelope?: StatsCacheEnvelope;
}

function isDataMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseCacheEnvelope(raw: unknown): StatsCacheEnvelope | null {
  if (!isDataMap(raw)) {
    return null;
  }

  const version = Number(raw.version ?? 0);
  const cachedAt = Number(raw.cachedAt ?? 0);
  const username = typeof raw.username === "string" ? raw.username : "";
  const profile = isDataMap(raw.profile) ? raw.profile : null;
  const rankedStats = isDataMap(raw.rankedStats) ? raw.rankedStats : null;
  const calculatedMetrics = isDataMap(raw.calculatedMetrics) ? raw.calculatedMetrics : null;

  if (
    version !== STATS_CACHE_SCHEMA_VERSION ||
    cachedAt <= 0 ||
    username.length === 0 ||
    !profile ||
    !rankedStats ||
    !calculatedMetrics
  ) {
    return null;
  }

  return {
    version,
    cachedAt,
    username,
    profile,
    rankedStats,
    calculatedMetrics,
  };
}

function buildStatsViewStateKey(viewId: string): string {
  return `${STATS_VIEW_STATE_PREFIX}:${viewId}`;
}

function parseStatsViewState(raw: unknown): StatsViewStateEnvelope | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const cacheKey = "cacheKey" in raw && typeof raw.cacheKey === "string" ? raw.cacheKey.trim() : "";

  if (!cacheKey) {
    return null;
  }

  const cacheEnvelope = "cacheEnvelope" in raw ? parseCacheEnvelope(raw.cacheEnvelope) : null;

  return cacheEnvelope ? { cacheKey, cacheEnvelope } : { cacheKey };
}

export async function writeStatsViewState(
  cache: KVNamespace | null | undefined,
  viewId: string,
  state: StatsViewStateEnvelope,
): Promise<void> {
  if (!cache || !viewId) {
    return;
  }

  try {
    await cache.put(buildStatsViewStateKey(viewId), JSON.stringify(state), {
      expirationTtl: STATS_CACHE_HARD_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("stats.view_state.write_failed", "Failed to write stats view state", {
      viewId,
      error,
    });
  }
}

export async function readStatsViewState(
  cache: KVNamespace | null | undefined,
  viewId: string,
): Promise<StatsViewStateEnvelope | null> {
  if (!cache || !viewId) {
    return null;
  }

  try {
    const raw = await cache.get(buildStatsViewStateKey(viewId), "text");
    if (!raw) {
      return null;
    }

    return parseStatsViewState(JSON.parse(raw));
  } catch (error) {
    logger.warn("stats.view_state.read_failed", "Failed to read stats view state", {
      viewId,
      error,
    });
    return null;
  }
}

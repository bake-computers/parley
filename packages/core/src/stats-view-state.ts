import type { KVNamespace } from "@cloudflare/workers-types";
import { logger } from "./logger";
import { STATS_CACHE_HARD_TTL_SECONDS } from "./stats-cache";

const STATS_VIEW_STATE_PREFIX = "stats:view-state:v1";

interface StatsViewStateEnvelope {
  cacheKey: string;
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

  return { cacheKey };
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

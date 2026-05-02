import type { KVNamespace } from "@cloudflare/workers-types";
import { logger } from "../lib/logger";
import {
  normalizeLeaderboardMinMatches,
  normalizeLeaderboardPlatform,
  normalizeLeaderboardScope,
  type LeaderboardPlatformFilter,
  type LeaderboardScope,
} from "./view";

const LEADERBOARD_VIEW_STATE_PREFIX = "leaderboard:view-state:v1";
const LEADERBOARD_VIEW_STATE_TTL_SECONDS = 5 * 60;

export interface LeaderboardViewState {
  scope: LeaderboardScope;
  guildId: string;
  platform: LeaderboardPlatformFilter;
  minMatches: number;
}

function buildLeaderboardViewStateKey(viewId: string): string {
  return `${LEADERBOARD_VIEW_STATE_PREFIX}:${viewId}`;
}

function parseLeaderboardViewState(raw: unknown): LeaderboardViewState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const scope =
    "scope" in raw && typeof raw.scope === "string" ? normalizeLeaderboardScope(raw.scope) : null;
  const guildId = "guildId" in raw && typeof raw.guildId === "string" ? raw.guildId.trim() : "";
  const platform =
    "platform" in raw && typeof raw.platform === "string"
      ? normalizeLeaderboardPlatform(raw.platform)
      : null;
  const minMatches =
    "minMatches" in raw && typeof raw.minMatches === "number"
      ? normalizeLeaderboardMinMatches(raw.minMatches)
      : null;

  if (!scope || !platform || !guildId || minMatches === null) {
    return null;
  }

  return {
    scope,
    guildId,
    platform,
    minMatches,
  };
}

export async function writeLeaderboardViewState(
  cache: KVNamespace | null | undefined,
  viewId: string,
  state: LeaderboardViewState,
): Promise<void> {
  if (!cache || !viewId) {
    return;
  }

  try {
    await cache.put(buildLeaderboardViewStateKey(viewId), JSON.stringify(state), {
      expirationTtl: LEADERBOARD_VIEW_STATE_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("leaderboard.view_state.write_failed", "Failed to write leaderboard view state", {
      viewId,
      error,
    });
  }
}

export async function readLeaderboardViewState(
  cache: KVNamespace | null | undefined,
  viewId: string,
): Promise<LeaderboardViewState | null> {
  if (!cache || !viewId) {
    return null;
  }

  try {
    const raw = await cache.get(buildLeaderboardViewStateKey(viewId), "text");
    if (!raw) {
      return null;
    }

    return parseLeaderboardViewState(JSON.parse(raw));
  } catch (error) {
    logger.warn("leaderboard.view_state.read_failed", "Failed to read leaderboard view state", {
      viewId,
      error,
    });
    return null;
  }
}

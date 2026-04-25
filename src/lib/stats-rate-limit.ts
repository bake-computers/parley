import type { StatsPlatform } from "./http";

const STATS_EXECUTOR_DAILY_KEY_PREFIX = "stats-executor-day:v1";
const TRACKED_PLAYER_DAILY_KEY_PREFIX = "scrape-day";
const TRACKED_PLAYER_LOCK_KEY_PREFIX = "scrape";

export const STATS_EXECUTOR_DAILY_LIMIT = 3;

export interface StatsDailyWindow {
  retryAtUnix: number;
  retryAtMs: number;
}

export interface TrackedPlayerDailyCapResult extends StatsDailyWindow {
  isLimited: boolean;
  key?: string;
}

export interface ExecutorDailyQuotaResult extends StatsDailyWindow {
  isLimited: boolean;
  used: number;
  remaining: number;
  limit: number;
  key?: string;
}

export function normalizeStatsLookupValue(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function isBotOwner(
  userId: string | null | undefined,
  ownerId: string | null | undefined,
): boolean {
  if (!userId || !ownerId) {
    return false;
  }

  return userId === ownerId;
}

function formatUtcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcDayMs(nowMs = Date.now()): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function nextUtcDayUnix(nowMs = Date.now()): number {
  return Math.floor(nextUtcDayMs(nowMs) / 1000);
}

export function secondsUntilNextUtcDay(nowMs = Date.now()): number {
  return Math.max(60, Math.ceil((nextUtcDayMs(nowMs) - nowMs) / 1000));
}

export function formatDiscordRetryAt(retryAtUnix: number): string {
  return `<t:${retryAtUnix}:F> (<t:${retryAtUnix}:R>)`;
}

export function buildTrackedPlayerRefreshLockKey(
  username: string,
  platform: StatsPlatform,
): string {
  return `${TRACKED_PLAYER_LOCK_KEY_PREFIX}:${platform}:${normalizeStatsLookupValue(username)}`;
}

export function buildTrackedPlayerDailyKey(
  username: string,
  platform: StatsPlatform,
  nowMs = Date.now(),
): string {
  return `${TRACKED_PLAYER_DAILY_KEY_PREFIX}:${platform}:${normalizeStatsLookupValue(username)}:${formatUtcDay(nowMs)}`;
}

function trackedPlayerDailyKeys(
  username: string,
  platform: StatsPlatform,
  nowMs = Date.now(),
): string[] {
  if (platform !== "auto") {
    return [buildTrackedPlayerDailyKey(username, platform, nowMs)];
  }

  return [
    buildTrackedPlayerDailyKey(username, "pc", nowMs),
    buildTrackedPlayerDailyKey(username, "xbox", nowMs),
    buildTrackedPlayerDailyKey(username, "playstation", nowMs),
  ];
}

export async function checkTrackedPlayerDailyCap(
  cache: KVNamespace | null | undefined,
  username: string,
  platform: StatsPlatform,
  nowMs = Date.now(),
): Promise<TrackedPlayerDailyCapResult> {
  const retryAtMs = nextUtcDayMs(nowMs);
  const retryAtUnix = Math.floor(retryAtMs / 1000);

  if (!cache) {
    return {
      isLimited: false,
      retryAtMs,
      retryAtUnix,
    };
  }

  for (const key of trackedPlayerDailyKeys(username, platform, nowMs)) {
    const value = await cache.get(key);
    if (value) {
      return {
        isLimited: true,
        key,
        retryAtMs,
        retryAtUnix,
      };
    }
  }

  return {
    isLimited: false,
    retryAtMs,
    retryAtUnix,
  };
}

export function buildExecutorDailyKey(executorId: string, nowMs = Date.now()): string {
  return `${STATS_EXECUTOR_DAILY_KEY_PREFIX}:${executorId}:${formatUtcDay(nowMs)}`;
}

export async function consumeExecutorDailyQuota(
  cache: KVNamespace | null | undefined,
  executorId: string | null | undefined,
  nowMs = Date.now(),
  limit = STATS_EXECUTOR_DAILY_LIMIT,
): Promise<ExecutorDailyQuotaResult> {
  const retryAtMs = nextUtcDayMs(nowMs);
  const retryAtUnix = Math.floor(retryAtMs / 1000);
  if (!cache || !executorId) {
    return {
      isLimited: false,
      used: 0,
      remaining: limit,
      limit,
      retryAtMs,
      retryAtUnix,
    };
  }

  const key = buildExecutorDailyKey(executorId, nowMs);
  const currentRaw = await cache.get(key);
  const current = Number(currentRaw ?? 0);
  const used = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;

  if (used >= limit) {
    return {
      isLimited: true,
      key,
      used,
      remaining: 0,
      limit,
      retryAtMs,
      retryAtUnix,
    };
  }

  const nextUsed = used + 1;
  await cache.put(key, String(nextUsed), {
    expirationTtl: secondsUntilNextUtcDay(nowMs),
  });

  return {
    isLimited: false,
    key,
    used: nextUsed,
    remaining: Math.max(0, limit - nextUsed),
    limit,
    retryAtMs,
    retryAtUnix,
  };
}

import type { D1Database } from "@cloudflare/workers-types";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import {
  calculateKost,
  fetchAndScrapeStatsResult,
  formatOutput,
  type DataMap,
  type ScrapedStats,
  type StatsFetchError,
  type StatsPlatform,
} from "../lib/http";
import { logger } from "../lib/logger";
import { persistStatsSnapshot } from "../lib/db/stats-snapshot";
import {
  buildStatsCacheKey,
  writeStatsCacheResult,
  STATS_CACHE_SCHEMA_VERSION,
  type StatsCacheEnvelope,
} from "../lib/stats-cache";

const SCRAPE_LOCK_TTL_SECONDS = 30 * 60;
const SUPPORTED_PLATFORMS = new Set<StatsPlatform>(["auto", "pc", "xbox", "playstation"]);

export type StatsRefreshReason = "cache-miss" | "stale-cache";

export interface StatsRefreshMessage {
  type: "stats.refresh";
  username: string;
  platform: StatsPlatform;
  cacheKey: string;
  reason: StatsRefreshReason;
  requestedAt: number;
  requestedBy?: {
    guildId?: string;
    channelId?: string;
    userId?: string;
  };
}

export interface StatsRefreshEnv {
  Cache?: KVNamespace;
  Queue?: Queue<StatsRefreshMessage>;
  Database?: D1Database;
}

export type StatsRefreshEnqueueStatus = "queued" | "deduped" | "daily-capped";

export interface StatsRefreshEnqueueResult {
  status: StatsRefreshEnqueueStatus;
  lockKey?: string;
  dailyKey?: string;
}

export interface StatsRefreshQueueError {
  kind: "stats-refresh-queue";
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export interface StatsRefreshDeps {
  fetchStats?: (
    username: string,
    platform: StatsPlatform,
  ) => Promise<Result<ScrapedStats, StatsFetchError>>;
  persistSnapshot?: (
    database: D1Database | null | undefined,
    envelope: StatsCacheEnvelope,
  ) => Promise<void>;
}

function isDataMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeStatsLookupValue(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function buildScrapeLockKey(username: string, platform: StatsPlatform): string {
  return `scrape:${platform}:${normalizeStatsLookupValue(username)}`;
}

export function buildScrapeDayKey(
  username: string,
  platform: StatsPlatform,
  now = new Date(),
): string {
  return `scrape-day:${platform}:${normalizeStatsLookupValue(username)}:${now.toISOString().slice(0, 10)}`;
}

export function secondsUntilNextUtcDay(now = Date.now()): number {
  const date = new Date(now);
  const nextDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(60, Math.ceil((nextDay - now) / 1000));
}

function isStatsPlatform(value: unknown): value is StatsPlatform {
  return typeof value === "string" && SUPPORTED_PLATFORMS.has(value as StatsPlatform);
}

function isStatsRefreshReason(value: unknown): value is StatsRefreshReason {
  return value === "cache-miss" || value === "stale-cache";
}

export function isStatsRefreshMessage(value: unknown): value is StatsRefreshMessage {
  if (!isDataMap(value)) {
    return false;
  }

  return (
    value.type === "stats.refresh" &&
    typeof value.username === "string" &&
    isStatsPlatform(value.platform) &&
    typeof value.cacheKey === "string" &&
    isStatsRefreshReason(value.reason) &&
    typeof value.requestedAt === "number"
  );
}

function platformDailyKeys(username: string, platform: StatsPlatform, now = new Date()): string[] {
  if (platform !== "auto") {
    return [buildScrapeDayKey(username, platform, now)];
  }

  return [
    buildScrapeDayKey(username, "pc", now),
    buildScrapeDayKey(username, "xbox", now),
    buildScrapeDayKey(username, "playstation", now),
  ];
}

async function hasDailyCap(
  cache: KVNamespace | null | undefined,
  username: string,
  platform: StatsPlatform,
): Promise<string | null> {
  if (!cache) {
    return null;
  }

  for (const key of platformDailyKeys(username, platform)) {
    const value = await cache.get(key);
    if (value) {
      return key;
    }
  }

  return null;
}

export async function enqueueStatsRefresh(
  env: StatsRefreshEnv,
  message: StatsRefreshMessage,
): Promise<Result<StatsRefreshEnqueueResult, StatsRefreshQueueError>> {
  if (!env.Queue) {
    return err({
      kind: "stats-refresh-queue",
      message: "Queue binding is missing",
      retryable: false,
    });
  }

  const dailyKey = await hasDailyCap(env.Cache, message.username, message.platform);
  if (dailyKey) {
    logger.info("stats.refresh.daily_capped", "Stats refresh skipped by daily cap", {
      username: message.username,
      platform: message.platform,
      dailyKey,
    });
    return ok({ status: "daily-capped", dailyKey });
  }

  const lockKey = buildScrapeLockKey(message.username, message.platform);
  if (env.Cache) {
    const existingLock = await env.Cache.get(lockKey);
    if (existingLock) {
      logger.info("stats.refresh.deduped", "Stats refresh already queued", {
        username: message.username,
        platform: message.platform,
        lockKey,
      });
      return ok({ status: "deduped", lockKey });
    }

    await env.Cache.put(lockKey, String(message.requestedAt), {
      expirationTtl: SCRAPE_LOCK_TTL_SECONDS,
    });
  }

  return ResultAsync.fromPromise(env.Queue.send(message), (cause) => ({
    kind: "stats-refresh-queue" as const,
    message: "Failed to enqueue stats refresh",
    retryable: true,
    cause,
  })).map(() => {
    logger.info("stats.refresh.queued", "Stats refresh queued", {
      username: message.username,
      platform: message.platform,
      reason: message.reason,
      lockKey,
    });
    return { status: "queued" as const, lockKey };
  });
}

export function buildStatsEnvelope(
  username: string,
  profile: DataMap,
  rankedStats: DataMap,
): StatsCacheEnvelope {
  const formatted = formatOutput({
    profile,
    ranked_stats: rankedStats,
    calculated_metrics: {},
  });

  return {
    version: STATS_CACHE_SCHEMA_VERSION,
    cachedAt: Date.now(),
    username,
    profile,
    rankedStats,
    calculatedMetrics: (formatted.calculated_metrics ?? {}) as DataMap,
  };
}

async function defaultPersistSnapshot(
  database: D1Database | null | undefined,
  envelope: StatsCacheEnvelope,
): Promise<void> {
  await persistStatsSnapshot(database, {
    profile: envelope.profile,
    rankedStats: envelope.rankedStats,
    calculatedMetrics: {
      ...envelope.calculatedMetrics,
      kost: calculateKost(envelope.rankedStats),
    },
    cacheVersion: envelope.version,
    fetchedAt: envelope.cachedAt,
    source: "refresh",
  });
}

export async function processStatsRefreshMessage(
  env: StatsRefreshEnv,
  message: StatsRefreshMessage,
  deps: StatsRefreshDeps = {},
): Promise<void> {
  const fetchStats =
    deps.fetchStats ?? ((username, platform) => fetchAndScrapeStatsResult(username, platform));
  const persistSnapshot = deps.persistSnapshot ?? defaultPersistSnapshot;
  const fetchResult = await fetchStats(message.username, message.platform);

  if (fetchResult.isErr()) {
    logger.warn("stats.refresh.scrape_failed", "Stats refresh scrape failed", {
      username: message.username,
      platform: message.platform,
      error: fetchResult.error,
    });
    if (fetchResult.error.retryable) {
      throw new Error(fetchResult.error.message);
    }
    return;
  }

  const scrapedStats = fetchResult.value;
  const profile = scrapedStats.profile;
  const rankedStats = scrapedStats.ranked_stats;
  const envelope = buildStatsEnvelope(message.username, profile, rankedStats);

  const writeResult = await writeStatsCacheResult(env.Cache, message.cacheKey, envelope);
  if (writeResult.isErr()) {
    logger.error("stats.refresh.cache_failed", "Stats refresh cache write failed", {
      username: message.username,
      platform: message.platform,
      error: writeResult.error,
    });
    throw new Error(writeResult.error.message);
  }

  await ResultAsync.fromPromise(persistSnapshot(env.Database, envelope), (cause) => cause).match(
    () => undefined,
    (error) => {
      logger.error("stats.refresh.persist_failed", "Stats refresh persistence failed", {
        username: message.username,
        platform: message.platform,
        error,
      });
      throw error instanceof Error ? error : new Error("Stats refresh persistence failed");
    },
  );

  if (env.Cache) {
    const resolvedPlatform =
      typeof profile.platform === "string" ? profile.platform : message.platform;
    if (isStatsPlatform(resolvedPlatform) && resolvedPlatform !== "auto") {
      await env.Cache.put(buildScrapeDayKey(message.username, resolvedPlatform), "1", {
        expirationTtl: secondsUntilNextUtcDay(),
      });
    }
  }

  logger.info("stats.refresh.completed", "Stats refresh completed", {
    username: message.username,
    platform: message.platform,
    cacheKey: message.cacheKey,
  });
}

export async function handleStatsRefreshQueue(
  batch: MessageBatch<StatsRefreshMessage>,
  env: StatsRefreshEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  for (const message of batch.messages) {
    if (!isStatsRefreshMessage(message.body)) {
      logger.warn("stats.refresh.invalid_message", "Skipping invalid stats refresh message", {
        messageId: message.id,
      });
      message.ack();
      continue;
    }

    try {
      await processStatsRefreshMessage(env, message.body);
      message.ack();
    } catch (error) {
      logger.error("stats.refresh.retry", "Stats refresh message will be retried", {
        messageId: message.id,
        attempts: message.attempts,
        error,
      });
      throw error;
    }
  }
}

export function createStatsRefreshMessage(input: {
  username: string;
  platform: StatsPlatform;
  reason: StatsRefreshReason;
  guildId?: string;
  channelId?: string;
  userId?: string;
}): StatsRefreshMessage {
  return {
    type: "stats.refresh",
    username: input.username,
    platform: input.platform,
    cacheKey: buildStatsCacheKey(input.username, input.platform),
    reason: input.reason,
    requestedAt: Date.now(),
    requestedBy: {
      guildId: input.guildId,
      channelId: input.channelId,
      userId: input.userId,
    },
  };
}

export function logScheduledHealth(controller: ScheduledController): void {
  logger.info("worker.scheduled.health", "Scheduled worker health check", {
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
    cron: controller.cron,
  });
}

import type { D1Database } from "@cloudflare/workers-types";
import { err, ok, ResultAsync, type Result } from "neverthrow";
import { DiscordRestClient, type JsonObject } from "../lib/discord";
import {
  fetchAndScrapeStatsCollectionResult,
  formatOutput,
  type DataMap,
  type ScrapedStatsCollection,
  type StatsFetchError,
  type StatsPlatform,
} from "../lib/http";
import { logger } from "../lib/logger";
import { persistStatsSnapshot } from "../lib/db/stats-snapshot";
import {
  buildStatsCacheKey,
  readGlobalSeasonCatalog,
  writeGlobalSeasonCatalog,
  writePlayerSeasonCatalog,
  writeStatsCacheResult,
  STATS_CACHE_SCHEMA_VERSION,
  type StatsCacheEnvelope,
} from "../lib/stats-cache";
import {
  buildRefreshFailureEmbed,
  buildSeasonNotFoundEmbed,
  buildStatsEmbed,
} from "../lib/stats-embeds";
import {
  canonicalizeSeasonSelector,
  mergeSeasonCatalog,
  normalizeSeasonSelector,
  type SeasonCatalogEntry,
} from "../lib/stats-season";

const SCRAPE_LOCK_TTL_SECONDS = 30 * 60;
const PENDING_REPLY_TTL_SECONDS = 30 * 60;
const PENDING_REPLY_KEY_PREFIX = "stats:pending-reply:v1";
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

export interface PendingStatsReplyInput {
  interactionId: string;
  applicationId: string;
  token: string;
  username: string;
  platform: StatsPlatform;
  requestedSeasonRaw: string | null;
  requestedSeasonCanonical: string | null;
  requestedAt: number;
}

interface PendingStatsReplyRecord extends PendingStatsReplyInput {
  key: string;
}

export interface StatsRefreshDeps {
  fetchStatsCollection?: (
    username: string,
    platform: StatsPlatform,
  ) => Promise<Result<ScrapedStatsCollection, StatsFetchError>>;
  persistSnapshot?: (
    database: D1Database | null | undefined,
    envelope: StatsCacheEnvelope,
  ) => Promise<void>;
  editPendingReply?: (pending: PendingStatsReplyRecord, payload: JsonObject) => Promise<void>;
}

function isDataMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeStatsLookupValue(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function buildPendingReplyPrefix(username: string, platform: StatsPlatform): string {
  return `${PENDING_REPLY_KEY_PREFIX}:${platform}:${normalizeStatsLookupValue(username)}:`;
}

function buildPendingReplyKey(
  username: string,
  platform: StatsPlatform,
  interactionId: string,
): string {
  return `${buildPendingReplyPrefix(username, platform)}${interactionId}`;
}

function parsePendingReplyRecord(key: string, raw: unknown): PendingStatsReplyRecord | null {
  if (!isDataMap(raw)) {
    return null;
  }

  const applicationId = typeof raw.applicationId === "string" ? raw.applicationId : "";
  const token = typeof raw.token === "string" ? raw.token : "";
  const interactionId = typeof raw.interactionId === "string" ? raw.interactionId : "";
  const username = typeof raw.username === "string" ? raw.username : "";
  const platform = raw.platform;
  const requestedSeasonRaw =
    typeof raw.requestedSeasonRaw === "string" ? raw.requestedSeasonRaw : null;
  const requestedSeasonCanonical =
    typeof raw.requestedSeasonCanonical === "string" ? raw.requestedSeasonCanonical : null;
  const requestedAt = Number(raw.requestedAt ?? 0);

  if (!applicationId || !token || !interactionId || !username || !isStatsPlatform(platform)) {
    return null;
  }

  if (!Number.isFinite(requestedAt) || requestedAt <= 0) {
    return null;
  }

  return {
    key,
    interactionId,
    applicationId,
    token,
    username,
    platform,
    requestedSeasonRaw,
    requestedSeasonCanonical,
    requestedAt,
  };
}

export async function registerPendingStatsReply(
  cache: KVNamespace | null | undefined,
  input: PendingStatsReplyInput,
): Promise<void> {
  if (!cache) {
    return;
  }

  const key = buildPendingReplyKey(input.username, input.platform, input.interactionId);

  try {
    await cache.put(
      key,
      JSON.stringify({
        interactionId: input.interactionId,
        applicationId: input.applicationId,
        token: input.token,
        username: input.username,
        platform: input.platform,
        requestedSeasonRaw: input.requestedSeasonRaw,
        requestedSeasonCanonical: input.requestedSeasonCanonical,
        requestedAt: input.requestedAt,
      }),
      { expirationTtl: PENDING_REPLY_TTL_SECONDS },
    );
  } catch (error) {
    logger.error("stats.pending_reply.write_failed", "Failed to register pending stats reply", {
      key,
      username: input.username,
      platform: input.platform,
      error,
    });
  }
}

export async function listPendingStatsReplies(
  cache: KVNamespace | null | undefined,
  username: string,
  platform: StatsPlatform,
): Promise<PendingStatsReplyRecord[]> {
  if (!cache) {
    return [];
  }

  const prefix = buildPendingReplyPrefix(username, platform);
  const records: PendingStatsReplyRecord[] = [];
  let cursor: string | undefined;

  do {
    const listed = await cache.list({
      prefix,
      cursor,
      limit: 1000,
    });

    for (const keyEntry of listed.keys) {
      const raw = await cache.get(keyEntry.name, "text");
      if (!raw) {
        continue;
      }

      try {
        const parsed = parsePendingReplyRecord(keyEntry.name, JSON.parse(raw));
        if (parsed) {
          records.push(parsed);
        }
      } catch (error) {
        logger.warn(
          "stats.pending_reply.invalid_payload",
          "Skipping invalid pending reply payload",
          {
            key: keyEntry.name,
            error,
          },
        );
      }
    }

    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);

  records.sort((left, right) => left.requestedAt - right.requestedAt);
  return records;
}

export async function deletePendingStatsReply(
  cache: KVNamespace | null | undefined,
  key: string,
): Promise<void> {
  if (!cache) {
    return;
  }

  try {
    await cache.delete(key);
  } catch (error) {
    logger.warn("stats.pending_reply.delete_failed", "Failed to delete pending stats reply", {
      key,
      error,
    });
  }
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
    calculatedMetrics: envelope.calculatedMetrics,
    cacheVersion: envelope.version,
    fetchedAt: envelope.cachedAt,
    source: "refresh",
  });
}

async function defaultEditPendingReply(
  pending: PendingStatsReplyRecord,
  payload: JsonObject,
): Promise<void> {
  const rest = new DiscordRestClient(undefined);
  const result = await rest.editWebhookMessage(
    pending.applicationId,
    pending.token,
    "@original",
    payload,
  );

  if (result.isErr()) {
    throw result.error;
  }
}

function embedPayload(embed: { toJSON(): JsonObject }): JsonObject {
  return {
    embeds: [embed.toJSON()],
  };
}

function failureMessageFromError(error: StatsFetchError): string {
  switch (error.kind) {
    case "profile-not-found":
      return "Could not find this player profile on stats.cc.";
    case "invalid-profile":
    case "invalid-payload":
      return "Stats data was unavailable or invalid for this player.";
    case "http-status":
      return error.status
        ? `Stats provider returned HTTP ${error.status}.`
        : "Stats provider returned an error.";
    case "network":
      return "Stats provider request failed. Please try again later.";
    case "season-not-found":
      return "Requested season was not available for this player.";
    default:
      return "Could not refresh player stats.";
  }
}

async function updatePendingRepliesAfterFailure(
  env: StatsRefreshEnv,
  message: StatsRefreshMessage,
  error: StatsFetchError,
  editPendingReply: (pending: PendingStatsReplyRecord, payload: JsonObject) => Promise<void>,
): Promise<void> {
  const pendingReplies = await listPendingStatsReplies(
    env.Cache,
    message.username,
    message.platform,
  );
  if (pendingReplies.length === 0) {
    return;
  }

  const failurePayload = embedPayload(buildRefreshFailureEmbed(failureMessageFromError(error)));
  for (const pending of pendingReplies) {
    try {
      await editPendingReply(pending, failurePayload);
    } catch (editError) {
      logger.warn(
        "stats.pending_reply.edit_failed",
        "Failed to edit pending reply after non-retryable refresh failure",
        {
          key: pending.key,
          username: message.username,
          platform: message.platform,
          error: editError,
        },
      );
    } finally {
      await deletePendingStatsReply(env.Cache, pending.key);
    }
  }
}

async function updatePendingRepliesAfterSuccess(
  env: StatsRefreshEnv,
  message: StatsRefreshMessage,
  latestEnvelope: StatsCacheEnvelope,
  seasonCatalog: readonly SeasonCatalogEntry[],
  envelopesBySeason: ReadonlyMap<string, StatsCacheEnvelope>,
  editPendingReply: (pending: PendingStatsReplyRecord, payload: JsonObject) => Promise<void>,
): Promise<void> {
  const pendingReplies = await listPendingStatsReplies(
    env.Cache,
    message.username,
    message.platform,
  );
  if (pendingReplies.length === 0) {
    return;
  }

  for (const pending of pendingReplies) {
    let payload: JsonObject;

    const rawSeason = pending.requestedSeasonRaw?.trim() ?? "";
    if (!rawSeason) {
      payload = embedPayload(buildStatsEmbed(latestEnvelope, "cache", false));
    } else {
      const canonicalSeason =
        pending.requestedSeasonCanonical ??
        canonicalizeSeasonSelector(rawSeason, seasonCatalog) ??
        normalizeSeasonSelector(rawSeason);
      const seasonEnvelope = envelopesBySeason.get(canonicalSeason);

      payload = seasonEnvelope
        ? embedPayload(buildStatsEmbed(seasonEnvelope, "cache", false))
        : embedPayload(buildSeasonNotFoundEmbed(rawSeason, seasonCatalog));
    }

    try {
      await editPendingReply(pending, payload);
    } catch (editError) {
      logger.warn("stats.pending_reply.edit_failed", "Failed to edit pending stats reply", {
        key: pending.key,
        username: message.username,
        platform: message.platform,
        error: editError,
      });
    } finally {
      await deletePendingStatsReply(env.Cache, pending.key);
    }
  }
}

export async function processStatsRefreshMessage(
  env: StatsRefreshEnv,
  message: StatsRefreshMessage,
  deps: StatsRefreshDeps = {},
): Promise<void> {
  const fetchStatsCollection =
    deps.fetchStatsCollection ??
    ((username, platform) => fetchAndScrapeStatsCollectionResult(username, platform));
  const persistSnapshot = deps.persistSnapshot ?? defaultPersistSnapshot;
  const editPendingReply = deps.editPendingReply ?? defaultEditPendingReply;
  const fetchResult = await fetchStatsCollection(message.username, message.platform);

  if (fetchResult.isErr()) {
    logger.warn("stats.refresh.scrape_failed", "Stats refresh scrape failed", {
      username: message.username,
      platform: message.platform,
      error: fetchResult.error,
    });
    if (fetchResult.error.retryable) {
      throw new Error(fetchResult.error.message);
    }

    await updatePendingRepliesAfterFailure(env, message, fetchResult.error, editPendingReply);
    return;
  }

  const collection = fetchResult.value;
  const latestEnvelope = buildStatsEnvelope(
    message.username,
    collection.latest.profile,
    collection.latest.ranked_stats,
  );
  const envelopesBySeason = new Map<string, StatsCacheEnvelope>();

  const latestWrite = await writeStatsCacheResult(
    env.Cache,
    buildStatsCacheKey(message.username, message.platform, "latest"),
    latestEnvelope,
  );
  if (latestWrite.isErr()) {
    logger.error("stats.refresh.cache_failed", "Failed to write latest stats cache", {
      username: message.username,
      platform: message.platform,
      error: latestWrite.error,
    });
    throw new Error(latestWrite.error.message);
  }

  for (const season of collection.seasonCatalog) {
    const scrapedStats = collection.bySeason[season.slug];
    if (!scrapedStats) {
      continue;
    }

    const envelope = buildStatsEnvelope(
      message.username,
      scrapedStats.profile,
      scrapedStats.ranked_stats,
    );
    envelopesBySeason.set(season.slug, envelope);

    const writeResult = await writeStatsCacheResult(
      env.Cache,
      buildStatsCacheKey(message.username, message.platform, season.slug),
      envelope,
    );
    if (writeResult.isErr()) {
      logger.error("stats.refresh.cache_failed", "Failed to write seasonal stats cache", {
        username: message.username,
        platform: message.platform,
        season: season.slug,
        error: writeResult.error,
      });
      throw new Error(writeResult.error.message);
    }
  }

  await writePlayerSeasonCatalog(
    env.Cache,
    message.username,
    message.platform,
    collection.seasonCatalog,
  );
  const existingGlobalCatalog = await readGlobalSeasonCatalog(env.Cache);
  await writeGlobalSeasonCatalog(
    env.Cache,
    mergeSeasonCatalog(existingGlobalCatalog, collection.seasonCatalog),
  );

  await ResultAsync.fromPromise(
    persistSnapshot(env.Database, latestEnvelope),
    (cause) => cause,
  ).match(
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
      typeof latestEnvelope.profile.platform === "string"
        ? latestEnvelope.profile.platform
        : message.platform;
    if (isStatsPlatform(resolvedPlatform) && resolvedPlatform !== "auto") {
      await env.Cache.put(buildScrapeDayKey(message.username, resolvedPlatform), "1", {
        expirationTtl: secondsUntilNextUtcDay(),
      });
    }
  }

  await updatePendingRepliesAfterSuccess(
    env,
    message,
    latestEnvelope,
    collection.seasonCatalog,
    envelopesBySeason,
    editPendingReply,
  );

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
    cacheKey: buildStatsCacheKey(input.username, input.platform, "latest"),
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

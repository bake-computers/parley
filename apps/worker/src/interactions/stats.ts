import type { KVNamespace } from "@cloudflare/workers-types";
import {
  autocompleteChoice,
  ComponentHandler,
  ComponentType,
  type AppEmojiName,
  resolveApplicationEmojiCatalog,
  SlashCommand,
} from "@parley/discord-runtime";
import type { WorkerRuntimeEnv } from "../env";
import { type StatsPlatform } from "@parley/core/http";
import { logger } from "@parley/core/logger";
import {
  buildInternalStatsOnlyMessage,
  buildProcessingStatsMessage,
  buildQueueUnavailableMessage,
  buildStatsMessagePayload,
  type InternalStatsSummary,
  parseStatsPaginationCustomId,
  STATS_PAGINATION_PREFIX,
} from "@parley/core/stats-embeds";
import { resolveStatsEnvelopePlayerId } from "@parley/core/player-identity";
import {
  getInternalPlayerSummaryByIdentity,
  getInternalPlayerSummaryByPlayerId,
  isExternalStatsRefreshLocked,
} from "@parley/core/player-ratings";
import { seedScoreToInternalElo } from "@parley/core/internal-elo";
import {
  buildStatsCacheKey,
  isStatsCacheStale,
  readGlobalSeasonCatalog,
  readPlayerSeasonCatalog,
  readStatsCache,
} from "@parley/core/stats-cache";
import {
  checkTrackedPlayerDailyCap,
  consumeExecutorDailyQuota,
  formatDiscordRetryAt,
  isBotOwner,
  nextUtcDayUnix,
} from "@parley/core/stats-rate-limit";
import {
  buildBuiltinRecentSeasonCatalog,
  canonicalizeSeasonSelector,
  normalizeSeasonDisplay,
  normalizeSeasonSelector,
  type SeasonCatalogEntry,
} from "@parley/core/stats-season";
import { readStatsViewState, writeStatsViewState } from "@parley/core/stats-view-state";
import { calculateSeedMetrics } from "@parley/core/team-balance";
import {
  createStatsRefreshMessage,
  enqueueStatsRefresh,
  registerPendingStatsReply,
  type StatsRefreshEnv,
} from "../queues/stats-refresh";
import { buildComponentsV2Reply, buildNoticeCard, EPHEMERAL_COMPONENTS_V2_FLAGS } from "./ui";

function parsePlatform(value: string | null): StatsPlatform {
  if (value === "pc" || value === "xbox" || value === "playstation") {
    return value;
  }
  return "auto";
}

function trimToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildTrackedPlayerLimitMessage(hasCachedStats: boolean, retryAtUnix: number): string {
  const retryAt = formatDiscordRetryAt(retryAtUnix);
  if (hasCachedStats) {
    return `Refresh is capped for this tracked player today. Cached stats are shown above.\nRetry at ${retryAt}.`;
  }
  return `Refresh is capped for this tracked player today and no cached stats are available.\nRetry at ${retryAt}.`;
}

function buildExecutorLimitMessage(retryAtUnix: number): string {
  return `You've reached the /stats refresh cap (3 requests per day).\nRetry at ${formatDiscordRetryAt(retryAtUnix)}.`;
}

function buildStatsNoticeReply(
  title: string,
  message: string,
  tone: "danger" | "info" | "warning",
  emojiName: AppEmojiName,
  emojis: Awaited<ReturnType<typeof resolveStatsEmojiCatalog>>,
) {
  return buildComponentsV2Reply([
    buildNoticeCard({
      title,
      message,
      tone,
      emojis,
      emojiName,
    }),
  ]);
}

function toInternalStatsSummary(
  summary: Awaited<ReturnType<typeof getInternalPlayerSummaryByPlayerId>>,
): InternalStatsSummary | null {
  if (!summary) {
    return null;
  }

  return {
    username: summary.username,
    platform: summary.platform,
    internalElo: summary.internalElo,
    internalMatches: summary.internalMatches,
    internalWins: summary.internalWins,
    internalLosses: summary.internalLosses,
    externalRefreshLocked: isExternalStatsRefreshLocked(summary),
  };
}

function toProvisionalInternalStatsSummary(
  envelope: NonNullable<Awaited<ReturnType<typeof readStatsCache>>>,
  summary: Awaited<ReturnType<typeof getInternalPlayerSummaryByPlayerId>>,
): InternalStatsSummary {
  if (summary && summary.internalMatches > 0) {
    return toInternalStatsSummary(summary)!;
  }

  const seedMetrics = calculateSeedMetrics({
    rankPoints: Number(envelope.rankedStats.rank_points ?? 0),
    kdRatio: Number(envelope.rankedStats.kd_ratio ?? 0),
    kost: Number(envelope.calculatedMetrics.kost ?? 0),
    kills: Number(envelope.rankedStats.kills ?? 0),
    headshotPercentage: Number(envelope.rankedStats.headshot_percentage ?? 0),
    payloadJson: JSON.stringify({
      profile: envelope.profile,
      ranked_stats: envelope.rankedStats,
      calculated_metrics: envelope.calculatedMetrics,
    }),
  });

  return {
    username: summary?.username ?? envelope.username,
    platform:
      summary?.platform ??
      (typeof envelope.profile.platform === "string" ? envelope.profile.platform : "unknown"),
    internalElo: seedScoreToInternalElo(seedMetrics.seedScore),
    internalMatches: summary?.internalMatches ?? 0,
    internalWins: summary?.internalWins ?? 0,
    internalLosses: summary?.internalLosses ?? 0,
    externalRefreshLocked: isExternalStatsRefreshLocked(summary),
  };
}

async function resolveSeasonCatalog(
  cache: KVNamespace | null | undefined,
  username: string,
  platform: StatsPlatform,
): Promise<SeasonCatalogEntry[]> {
  const playerCatalog = await readPlayerSeasonCatalog(cache, username, platform);
  if (playerCatalog && playerCatalog.length > 0) {
    return playerCatalog;
  }

  const globalCatalog = await readGlobalSeasonCatalog(cache);
  if (globalCatalog && globalCatalog.length > 0) {
    return globalCatalog;
  }

  return buildBuiltinRecentSeasonCatalog();
}

function filterSeasonChoices(
  catalog: readonly SeasonCatalogEntry[],
  query: string,
): { name: string; value: string }[] {
  const normalizedQuery = normalizeSeasonDisplay(query);
  const deduped = new Map<string, SeasonCatalogEntry>();
  for (const season of catalog) {
    if (!deduped.has(season.slug)) {
      deduped.set(season.slug, season);
    }
  }

  return [...deduped.values()]
    .filter((season) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        normalizeSeasonDisplay(season.display).includes(normalizedQuery) ||
        normalizeSeasonSelector(season.slug).includes(normalizeSeasonSelector(normalizedQuery))
      );
    })
    .slice(0, 25)
    .map((season) => ({
      name: season.display,
      value: season.slug,
    }));
}

async function checkRefreshTriggerLimits(
  cache: KVNamespace | null | undefined,
  username: string,
  platform: StatsPlatform,
  executorId: string | undefined,
  ownerId: string | undefined,
): Promise<{
  blocked: boolean;
  reason: "executor" | "tracked-player" | null;
  retryAtUnix: number;
}> {
  if (isBotOwner(executorId, ownerId)) {
    return {
      blocked: false,
      reason: null,
      retryAtUnix: nextUtcDayUnix(),
    };
  }

  const executorQuota = await consumeExecutorDailyQuota(cache, executorId);
  if (executorQuota.isLimited) {
    return {
      blocked: true,
      reason: "executor",
      retryAtUnix: executorQuota.retryAtUnix,
    };
  }

  const trackedPlayerCap = await checkTrackedPlayerDailyCap(cache, username, platform);
  if (trackedPlayerCap.isLimited) {
    return {
      blocked: true,
      reason: "tracked-player",
      retryAtUnix: trackedPlayerCap.retryAtUnix,
    };
  }

  return {
    blocked: false,
    reason: null,
    retryAtUnix: nextUtcDayUnix(),
  };
}

async function resolveStatsEmojiCatalog(
  env: Partial<WorkerRuntimeEnv> & StatsRefreshEnv,
  applicationId: string,
) {
  return resolveApplicationEmojiCatalog({
    applicationId,
    botToken: env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN,
    cache: env.Cache,
  });
}

export const statsCommand = new SlashCommand()
  .setName("stats")
  .setDescription("Show ranked Siege stats for a player")
  .addStringOption((option) =>
    option
      .setName("username")
      .setDescription("Exact in-game username")
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(64),
  )
  .addStringOption((option) =>
    option
      .setName("platform")
      .setDescription("Platform to look up")
      .setRequired(false)
      .addChoices(
        { name: "Auto", value: "auto" },
        { name: "PC", value: "pc" },
        { name: "Xbox", value: "xbox" },
        { name: "PlayStation", value: "playstation" },
      ),
  )
  .addStringOption((option) =>
    option
      .setName("season")
      .setDescription("Season name (for example: Deep Freeze)")
      .setRequired(false)
      .setAutocomplete(true),
  )
  .addAutocompleteHandler(async (interaction) => {
    const focused = interaction.options.getFocused();
    if (!focused || focused.name !== "season") {
      await interaction.respond([]);
      return;
    }

    const username = trimToNull(interaction.options.getString("username", false));
    const platform = parsePlatform(interaction.options.getString("platform", false));
    const query = typeof focused.value === "string" ? focused.value : String(focused.value ?? "");
    const env = interaction.context.env as Partial<WorkerRuntimeEnv> & StatsRefreshEnv;

    const catalog = username
      ? await resolveSeasonCatalog(env.Cache, username, platform)
      : ((await readGlobalSeasonCatalog(env.Cache)) ?? buildBuiltinRecentSeasonCatalog());

    await interaction.respond(
      filterSeasonChoices(catalog, query).map((choice) =>
        autocompleteChoice(choice.name, choice.value),
      ),
    );
  })
  .addHandler(async (interaction) => {
    const username = interaction.options.getString("username", true)!.trim();
    const platform = parsePlatform(interaction.options.getString("platform", false));
    const requestedSeason = trimToNull(interaction.options.getString("season", false));
    const env = interaction.context.env as Partial<WorkerRuntimeEnv> & StatsRefreshEnv;
    const cache = env.Cache;

    await interaction.deferReply(true);
    const emojis = await resolveStatsEmojiCatalog(env, interaction.applicationId);

    const seasonCatalog = await resolveSeasonCatalog(cache, username, platform);
    const canonicalRequestedSeason = requestedSeason
      ? (canonicalizeSeasonSelector(requestedSeason, seasonCatalog) ??
        normalizeSeasonSelector(requestedSeason))
      : null;
    const cacheKey = buildStatsCacheKey(username, platform, canonicalRequestedSeason ?? "latest");
    const cachedEnvelope = await readStatsCache(cache, cacheKey);
    let playerSummary = await getInternalPlayerSummaryByIdentity(env.db, username, platform);

    if (cachedEnvelope) {
      const cachedPlayerId = await resolveStatsEnvelopePlayerId(env.db, cachedEnvelope);
      if (cachedPlayerId !== null) {
        playerSummary =
          (await getInternalPlayerSummaryByPlayerId(env.db, cachedPlayerId)) ?? playerSummary;
      }

      const refreshLocked = isExternalStatsRefreshLocked(playerSummary);
      const stale = isStatsCacheStale(cachedEnvelope.cachedAt);
      await writeStatsViewState(cache, interaction.id, { cacheKey });
      const payload = buildStatsMessagePayload(
        cachedEnvelope,
        "cache",
        stale && !refreshLocked,
        interaction.id,
        0,
        toProvisionalInternalStatsSummary(cachedEnvelope, playerSummary),
        emojis,
      );
      await interaction.editReply(buildComponentsV2Reply(payload.components));

      if (!stale || refreshLocked) {
        return;
      }

      const refreshLimit = await checkRefreshTriggerLimits(
        cache,
        username,
        platform,
        interaction.userId,
        env.DISCORD_BOT_OWNER_ID,
      );
      if (refreshLimit.blocked) {
        const message =
          refreshLimit.reason === "executor"
            ? buildExecutorLimitMessage(refreshLimit.retryAtUnix)
            : buildTrackedPlayerLimitMessage(true, refreshLimit.retryAtUnix);
        await interaction.followUp(
          buildComponentsV2Reply([buildQueueUnavailableMessage(message, emojis)]),
          true,
        );
        return;
      }

      const enqueueResult = await enqueueStatsRefresh(
        env,
        createStatsRefreshMessage({
          username,
          platform,
          reason: "stale-cache",
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.userId,
        }),
      );

      if (enqueueResult.isErr()) {
        logger.error("stats.command.queue_failed", "Failed to queue stale stats refresh", {
          username,
          platform,
          reason: "stale-cache",
          error: enqueueResult.error,
        });
        return;
      }

      if (enqueueResult.value.status === "daily-capped") {
        await interaction.followUp(
          buildComponentsV2Reply([
            buildQueueUnavailableMessage(
              buildTrackedPlayerLimitMessage(true, nextUtcDayUnix(Date.now())),
              emojis,
            ),
          ]),
          true,
        );
        return;
      }

      if (enqueueResult.value.status === "queued" || enqueueResult.value.status === "deduped") {
        await registerPendingStatsReply(cache, {
          interactionId: interaction.id,
          applicationId: interaction.applicationId,
          token: interaction.token,
          username,
          platform,
          requestedSeasonRaw: requestedSeason,
          requestedSeasonCanonical: canonicalRequestedSeason,
          requestedAt: Date.now(),
        });
      }

      return;
    }

    if (isExternalStatsRefreshLocked(playerSummary)) {
      const internalSummary = toInternalStatsSummary(playerSummary);
      if (!internalSummary) {
        await interaction.editReply(
          buildComponentsV2Reply([buildQueueUnavailableMessage(undefined, emojis)]),
        );
        return;
      }

      await interaction.editReply(
        buildComponentsV2Reply([buildInternalStatsOnlyMessage(internalSummary, emojis)]),
      );
      return;
    }

    const refreshLimit = await checkRefreshTriggerLimits(
      cache,
      username,
      platform,
      interaction.userId,
      env.DISCORD_BOT_OWNER_ID,
    );
    if (refreshLimit.blocked) {
      const message =
        refreshLimit.reason === "executor"
          ? buildExecutorLimitMessage(refreshLimit.retryAtUnix)
          : buildTrackedPlayerLimitMessage(false, refreshLimit.retryAtUnix);
      await interaction.editReply(
        buildComponentsV2Reply([buildQueueUnavailableMessage(message, emojis)]),
      );
      return;
    }

    const enqueueResult = await enqueueStatsRefresh(
      env,
      createStatsRefreshMessage({
        username,
        platform,
        reason: "cache-miss",
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.userId,
      }),
    );

    if (enqueueResult.isErr()) {
      logger.error("stats.command.queue_failed", "Failed to queue stats refresh", {
        username,
        platform,
        reason: "cache-miss",
        error: enqueueResult.error,
      });
      await interaction.editReply(
        buildComponentsV2Reply([buildQueueUnavailableMessage(undefined, emojis)]),
      );
      return;
    }

    if (enqueueResult.value.status === "daily-capped") {
      await interaction.editReply(
        buildComponentsV2Reply([
          buildQueueUnavailableMessage(
            buildTrackedPlayerLimitMessage(false, nextUtcDayUnix()),
            emojis,
          ),
        ]),
      );
      return;
    }

    await registerPendingStatsReply(cache, {
      interactionId: interaction.id,
      applicationId: interaction.applicationId,
      token: interaction.token,
      username,
      platform,
      requestedSeasonRaw: requestedSeason,
      requestedSeasonCanonical: canonicalRequestedSeason,
      requestedAt: Date.now(),
    });

    await interaction.editReply(
      buildComponentsV2Reply([
        buildProcessingStatsMessage(username, platform, requestedSeason, emojis),
      ]),
    );
  });

export const statsPaginationHandler = new ComponentHandler(
  STATS_PAGINATION_PREFIX,
  ComponentType.Button,
).addHandler(async (interaction) => {
  const parsedCustomId = parseStatsPaginationCustomId(interaction.customId);
  if (!parsedCustomId) {
    const emojis = await resolveStatsEmojiCatalog(
      interaction.context.env as Partial<WorkerRuntimeEnv> & StatsRefreshEnv,
      interaction.applicationId,
    );
    await interaction.reply(
      buildStatsNoticeReply(
        "Stats control expired",
        "This stats control is no longer valid.",
        "warning",
        "warning",
        emojis,
      ),
      true,
    );
    return;
  }

  const env = interaction.context.env as Partial<WorkerRuntimeEnv> & StatsRefreshEnv;
  const state = await readStatsViewState(env.Cache, parsedCustomId.viewId);
  if (!state) {
    const emojis = await resolveStatsEmojiCatalog(env, interaction.applicationId);
    await interaction.reply(
      buildStatsNoticeReply(
        "Stats view expired",
        "This stats view expired. Run `/stats` again.",
        "warning",
        "timer",
        emojis,
      ),
      true,
    );
    return;
  }

  const envelope = await readStatsCache(env.Cache, state.cacheKey);
  if (!envelope) {
    const emojis = await resolveStatsEmojiCatalog(env, interaction.applicationId);
    await interaction.reply(
      buildStatsNoticeReply(
        "Stats cache expired",
        "Stats are no longer cached. Run `/stats` again.",
        "danger",
        "cancel",
        emojis,
      ),
      true,
    );
    return;
  }

  const playerId = await resolveStatsEnvelopePlayerId(env.db, envelope);
  const playerSummary =
    playerId === null ? null : await getInternalPlayerSummaryByPlayerId(env.db, playerId);
  const emojis = await resolveStatsEmojiCatalog(env, interaction.applicationId);
  const payload = buildStatsMessagePayload(
    envelope,
    "cache",
    isStatsCacheStale(envelope.cachedAt) && !isExternalStatsRefreshLocked(playerSummary),
    parsedCustomId.viewId,
    parsedCustomId.page,
    toProvisionalInternalStatsSummary(envelope, playerSummary),
    emojis,
  );
  await interaction.update({
    ...buildComponentsV2Reply(payload.components),
    flags: EPHEMERAL_COMPONENTS_V2_FLAGS,
  });
});

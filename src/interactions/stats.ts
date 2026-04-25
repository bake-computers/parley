import { autocompleteChoice, SlashCommand } from "../lib/discord";
import { type StatsPlatform } from "../lib/http";
import { logger } from "../lib/logger";
import {
  buildProcessingStatsEmbed,
  buildQueueUnavailableEmbed,
  buildStatsEmbed,
} from "../lib/stats-embeds";
import {
  buildStatsCacheKey,
  isStatsCacheStale,
  readGlobalSeasonCatalog,
  readPlayerSeasonCatalog,
  readStatsCache,
} from "../lib/stats-cache";
import {
  buildBuiltinRecentSeasonCatalog,
  canonicalizeSeasonSelector,
  normalizeSeasonDisplay,
  normalizeSeasonSelector,
  type SeasonCatalogEntry,
} from "../lib/stats-season";
import {
  createStatsRefreshMessage,
  enqueueStatsRefresh,
  registerPendingStatsReply,
  type StatsRefreshEnv,
} from "../queues/stats-refresh";

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
    const env = interaction.context.env as Partial<Env> & StatsRefreshEnv;

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
    const env = interaction.context.env as Partial<Env> & StatsRefreshEnv;
    const cache = env.Cache;

    await interaction.deferReply(false);

    const seasonCatalog = await resolveSeasonCatalog(cache, username, platform);
    const canonicalRequestedSeason = requestedSeason
      ? (canonicalizeSeasonSelector(requestedSeason, seasonCatalog) ??
        normalizeSeasonSelector(requestedSeason))
      : null;
    const cacheKey = buildStatsCacheKey(username, platform, canonicalRequestedSeason ?? "latest");
    const cachedEnvelope = await readStatsCache(cache, cacheKey);

    if (cachedEnvelope) {
      const stale = isStatsCacheStale(cachedEnvelope.cachedAt);
      await interaction.editReply({
        embeds: [buildStatsEmbed(cachedEnvelope, "cache", stale)],
      });

      if (!stale) {
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
      await interaction.editReply({
        embeds: [buildQueueUnavailableEmbed()],
      });
      return;
    }

    if (enqueueResult.value.status === "daily-capped") {
      await interaction.editReply({
        embeds: [
          buildQueueUnavailableEmbed(
            "Refresh is capped for this player today and no cached stats are available.",
          ),
        ],
      });
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

    await interaction.editReply({
      embeds: [buildProcessingStatsEmbed(username, platform, requestedSeason)],
    });
  });

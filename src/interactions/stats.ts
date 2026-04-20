import { EmbedBuilder, SlashCommandHandler } from "honocord";
import type { D1Database } from "@cloudflare/workers-types";
import { persistStatsSnapshot } from "../lib/db/stats-snapshot";
import { calculateKost, fetchAndScrapeStats, formatOutput } from "../lib/http";
import {
  buildStatsCacheKey,
  isStatsCacheStale,
  readStatsCache,
  STATS_CACHE_SCHEMA_VERSION,
  statsCacheAgeMinutes,
  type DataMap,
  type StatsCacheEnvelope,
  writeStatsCache,
} from "../lib/stats-cache";

const numberFormatter = new Intl.NumberFormat("en-US");

type StatsDataSource = "live" | "cache";

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatInteger(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

function formatDecimal(value: unknown, digits = 2): string {
  return toNumber(value).toFixed(digits);
}

function formatPercent(value: unknown, digits = 2): string {
  return `${formatDecimal(value, digits)}%`;
}

function formatText(value: unknown, fallback = "N/A"): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function formatRank(rank: unknown, tier: unknown): string {
  const rankLabel = formatText(rank, "Unknown");
  const tierLabel = formatText(tier, "").trim();

  if (!tierLabel || tierLabel.toLowerCase() === rankLabel.toLowerCase()) {
    return rankLabel;
  }

  return `${rankLabel} ${tierLabel}`;
}

function buildStatsEnvelope(
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

async function fetchLiveEnvelope(username: string): Promise<StatsCacheEnvelope | null> {
  const scrapedStats = await fetchAndScrapeStats(username);
  if (!scrapedStats) {
    return null;
  }

  return buildStatsEnvelope(
    username,
    (scrapedStats.profile ?? {}) as DataMap,
    (scrapedStats.ranked_stats ?? {}) as DataMap,
  );
}

function buildStatsEmbed(
  envelope: StatsCacheEnvelope,
  source: StatsDataSource,
  stale: boolean,
): EmbedBuilder {
  const profile = envelope.profile;
  const ranked = envelope.rankedStats;
  const calculated = envelope.calculatedMetrics;

  const profileName = formatText(profile.username, envelope.username);
  const currentRank = formatRank(ranked.current_rank, ranked.current_rank_tier);
  const computedKost = calculateKost(ranked);
  const cachedAgeMinutes = statsCacheAgeMinutes(envelope.cachedAt);
  const sourceLabel =
    source === "cache"
      ? stale
        ? `Cached ${cachedAgeMinutes}m ago. Refreshing in background.`
        : `Cached ${cachedAgeMinutes}m ago.`
      : "Live snapshot from stats.cc";

  const embed = new EmbedBuilder()
    .setColor(stale ? 0x92400e : source === "cache" ? 0x334155 : 0x0f766e)
    .setTitle(`Siege Stats: ${profileName}`)
    .setDescription(
      `Platform: ${formatText(profile.platform, "Unknown")} • Level: ${formatInteger(profile.level)}`,
    )
    .addFields(
      {
        name: "Current Rank",
        value: `${currentRank}\nRank Points: ${formatInteger(ranked.rank_points)}`,
        inline: true,
      },
      {
        name: "Record",
        value:
          `Matches: ${formatInteger(ranked.matches)}\n` +
          `Wins/Losses: ${formatInteger(ranked.wins)} / ${formatInteger(ranked.losses)}\n` +
          `Win Rate: ${formatPercent(ranked.win_rate)}`,
        inline: true,
      },
      {
        name: "Combat",
        value:
          `Kills: ${formatInteger(ranked.kills)}\n` +
          `Deaths: ${formatInteger(ranked.deaths)}\n` +
          `Assists: ${formatInteger(ranked.assists)}\n` +
          `K/D: ${formatDecimal(ranked.kd_ratio, 2)}`,
        inline: true,
      },
      {
        name: "Precision",
        value:
          `Headshots: ${formatInteger(ranked.headshots)}\n` +
          `Headshot Rate: ${formatPercent(ranked.headshot_percentage)}`,
        inline: true,
      },
      {
        name: "Impact",
        value:
          `Estimated KOST: ${formatPercent(computedKost)}\n` +
          `KOST Range: ${formatPercent(calculated.kost_lower_bound)} to ${formatPercent(calculated.kost_upper_bound)}`,
        inline: true,
      },
      {
        name: "Round Snapshot",
        value:
          `Rounds Played: ${formatInteger(ranked.rounds_played)}\n` +
          `Kill Rounds: ${formatInteger(ranked.kill_rounds)}\n` +
          `Survival Rounds: ${formatInteger(ranked.survival_rounds)}\n` +
          `Traded Rounds: ${formatInteger(ranked.traded_rounds)}`,
        inline: true,
      },
    )
    .setFooter({ text: sourceLabel })
    .setTimestamp(new Date(envelope.cachedAt));

  const profileUrl = formatText(profile.profile_url, "");
  if (profileUrl) {
    embed.setURL(profileUrl);
  }

  return embed;
}

async function persistEnvelope(
  database: D1Database | null | undefined,
  envelope: StatsCacheEnvelope,
  source: "live" | "refresh",
): Promise<void> {
  try {
    await persistStatsSnapshot(database, {
      profile: envelope.profile,
      rankedStats: envelope.rankedStats,
      calculatedMetrics: envelope.calculatedMetrics,
      cacheVersion: envelope.version,
      fetchedAt: envelope.cachedAt,
      source,
    });
  } catch (error) {
    console.error("Failed to persist stats snapshot", error);
  }
}

async function refreshCacheInBackground(
  username: string,
  cacheKey: string,
  cache: KVNamespace | null | undefined,
  database: D1Database | null | undefined,
): Promise<void> {
  const liveEnvelope = await fetchLiveEnvelope(username);
  if (!liveEnvelope) {
    return;
  }

  await writeStatsCache(cache, cacheKey, liveEnvelope);
  await persistEnvelope(database, liveEnvelope, "refresh");
}

export const statsCommand = new SlashCommandHandler()
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
  .addHandler(async (interaction) => {
    const username = interaction.options.getString("username", true).trim();
    const env = interaction.context.env as Partial<Env>;
    const cache = env.Cache;
    const database = env.Database as D1Database | null | undefined;
    const cacheKey = buildStatsCacheKey(username);

    await interaction.deferReply(false);

    const cachedEnvelope = await readStatsCache(cache, cacheKey);
    if (cachedEnvelope) {
      const stale = isStatsCacheStale(cachedEnvelope.cachedAt);

      await interaction.editReply({
        embeds: [buildStatsEmbed(cachedEnvelope, "cache", stale)],
      });

      if (stale) {
        void refreshCacheInBackground(username, cacheKey, cache, database);
      }

      return;
    }

    const liveEnvelope = await fetchLiveEnvelope(username);
    if (!liveEnvelope) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xb91c1c)
            .setTitle("Stats unavailable")
            .setDescription(
              "Could not retrieve data for that username. Confirm the name and try again.",
            ),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [buildStatsEmbed(liveEnvelope, "live", false)],
    });

    void writeStatsCache(cache, cacheKey, liveEnvelope);
    void persistEnvelope(database, liveEnvelope, "live");
  });

import { EmbedBuilder } from "./discord";
import { calculateKost, type StatsPlatform } from "./http";
import { statsCacheAgeMinutes, type StatsCacheEnvelope } from "./stats-cache";
import type { SeasonCatalogEntry } from "./stats-season";

const numberFormatter = new Intl.NumberFormat("en-US");

export type StatsDataSource = "live" | "cache";

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

function availableSeasonsLine(catalog: readonly SeasonCatalogEntry[]): string {
  if (catalog.length === 0) {
    return "No ranked seasons were found for this player.";
  }

  return catalog.map((entry) => entry.display).join(", ");
}

export function buildStatsEmbed(
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
  const seasonLabel = formatText(ranked.season_display, formatText(ranked.season, "Latest"));

  const embed = new EmbedBuilder()
    .setColor(stale ? 0x92400e : source === "cache" ? 0x334155 : 0x0f766e)
    .setTitle(`Siege Stats: ${profileName}`)
    .setDescription(
      `Season: ${seasonLabel}\nPlatform: ${formatText(profile.platform, "Unknown")} • Level: ${formatInteger(profile.level)}`,
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

export function buildProcessingStatsEmbed(
  username: string,
  platform: StatsPlatform,
  season: string | null,
): EmbedBuilder {
  const seasonLine = season?.trim() ? `\nSeason: ${season.trim()}` : "";
  return new EmbedBuilder()
    .setColor(0x334155)
    .setTitle("Processing stats request")
    .setDescription(`Username: ${username}\nPlatform: ${platform}${seasonLine}`);
}

export function buildQueueUnavailableEmbed(
  message = "Could not queue a stat refresh. Try again later.",
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xb91c1c)
    .setTitle("Refresh unavailable")
    .setDescription(message);
}

export function buildSeasonNotFoundEmbed(
  requestedSeason: string,
  availableSeasons: readonly SeasonCatalogEntry[],
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xb45309)
    .setTitle("Season not found")
    .setDescription(
      `Requested season: ${requestedSeason}\nAvailable seasons: ${availableSeasonsLine(availableSeasons)}`,
    );
}

export function buildRefreshFailureEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xb91c1c)
    .setTitle("Stats refresh failed")
    .setDescription(message);
}

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "./discord";
import { calculateKost, type StatsPlatform } from "./http";
import { statsCacheAgeMinutes, type StatsCacheEnvelope } from "./stats-cache";
import type { SeasonCatalogEntry } from "./stats-season";

const numberFormatter = new Intl.NumberFormat("en-US");
const STATS_PAGE_LABELS = ["Overview", "Combat", "Rounds"] as const;

export const STATS_PAGINATION_PREFIX = "stats-page";
export const STATS_PAGE_COUNT = STATS_PAGE_LABELS.length;

export type StatsDataSource = "live" | "cache";

export interface StatsPaginationCustomId {
  viewId: string;
  page: number;
}

export interface StatsMessagePayload {
  embeds: [EmbedBuilder];
  components: [ActionRowBuilder<ButtonBuilder>];
}

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

function roundRate(roundCount: unknown, roundsPlayed: unknown): string {
  const totalRounds = toNumber(roundsPlayed);
  if (totalRounds <= 0) {
    return "0.0%";
  }
  const rate = (toNumber(roundCount) / totalRounds) * 100;
  return `${rate.toFixed(1)}%`;
}

export function clampStatsPage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(STATS_PAGE_COUNT - 1, Math.max(0, Math.floor(value)));
}

export function buildStatsPaginationCustomId(viewId: string, page: number): string {
  const safePage = clampStatsPage(page);
  return `${STATS_PAGINATION_PREFIX}/${encodeURIComponent(viewId)}?page=${safePage}`;
}

export function parseStatsPaginationCustomId(customId: string): StatsPaginationCustomId | null {
  const [pathRaw = "", queryRaw = ""] = customId.split("?");
  const path = pathRaw.split("/").filter(Boolean);
  if (path.length !== 2 || path[0] !== STATS_PAGINATION_PREFIX) {
    return null;
  }

  const pageValue = Number(new URLSearchParams(queryRaw).get("page"));
  if (!Number.isFinite(pageValue)) {
    return null;
  }

  try {
    const encodedViewId = path[1];
    if (!encodedViewId) {
      return null;
    }
    const viewId = decodeURIComponent(encodedViewId);
    if (!viewId) {
      return null;
    }
    return {
      viewId,
      page: clampStatsPage(pageValue),
    };
  } catch {
    return null;
  }
}

export function buildStatsPaginationRow(
  viewId: string,
  page: number,
): ActionRowBuilder<ButtonBuilder> {
  const activePage = clampStatsPage(page);
  const isFirst = activePage === 0;
  const isLast = activePage >= STATS_PAGE_COUNT - 1;
  const currentLabel = `Page ${activePage + 1}/${STATS_PAGE_COUNT}`;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildStatsPaginationCustomId(viewId, 0))
      .setLabel("First")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isFirst),
    new ButtonBuilder()
      .setCustomId(buildStatsPaginationCustomId(viewId, activePage - 1))
      .setLabel("Prev")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isFirst),
    new ButtonBuilder()
      .setCustomId(buildStatsPaginationCustomId(viewId, activePage))
      .setLabel(currentLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(buildStatsPaginationCustomId(viewId, activePage + 1))
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isLast),
    new ButtonBuilder()
      .setCustomId(buildStatsPaginationCustomId(viewId, STATS_PAGE_COUNT - 1))
      .setLabel("Last")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isLast),
  );
}

export function buildStatsEmbed(
  envelope: StatsCacheEnvelope,
  source: StatsDataSource,
  stale: boolean,
  page = 0,
): EmbedBuilder {
  const profile = envelope.profile;
  const ranked = envelope.rankedStats;
  const calculated = envelope.calculatedMetrics;
  const activePage = clampStatsPage(page);

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
  const sectionLabel = STATS_PAGE_LABELS[activePage];

  const embed = new EmbedBuilder()
    .setColor(stale ? 0x92400e : source === "cache" ? 0x334155 : 0x0f766e)
    .setTitle(`Siege Stats: ${profileName}`)
    .setDescription(
      `Season: ${seasonLabel}\nPlatform: ${formatText(profile.platform, "Unknown")} • Level: ${formatInteger(profile.level)}\nSection: ${sectionLabel}`,
    )
    .setFooter({ text: `${sourceLabel} • ${activePage + 1}/${STATS_PAGE_COUNT}` })
    .setTimestamp(new Date(envelope.cachedAt));

  if (activePage === 0) {
    embed.addFields(
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
        name: "At a Glance",
        value:
          `K/D: ${formatDecimal(ranked.kd_ratio, 2)}\n` +
          `Estimated KOST: ${formatPercent(computedKost)}\n` +
          `Headshot Rate: ${formatPercent(ranked.headshot_percentage)}`,
        inline: true,
      },
    );
  }

  if (activePage === 1) {
    embed.addFields(
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
    );
  }

  if (activePage === 2) {
    embed.addFields(
      {
        name: "Round Snapshot",
        value:
          `Rounds Played: ${formatInteger(ranked.rounds_played)}\n` +
          `Kill Rounds: ${formatInteger(ranked.kill_rounds)}\n` +
          `Survival Rounds: ${formatInteger(ranked.survival_rounds)}\n` +
          `Traded Rounds: ${formatInteger(ranked.traded_rounds)}`,
        inline: false,
      },
      {
        name: "Round Rates",
        value:
          `Kill Round Rate: ${roundRate(ranked.kill_rounds, ranked.rounds_played)}\n` +
          `Survival Round Rate: ${roundRate(ranked.survival_rounds, ranked.rounds_played)}\n` +
          `Trade Round Rate: ${roundRate(ranked.traded_rounds, ranked.rounds_played)}`,
        inline: false,
      },
    );
  }

  const profileUrl = formatText(profile.profile_url, "");
  if (profileUrl) {
    embed.setURL(profileUrl);
  }

  return embed;
}

export function buildStatsMessagePayload(
  envelope: StatsCacheEnvelope,
  source: StatsDataSource,
  stale: boolean,
  viewId: string,
  page = 0,
): StatsMessagePayload {
  const activePage = clampStatsPage(page);
  return {
    embeds: [buildStatsEmbed(envelope, source, stale, activePage)],
    components: [buildStatsPaginationRow(viewId, activePage)],
  };
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

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ApplicationEmojiCatalog,
  EmbedBuilder,
  formatApplicationEmoji,
  toComponentEmoji,
} from "@parley/discord-runtime";
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
  embeds: EmbedBuilder[];
  components: [ActionRowBuilder<ButtonBuilder>];
}

export interface InternalStatsSummary {
  username: string;
  platform: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
  externalRefreshLocked: boolean;
}

function prefixWithEmoji(
  title: string,
  emojis: ApplicationEmojiCatalog | null | undefined,
  emojiName: "cancel" | "question_mark" | "search" | "timer" | "warning",
): string {
  const emoji = formatApplicationEmoji(emojis, emojiName);
  return emoji ? `${emoji} ${title}` : title;
}

function applyButtonEmoji(
  button: ButtonBuilder,
  emoji: ReturnType<typeof toComponentEmoji>,
): ButtonBuilder {
  if (emoji) {
    button.setEmoji(emoji);
  }
  return button;
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

export function buildStatsPaginationCustomId(viewId: string, page: number, slot?: string): string {
  const safePage = clampStatsPage(page);
  const params = new URLSearchParams({ page: String(safePage) });
  if (slot) {
    params.set("slot", slot);
  }
  return `${STATS_PAGINATION_PREFIX}/${encodeURIComponent(viewId)}?${params.toString()}`;
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
  emojis?: ApplicationEmojiCatalog | null,
): ActionRowBuilder<ButtonBuilder> {
  const activePage = clampStatsPage(page);
  const isFirst = activePage === 0;
  const isLast = activePage >= STATS_PAGE_COUNT - 1;
  const currentLabel = `Page ${activePage + 1}/${STATS_PAGE_COUNT}`;
  const homeEmoji = toComponentEmoji(emojis, "home");
  const prevEmoji = toComponentEmoji(emojis, "minus");
  const nextEmoji = toComponentEmoji(emojis, "plus");

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    applyButtonEmoji(
      new ButtonBuilder().setCustomId(buildStatsPaginationCustomId(viewId, 0, "first")),
      homeEmoji,
    )
      .setLabel("First")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isFirst),
    applyButtonEmoji(
      new ButtonBuilder().setCustomId(buildStatsPaginationCustomId(viewId, activePage - 1, "prev")),
      prevEmoji,
    )
      .setLabel("Prev")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isFirst),
    new ButtonBuilder()
      .setCustomId(buildStatsPaginationCustomId(viewId, activePage, "current"))
      .setLabel(currentLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    applyButtonEmoji(
      new ButtonBuilder().setCustomId(buildStatsPaginationCustomId(viewId, activePage + 1, "next")),
      nextEmoji,
    )
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isLast),
    new ButtonBuilder()
      .setCustomId(buildStatsPaginationCustomId(viewId, STATS_PAGE_COUNT - 1, "last"))
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
  emojis?: ApplicationEmojiCatalog | null,
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
    .setTitle(prefixWithEmoji(`Siege Stats: ${profileName}`, emojis, "search"))
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
  internalSummary?: InternalStatsSummary | null,
  emojis?: ApplicationEmojiCatalog | null,
): StatsMessagePayload {
  const activePage = clampStatsPage(page);
  const embeds = [buildStatsEmbed(envelope, source, stale, activePage, emojis)];
  if (internalSummary) {
    embeds.push(buildInternalStatsEmbed(internalSummary));
  }

  return {
    embeds,
    components: [buildStatsPaginationRow(viewId, activePage, emojis)],
  };
}

export function buildInternalStatsEmbed(summary: InternalStatsSummary): EmbedBuilder {
  const refreshStatus = summary.externalRefreshLocked
    ? "Locked after 10 recorded internal matches"
    : "Available";

  return new EmbedBuilder()
    .setColor(0x1d4ed8)
    .setTitle(`Internal ELO: ${summary.username}`)
    .setDescription(`Platform: ${summary.platform}`)
    .addFields(
      {
        name: "Current Rating",
        value: String(Math.round(summary.internalElo)),
        inline: true,
      },
      {
        name: "Record",
        value: `${summary.internalWins}-${summary.internalLosses}`,
        inline: true,
      },
      {
        name: "Recorded Matches",
        value: String(summary.internalMatches),
        inline: true,
      },
      {
        name: "External Refresh",
        value: refreshStatus,
        inline: false,
      },
    );
}

export function buildInternalStatsOnlyEmbed(summary: InternalStatsSummary): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x1d4ed8)
    .setTitle(`Internal ELO: ${summary.username}`)
    .setDescription(
      `stats.cc refresh is disabled for this player after 10 recorded internal matches.\nPlatform: ${summary.platform}`,
    )
    .addFields(
      {
        name: "Current Rating",
        value: String(Math.round(summary.internalElo)),
        inline: true,
      },
      {
        name: "Record",
        value: `${summary.internalWins}-${summary.internalLosses}`,
        inline: true,
      },
      {
        name: "Recorded Matches",
        value: String(summary.internalMatches),
        inline: true,
      },
    );
}

export function buildProcessingStatsEmbed(
  username: string,
  platform: StatsPlatform,
  season: string | null,
  emojis?: ApplicationEmojiCatalog | null,
): EmbedBuilder {
  const seasonLine = season?.trim() ? `\nSeason: ${season.trim()}` : "";
  return new EmbedBuilder()
    .setColor(0x334155)
    .setTitle(prefixWithEmoji("Processing stats request", emojis, "timer"))
    .setDescription(`Username: ${username}\nPlatform: ${platform}${seasonLine}`);
}

export function buildQueueUnavailableEmbed(
  message = "Could not queue a stat refresh. Try again later.",
  emojis?: ApplicationEmojiCatalog | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xb91c1c)
    .setTitle(prefixWithEmoji("Refresh unavailable", emojis, "warning"))
    .setDescription(message);
}

export function buildSeasonNotFoundEmbed(
  requestedSeason: string,
  availableSeasons: readonly SeasonCatalogEntry[],
  emojis?: ApplicationEmojiCatalog | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xb45309)
    .setTitle(prefixWithEmoji("Season not found", emojis, "question_mark"))
    .setDescription(
      `Requested season: ${requestedSeason}\nAvailable seasons: ${availableSeasonsLine(availableSeasons)}`,
    );
}

export function buildRefreshFailureEmbed(
  message: string,
  emojis?: ApplicationEmojiCatalog | null,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xb91c1c)
    .setTitle(prefixWithEmoji("Stats refresh failed", emojis, "cancel"))
    .setDescription(message);
}

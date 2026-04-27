import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ApplicationEmojiCatalog,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  TextDisplayBuilder,
  formatApplicationEmoji,
  toComponentEmoji,
} from "@parley/discord-runtime";
import { calculateKost, type StatsPlatform } from "../lib/http";
import { statsCacheAgeMinutes, type StatsCacheEnvelope } from "./cache";
import type { SeasonCatalogEntry } from "./season";

const numberFormatter = new Intl.NumberFormat("en-US");
const STATS_PAGE_LABELS = ["Overview", "Combat", "Rounds"] as const;

const STATS_CARD_PREFIX = "stats-card";

export const STATS_PAGINATION_PREFIX = "stats-page";
export const STATS_PAGE_COUNT = STATS_PAGE_LABELS.length;

export type StatsDataSource = "live" | "cache";

export interface StatsPaginationCustomId {
  viewId: string;
  page: number;
}

export interface StatsMessagePayload {
  components: ContainerBuilder[];
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
  emojiName:
    | "cancel"
    | "diamond"
    | "information"
    | "link"
    | "question_mark"
    | "search"
    | "strong"
    | "timer"
    | "warning",
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

function buildText(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
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

function buildStatsStaticCustomId(viewId: string, slot: string): string {
  return `${STATS_CARD_PREFIX}/${encodeURIComponent(viewId)}?slot=${encodeURIComponent(slot)}`;
}

function buildMutedAccessory(
  viewId: string,
  slot: string,
  label: string,
  emojis: ApplicationEmojiCatalog | null | undefined,
  emojiName?: "diamond" | "search" | "strong" | "timer",
): ButtonBuilder {
  const button = new ButtonBuilder()
    .setCustomId(buildStatsStaticCustomId(viewId, slot))
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  if (emojiName) {
    applyButtonEmoji(button, toComponentEmoji(emojis, emojiName));
  }

  return button;
}

function buildProfileButton(
  profileUrl: string,
  emojis: ApplicationEmojiCatalog | null | undefined,
): ButtonBuilder {
  return applyButtonEmoji(
    new ButtonBuilder().setURL(profileUrl).setLabel("Profile").setStyle(ButtonStyle.Link),
    toComponentEmoji(emojis, "link"),
  );
}

function buildMetricSection(
  viewId: string,
  slot: string,
  label: string,
  metrics: ReadonlyArray<{ title: string; value: string }>,
  emojis: ApplicationEmojiCatalog | null | undefined,
  emojiName: "diamond" | "search" | "strong" | "timer",
  accessory?: ButtonBuilder,
): SectionBuilder {
  const section = new SectionBuilder().addText(
    ...metrics.map((metric) => buildText(`**${metric.title}**\n${metric.value}`)),
  );

  section.setAccessory(accessory ?? buildMutedAccessory(viewId, slot, label, emojis, emojiName));
  return section;
}

function buildNoticeCard(
  title: string,
  message: string,
  accentColor: number,
  emojis: ApplicationEmojiCatalog | null | undefined,
  emojiName:
    | "cancel"
    | "diamond"
    | "information"
    | "question_mark"
    | "search"
    | "timer"
    | "warning",
  details: readonly string[] = [],
): ContainerBuilder {
  const card = new ContainerBuilder().setAccentColor(accentColor);
  card.addComponents(buildText(`## ${prefixWithEmoji(title, emojis, emojiName)}`));

  if (message.trim()) {
    card.addComponents(buildText(message));
  }

  for (const detail of details) {
    if (!detail.trim()) {
      continue;
    }
    card.addComponents(buildText(detail));
  }

  return card;
}

function buildStatsAccentColor(source: StatsDataSource, stale: boolean): number {
  if (stale) {
    return 0x92400e;
  }
  return source === "cache" ? 0x334155 : 0x0f766e;
}

function buildStatsPageSection(
  envelope: StatsCacheEnvelope,
  viewId: string,
  page: number,
  emojis: ApplicationEmojiCatalog | null | undefined,
  profileUrl: string,
): SectionBuilder {
  const ranked = envelope.rankedStats;
  const calculated = envelope.calculatedMetrics;
  const computedKost = calculateKost(ranked);
  const activePage = clampStatsPage(page);
  const accessory = profileUrl ? buildProfileButton(profileUrl, emojis) : undefined;

  if (activePage === 0) {
    return buildMetricSection(
      viewId,
      "overview",
      "Overview",
      [
        {
          title: "Current Rank",
          value: `${formatRank(ranked.current_rank, ranked.current_rank_tier)}\nRank Points: ${formatInteger(ranked.rank_points)}`,
        },
        {
          title: "Record",
          value:
            `Matches: ${formatInteger(ranked.matches)}\n` +
            `Wins/Losses: ${formatInteger(ranked.wins)} / ${formatInteger(ranked.losses)}\n` +
            `Win Rate: ${formatPercent(ranked.win_rate)}`,
        },
        {
          title: "At a Glance",
          value:
            `K/D: ${formatDecimal(ranked.kd_ratio, 2)}\n` +
            `Estimated KOST: ${formatPercent(computedKost)}\n` +
            `Headshot Rate: ${formatPercent(ranked.headshot_percentage)}`,
        },
      ],
      emojis,
      "diamond",
      accessory,
    );
  }

  if (activePage === 1) {
    return buildMetricSection(
      viewId,
      "combat",
      "Combat",
      [
        {
          title: "Combat",
          value:
            `Kills: ${formatInteger(ranked.kills)}\n` +
            `Deaths: ${formatInteger(ranked.deaths)}\n` +
            `Assists: ${formatInteger(ranked.assists)}\n` +
            `K/D: ${formatDecimal(ranked.kd_ratio, 2)}`,
        },
        {
          title: "Precision",
          value:
            `Headshots: ${formatInteger(ranked.headshots)}\n` +
            `Headshot Rate: ${formatPercent(ranked.headshot_percentage)}`,
        },
        {
          title: "Impact",
          value:
            `Estimated KOST: ${formatPercent(computedKost)}\n` +
            `KOST Range: ${formatPercent(calculated.kost_lower_bound)} to ${formatPercent(calculated.kost_upper_bound)}`,
        },
      ],
      emojis,
      "strong",
      accessory,
    );
  }

  return buildMetricSection(
    viewId,
    "rounds",
    "Rounds",
    [
      {
        title: "Round Snapshot",
        value:
          `Rounds Played: ${formatInteger(ranked.rounds_played)}\n` +
          `Kill Rounds: ${formatInteger(ranked.kill_rounds)}\n` +
          `Survival Rounds: ${formatInteger(ranked.survival_rounds)}\n` +
          `Traded Rounds: ${formatInteger(ranked.traded_rounds)}`,
      },
      {
        title: "Round Rates",
        value:
          `Kill Round Rate: ${roundRate(ranked.kill_rounds, ranked.rounds_played)}\n` +
          `Survival Round Rate: ${roundRate(ranked.survival_rounds, ranked.rounds_played)}\n` +
          `Trade Round Rate: ${roundRate(ranked.traded_rounds, ranked.rounds_played)}`,
      },
    ],
    emojis,
    "timer",
    accessory,
  );
}

function buildStatsCard(
  envelope: StatsCacheEnvelope,
  source: StatsDataSource,
  stale: boolean,
  viewId: string,
  page: number,
  emojis?: ApplicationEmojiCatalog | null,
): ContainerBuilder {
  const profile = envelope.profile;
  const ranked = envelope.rankedStats;
  const activePage = clampStatsPage(page);
  const profileName = formatText(profile.username, envelope.username);
  const cachedAgeMinutes = statsCacheAgeMinutes(envelope.cachedAt);
  const sourceLabel =
    source === "cache"
      ? stale
        ? `Cached ${cachedAgeMinutes}m ago. Refreshing in background.`
        : `Cached ${cachedAgeMinutes}m ago.`
      : "Live snapshot from stats.cc.";
  const seasonLabel = formatText(ranked.season_display, formatText(ranked.season, "Latest"));
  const sectionLabel = STATS_PAGE_LABELS[activePage];
  const profileUrl = formatText(profile.profile_url, "");

  const card = new ContainerBuilder().setAccentColor(buildStatsAccentColor(source, stale));

  card.addComponents(
    buildText(`## ${prefixWithEmoji(`Siege Stats: ${profileName}`, emojis, "search")}`),
    buildText(`**Season**\n${seasonLabel}`),
    buildText(
      `**Platform**\n${formatText(profile.platform, "Unknown")} • Level ${formatInteger(profile.level)}`,
    ),
    buildText(
      `**Snapshot**\n${sourceLabel} • ${sectionLabel} • ${activePage + 1}/${STATS_PAGE_COUNT}`,
    ),
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
    buildStatsPageSection(envelope, viewId, activePage, emojis, profileUrl),
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    buildStatsPaginationRow(viewId, activePage, emojis),
  );

  return card;
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
  const components = [buildStatsCard(envelope, source, stale, viewId, activePage, emojis)];
  if (internalSummary) {
    components.push(buildInternalStatsCard(internalSummary, emojis));
  }

  return { components };
}

function buildInternalStatsCard(
  summary: InternalStatsSummary,
  emojis?: ApplicationEmojiCatalog | null,
): ContainerBuilder {
  const refreshStatus = summary.externalRefreshLocked
    ? "Locked after 10 recorded internal matches"
    : "Available";
  const card = new ContainerBuilder().setAccentColor(0x1d4ed8);

  card.addComponents(
    buildText(`## ${prefixWithEmoji(`Internal ELO: ${summary.username}`, emojis, "diamond")}`),
    buildText(`**Platform**\n${summary.platform}`),
    buildMetricSection(
      summary.username,
      "internal-summary",
      "Internal",
      [
        {
          title: "Current Rating",
          value: formatInteger(Math.round(summary.internalElo)),
        },
        {
          title: "Record",
          value: `${summary.internalWins}-${summary.internalLosses}`,
        },
        {
          title: "Recorded Matches",
          value: String(summary.internalMatches),
        },
      ],
      emojis,
      "strong",
    ),
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
    buildText(`**External Refresh**\n${refreshStatus}`),
  );

  return card;
}

export function buildInternalStatsOnlyMessage(
  summary: InternalStatsSummary,
  emojis?: ApplicationEmojiCatalog | null,
): ContainerBuilder {
  const card = buildInternalStatsCard(summary, emojis);
  card.addComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
    buildText("stats.cc refresh is disabled for this player after 10 recorded internal matches."),
  );
  return card;
}

export function buildProcessingStatsMessage(
  username: string,
  platform: StatsPlatform,
  season: string | null,
  emojis?: ApplicationEmojiCatalog | null,
): ContainerBuilder {
  const details = [`**Username**\n${username}`, `**Platform**\n${platform}`];
  if (season?.trim()) {
    details.push(`**Season**\n${season.trim()}`);
  }
  return buildNoticeCard(
    "Processing stats request",
    "Your refresh request is queued. This message will update when the snapshot is ready.",
    0x334155,
    emojis,
    "timer",
    details,
  );
}

export function buildQueueUnavailableMessage(
  message = "Could not queue a stat refresh. Try again later.",
  emojis?: ApplicationEmojiCatalog | null,
): ContainerBuilder {
  return buildNoticeCard("Refresh unavailable", message, 0xb91c1c, emojis, "warning");
}

export function buildSeasonNotFoundMessage(
  requestedSeason: string,
  availableSeasons: readonly SeasonCatalogEntry[],
  emojis?: ApplicationEmojiCatalog | null,
): ContainerBuilder {
  return buildNoticeCard(
    "Season not found",
    `**Requested Season**\n${requestedSeason}`,
    0xb45309,
    emojis,
    "question_mark",
    [`**Available Seasons**\n${availableSeasonsLine(availableSeasons)}`],
  );
}

export function buildRefreshFailureMessage(
  message: string,
  emojis?: ApplicationEmojiCatalog | null,
): ContainerBuilder {
  return buildNoticeCard("Stats refresh failed", message, 0xb91c1c, emojis, "cancel");
}

export const buildInternalStatsOnlyEmbed = buildInternalStatsOnlyMessage;
export const buildProcessingStatsEmbed = buildProcessingStatsMessage;
export const buildQueueUnavailableEmbed = buildQueueUnavailableMessage;
export const buildSeasonNotFoundEmbed = buildSeasonNotFoundMessage;
export const buildRefreshFailureEmbed = buildRefreshFailureMessage;

import type { FetchStatsResponse, ScrapedStats } from "@parley/proto/stats/v1/stats_pb.js";
import {
  ButtonBuilder,
  ContainerBuilder,
  formatApplicationEmoji,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  toComponentEmoji,
  type ApplicationEmojiCatalog,
} from "@parley/runtime";
import {
  ButtonStyle,
  CANCEL_CUSTOM_ID,
  GAME_NAME,
  PLATFORM_HINTS,
  PLATFORMS,
  UI_ERROR_COLOR,
  UI_INFO_COLOR,
  UI_SUCCESS_COLOR,
  UI_WARNING_COLOR,
  confirmCustomId,
  platformCustomId,
  platformLabel,
  type Platform,
} from "./constants.js";

const SEPARATOR_SPACING_SMALL = 1;

function footerDisplay(): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent("-# Parley");
}

function emojiOrFallback(
  catalog: ApplicationEmojiCatalog,
  name: Parameters<typeof formatApplicationEmoji>[1],
  fallback: string,
): string {
  return formatApplicationEmoji(catalog, name) ?? fallback;
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

/** Step 1: platform picker. */
export function buildPlatformSelectCard(
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const linkEmoji = emojiOrFallback(catalog, "link", "🔗");

  return new ContainerBuilder().setAccentColor(UI_INFO_COLOR).addComponents(
    new TextDisplayBuilder().setContent(`${linkEmoji} **Link Your Account**`),
    new TextDisplayBuilder().setContent(
      `Connect your Discord to **${GAME_NAME}**. Pick the platform you play on.`,
    ),
    separator(),
    ...PLATFORMS.map((platform) =>
      new SectionBuilder()
        .addText(
          new TextDisplayBuilder().setContent(
            `**${platformLabel(platform)}**\n${PLATFORM_HINTS[platform]}`,
          ),
        )
        .setAccessory(
          new ButtonBuilder()
            .setCustomId(platformCustomId(platform))
            .setLabel(platformLabel(platform))
            .setStyle(ButtonStyle.Primary)
            .setEmoji(toComponentEmoji(catalog, "link") ?? { name: "🔗" }),
        ),
    ),
    footerDisplay(),
  );
}

/**
 * Step 3: confirm the platform + collected username before calling the engine.
 *
 * The username is encoded in the Continue button's customId so the handler can
 * avoid a second round-trip and so re-renders don't need to rebuild it.
 */
export function buildConfirmCard(
  platform: Platform,
  username: string,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const warningEmoji = emojiOrFallback(catalog, "warning", "⚠️");
  const label = platformLabel(platform);

  return new ContainerBuilder().setAccentColor(UI_WARNING_COLOR).addComponents(
    new TextDisplayBuilder().setContent(`${warningEmoji} **Confirm Your Account**`),
    new TextDisplayBuilder().setContent(
      `The engine will look up your **${label}** account by your linked username. Continue?`,
    ),
    separator(),
    new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
    new TextDisplayBuilder().setContent(`**Username**\n\`${username}\``),
    new TextDisplayBuilder().setContent(`**Game**\n${GAME_NAME}`),
    separator(),
    new SectionBuilder()
      .addText(new TextDisplayBuilder().setContent("Ready to link?"))
      .setAccessory(
        new ButtonBuilder()
          .setCustomId(confirmCustomId(platform, username))
          .setLabel("Continue")
          .setStyle(ButtonStyle.Success)
          .setEmoji(toComponentEmoji(catalog, "confirm") ?? { name: "✅" }),
      ),
    new SectionBuilder()
      .addText(new TextDisplayBuilder().setContent("Pick a different platform?"))
      .setAccessory(
        new ButtonBuilder()
          .setCustomId(CANCEL_CUSTOM_ID)
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(toComponentEmoji(catalog, "cancel") ?? { name: "✖️" }),
      ),
    footerDisplay(),
  );
}

export function buildSuccessCard(
  usernameNormalized: string,
  playerId: number,
  platform: Platform,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const confirmEmoji = emojiOrFallback(catalog, "confirm", "✅");
  const label = platformLabel(platform);

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(`${confirmEmoji} **Account Linked**`),
      separator(),
      new TextDisplayBuilder().setContent(`### ${GAME_NAME}`),
      new TextDisplayBuilder().setContent(`**Username**\n\`${usernameNormalized}\``),
      new TextDisplayBuilder().setContent(`**Player ID**\n\`${playerId}\``),
      new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
      footerDisplay(),
    );
}

export function buildErrorCard(
  message: string,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const cancelEmoji = emojiOrFallback(catalog, "cancel", "❌");

  return new ContainerBuilder()
    .setAccentColor(UI_ERROR_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(`${cancelEmoji} **Link Failed**`),
      separator(),
      new TextDisplayBuilder().setContent(message),
      footerDisplay(),
    );
}

/**
 * Step 4: link succeeded, now waiting on the stats scrape. Replaces the
 * confirm card after the engine has accepted the link but before the
 * snapshot is ready. The handler then calls StatsService.FetchStats and
 * either swaps in {@link buildReadyToPlayCard} or {@link buildErrorCard}
 * depending on the result.
 */
export function buildFetchingStatsCard(catalog: ApplicationEmojiCatalog): ContainerBuilder {
  const timerEmoji = emojiOrFallback(catalog, "timer", "⏳");

  return new ContainerBuilder()
    .setAccentColor(UI_INFO_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(`${timerEmoji} **Fetching Your Stats**`),
      separator(),
      new TextDisplayBuilder().setContent(
        "Your account is linked. We are now looking up your stats — this can take a while if the upstream provider is slow.",
      ),
      footerDisplay(),
    );
}

/**
 * Step 5: link + stats both succeeded. Shows the basic account info and
 * the freshly-scraped level + rank so the user has visible confirmation
 * that a snapshot now exists.
 */
export function buildReadyToPlayCard(
  args: {
    usernameNormalized: string;
    playerId: number;
    platform: Platform;
    stats: FetchStatsResponse;
  },
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const confirmEmoji = emojiOrFallback(catalog, "confirm", "✅");
  const label = platformLabel(args.platform);
  const stats = args.stats.stats;
  const profile = stats?.profile;
  const ranked = stats?.rankedStats;

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(`${confirmEmoji} **You're Ready To Play**`),
      separator(),
      new TextDisplayBuilder().setContent(`### ${GAME_NAME}`),
      new TextDisplayBuilder().setContent(`**Username**\n\`${args.usernameNormalized}\``),
      new TextDisplayBuilder().setContent(`**Player ID**\n\`${args.playerId}\``),
      new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
      separator(),
      ...buildStatsLines(profile, ranked),
      footerDisplay(),
    );
}

function buildStatsLines(
  profile: ScrapedStats["profile"],
  ranked: ScrapedStats["rankedStats"],
): TextDisplayBuilder[] {
  const lines: TextDisplayBuilder[] = [];
  if (profile) {
    const level = profile.level > 0 ? `Level ${profile.level}` : "Level —";
    lines.push(new TextDisplayBuilder().setContent(`**Profile**\n${level}`));
  }
  if (ranked) {
    const rank = ranked.currentRank || "Unranked";
    const points = ranked.rankPoints > 0 ? ` · ${ranked.rankPoints} RP` : "";
    lines.push(new TextDisplayBuilder().setContent(`**Current Rank**\n${rank}${points}`));
  }
  if (lines.length === 0) {
    lines.push(
      new TextDisplayBuilder().setContent(
        "_No stats available yet — try `/profile` in a few minutes._",
      ),
    );
  }
  return lines;
}

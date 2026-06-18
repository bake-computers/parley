import type { LinkedIdentity } from "@parley/proto";
import type { FetchStatsResponse, ScrapedStats } from "@parley/proto/stats/v1/stats_pb.js";
import { formatParleyRankLine } from "../../ui/parley-rank.js";
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
  UNLINK_CUSTOM_ID,
  GAME_NAME,
  PLATFORM_HINTS,
  PLATFORMS,
  UI_ERROR_COLOR,
  UI_SUCCESS_COLOR,
  UI_WARNING_COLOR,
  confirmCustomId,
  platformCustomId,
  platformLabel,
  type Platform,
} from "./constants.js";

const SEPARATOR_SPACING_SMALL = 1;

function emojiOrFallback(
  catalog: ApplicationEmojiCatalog,
  name: Parameters<typeof formatApplicationEmoji>[1],
): string {
  return formatApplicationEmoji(catalog, name) ?? "";
}

function titleWith(emoji: string, title: string): string {
  return emoji ? `${emoji} **${title}**` : `**${title}**`;
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

/** Step 1: platform picker. */
export function buildPlatformSelectCard(catalog: ApplicationEmojiCatalog): ContainerBuilder {
  const linkEmoji = emojiOrFallback(catalog, "linked");

  return new ContainerBuilder().setAccentColor(UI_SUCCESS_COLOR).addComponents(
    new TextDisplayBuilder().setContent(titleWith(linkEmoji, "Link Your Account")),
    new TextDisplayBuilder().setContent(
      `Connect your Discord to **${GAME_NAME}**. Pick the platform you play on.`,
    ),
    separator(),
    ...PLATFORMS.map((platform) => {
      const accessory = new ButtonBuilder()
        .setCustomId(platformCustomId(platform))
        .setLabel(platformLabel(platform))
        .setStyle(ButtonStyle.Primary);
      const emoji = toComponentEmoji(catalog, "linked");
      if (emoji) {
        accessory.setEmoji(emoji);
      }
      return new SectionBuilder()
        .addText(
          new TextDisplayBuilder().setContent(
            `**${platformLabel(platform)}**\n${PLATFORM_HINTS[platform]}`,
          ),
        )
        .setAccessory(accessory);
    }),
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
  const warningEmoji = emojiOrFallback(catalog, "warning_orange");
  const label = platformLabel(platform);

  const continueButton = new ButtonBuilder()
    .setCustomId(confirmCustomId(platform, username))
    .setLabel("Continue")
    .setStyle(ButtonStyle.Success);
  const continueEmoji = toComponentEmoji(catalog, "redirect");
  if (continueEmoji) {
    continueButton.setEmoji(continueEmoji);
  }

  const backButton = new ButtonBuilder()
    .setCustomId(CANCEL_CUSTOM_ID)
    .setLabel("Back")
    .setStyle(ButtonStyle.Secondary);
  const backEmoji = toComponentEmoji(catalog, "ban_hammer_red");
  if (backEmoji) {
    backButton.setEmoji(backEmoji);
  }

  return new ContainerBuilder()
    .setAccentColor(UI_WARNING_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(warningEmoji, "Confirm Your Account")),
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
        .setAccessory(continueButton),
      new SectionBuilder()
        .addText(new TextDisplayBuilder().setContent("Pick a different platform?"))
        .setAccessory(backButton),
    );
}

export function buildSuccessCard(
  usernameNormalized: string,
  playerId: number,
  platform: Platform,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const confirmEmoji = emojiOrFallback(catalog, "redirect");
  const label = platformLabel(platform);

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(confirmEmoji, "Account Linked")),
      separator(),
      new TextDisplayBuilder().setContent(`### ${GAME_NAME}`),
      new TextDisplayBuilder().setContent(`**Username**\n\`${usernameNormalized}\``),
      new TextDisplayBuilder().setContent(`**Player ID**\n\`${playerId}\``),
      new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
    );
}

export function buildAlreadyLinkedCard(
  identity: LinkedIdentity,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const linkEmoji = emojiOrFallback(catalog, "linked");
  const rankLine = formatParleyRankLine(catalog, identity.internalElo);

  const delinkButton = new ButtonBuilder()
    .setCustomId(UNLINK_CUSTOM_ID)
    .setLabel("Delink")
    .setStyle(ButtonStyle.Danger);
  const delinkEmoji = toComponentEmoji(catalog, "trash_red");
  if (delinkEmoji) {
    delinkButton.setEmoji(delinkEmoji);
  }

  return new ContainerBuilder()
    .setAccentColor(UI_WARNING_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(linkEmoji, "Account Already Linked")),
      new TextDisplayBuilder().setContent(
        "You already have a linked account. Delink it first if you want to connect a different profile.",
      ),
      separator(),
      new TextDisplayBuilder().setContent(`**Username**\n\`${identity.username}\``),
      new TextDisplayBuilder().setContent(`**Platform**\n${identity.platform}`),
      new TextDisplayBuilder().setContent(`**Parley Rank**\n${rankLine}`),
      separator(),
      new SectionBuilder()
        .addText(new TextDisplayBuilder().setContent("Remove this link?"))
        .setAccessory(delinkButton),
    );
}

export function buildUnlinkCooldownCard(
  cooldownUntilMs: number,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const timerEmoji = emojiOrFallback(catalog, "timeout");
  const discordTs = `<t:${Math.floor(cooldownUntilMs / 1000)}:R>`;

  return new ContainerBuilder()
    .setAccentColor(UI_WARNING_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(timerEmoji, "Re-link Cooldown")),
      separator(),
      new TextDisplayBuilder().setContent(
        `You recently delinked your account. You can link again ${discordTs}.`,
      ),
    );
}

export function buildUnlinkedCard(
  cooldownUntilMs: number,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const confirmEmoji = emojiOrFallback(catalog, "redirect");
  const lines = [
    new TextDisplayBuilder().setContent(titleWith(confirmEmoji, "Account Delinked")),
    separator(),
    new TextDisplayBuilder().setContent("Your Discord account is no longer linked to a game profile."),
  ];
  if (cooldownUntilMs > 0) {
    const discordTs = `<t:${Math.floor(cooldownUntilMs / 1000)}:F>`;
    lines.push(
      new TextDisplayBuilder().setContent(`**Re-link available**\n${discordTs}`),
    );
  }
  return new ContainerBuilder().setAccentColor(UI_SUCCESS_COLOR).addComponents(...lines);
}

export function buildErrorCard(
  message: string,
  catalog: ApplicationEmojiCatalog,
): ContainerBuilder {
  const cancelEmoji = emojiOrFallback(catalog, "ban_hammer_red");

  return new ContainerBuilder()
    .setAccentColor(UI_ERROR_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(cancelEmoji, "Link Failed")),
      separator(),
      new TextDisplayBuilder().setContent(message),
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
  const timerEmoji = emojiOrFallback(catalog, "timeout");

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(timerEmoji, "Fetching Your Stats")),
      separator(),
      new TextDisplayBuilder().setContent(
        "Your account is linked. We are now looking up your stats — this can take a while if the upstream provider is slow.",
      ),
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
  const confirmEmoji = emojiOrFallback(catalog, "redirect");
  const label = platformLabel(args.platform);
  const stats = args.stats.stats;
  const profile = stats?.profile;
  const ranked = stats?.rankedStats;

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(confirmEmoji, "You're Ready To Play")),
      separator(),
      new TextDisplayBuilder().setContent(`### ${GAME_NAME}`),
      new TextDisplayBuilder().setContent(`**Username**\n\`${args.usernameNormalized}\``),
      new TextDisplayBuilder().setContent(`**Player ID**\n\`${args.playerId}\``),
      new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
      separator(),
      ...buildStatsLines(catalog, profile, ranked),
    );
}

function buildStatsLines(
  catalog: ApplicationEmojiCatalog,
  profile: ScrapedStats["profile"],
  ranked: ScrapedStats["rankedStats"],
): TextDisplayBuilder[] {
  const lines: TextDisplayBuilder[] = [];
  const seededElo = ranked && ranked.rankPoints > 0 ? ranked.rankPoints : 0;
  if (seededElo > 0) {
    lines.push(
      new TextDisplayBuilder().setContent(
        `**Parley Rank**\n${formatParleyRankLine(catalog, seededElo)}`,
      ),
    );
  }
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

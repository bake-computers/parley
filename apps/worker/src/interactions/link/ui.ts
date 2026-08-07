import type { LinkedIdentity } from "@parley/proto";
import type { FetchStatsResponse, ScrapedStats } from "@parley/proto/stats/v1/stats_pb.js";
import { formatParleyRankLine } from "#/utils/parley-rank";
import {
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "@parley/runtime";
import {
  ClockEmoji,
  ConnectionEmoji,
  ThumbsUpEmoji,
  WarningEmoji,
  WarningOrangeEmoji,
} from "#/utils/constants";
import {
  CONFIRM_ACTION_BACK,
  CONFIRM_ACTION_CONTINUE,
  CONFIRM_SELECT_PREFIX,
  GAME_NAME,
  PLATFORM_HINTS,
  PLATFORM_SELECT_CUSTOM_ID,
  PLATFORMS,
  UI_ERROR_COLOR,
  UI_MAIN_COLOR,
  UI_SUCCESS_COLOR,
  UI_WARNING_COLOR,
  UNLINK_SELECT_CUSTOM_ID,
  confirmSelectCustomId,
  normalizePlatform,
  platformLabel,
  type Platform,
} from "#/interactions/link/constants";

const SEPARATOR_SPACING_SMALL = 1;

function titleWith(emoji: string, title: string): string {
  return `${emoji} **${title}**`;
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function linkedPlatforms(identities: LinkedIdentity[]): Set<Platform> {
  const linked = new Set<Platform>();
  for (const identity of identities) {
    const platform = normalizePlatform(identity.platform);
    if (platform) {
      linked.add(platform);
    }
  }
  return linked;
}

function identityPlatformLabel(identity: LinkedIdentity): string {
  const platform = normalizePlatform(identity.platform);
  return platform ? platformLabel(platform) : identity.platform;
}

function buildPlatformSelectMenu(available: readonly Platform[]): StringSelectMenuBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId(PLATFORM_SELECT_CUSTOM_ID)
    .setPlaceholder("Choose a platform to link")
    .setMinValues(1)
    .setMaxValues(1);

  const options = available.map((platform) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(platformLabel(platform))
      .setValue(platform)
      .setDescription(PLATFORM_HINTS[platform]),
  );

  return select.addOptions(...options);
}

function buildUnlinkSelectMenu(identities: LinkedIdentity[]): StringSelectMenuBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId(UNLINK_SELECT_CUSTOM_ID)
    .setPlaceholder("Select an account to remove")
    .setMinValues(1)
    .setMaxValues(1);

  const options = identities.flatMap((identity) => {
    const platform = normalizePlatform(identity.platform);
    if (!platform) {
      return [];
    }
    return [
      new StringSelectMenuOptionBuilder()
        .setLabel(`${identityPlatformLabel(identity)} — ${identity.username}`)
        .setValue(platform)
        .setDescription("Remove this linked account"),
    ];
  });

  return select.addOptions(...options);
}

/** Hub: linked accounts overview + platform / unlink select menus. */
export function buildLinkHubCard(identities: LinkedIdentity[], notice?: string): ContainerBuilder {
  const linked = linkedPlatforms(identities);
  const available = PLATFORMS.filter((platform) => !linked.has(platform));

  const container = new ContainerBuilder()
    .setAccentColor(identities.length > 0 ? UI_MAIN_COLOR : UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(ConnectionEmoji, "Link Your Accounts")),
      new TextDisplayBuilder().setContent(
        `Connect Discord to **${GAME_NAME}**. You can link **PC** plus **console** accounts (Xbox and PlayStation) — one profile per platform.`,
      ),
      separator(),
    );

  if (notice) {
    container.addComponents(new TextDisplayBuilder().setContent(notice));
    container.addComponents(separator());
  }

  if (identities.length === 0) {
    container.addComponents(new TextDisplayBuilder().setContent("_No accounts linked yet._"));
  } else {
    container.addComponents(new TextDisplayBuilder().setContent("**Linked accounts**"));
    for (const identity of identities) {
      const rank = formatParleyRankLine(identity.internalElo);
      container.addComponents(
        new TextDisplayBuilder().setContent(
          `**${identityPlatformLabel(identity)}** · \`${identity.username}\`\n${rank}`,
        ),
      );
    }
  }

  if (available.length > 0) {
    container.addComponents(
      separator(),
      new TextDisplayBuilder().setContent("**Add a platform**"),
      new TextDisplayBuilder().setContent(
        "-# Select where you play, then enter your in-game username.",
      ),
      new ActionRowBuilder().addComponents(buildPlatformSelectMenu(available)),
    );
  } else {
    container.addComponents(
      separator(),
      new TextDisplayBuilder().setContent(
        "_All platforms are linked. Remove one below to connect a different profile._",
      ),
    );
  }

  if (identities.length > 0) {
    container.addComponents(
      separator(),
      new TextDisplayBuilder().setContent("**Remove a link**"),
      new ActionRowBuilder().addComponents(buildUnlinkSelectMenu(identities)),
    );
  }

  return container;
}

/** @deprecated Use {@link buildLinkHubCard}. Kept for tests migrating off button picker. */
export function buildPlatformSelectCard(): ContainerBuilder {
  return buildLinkHubCard([]);
}

export function buildConfirmCard(platform: Platform, username: string): ContainerBuilder {
  const label = platformLabel(platform);

  const actionSelect = new StringSelectMenuBuilder()
    .setCustomId(confirmSelectCustomId(platform, username))
    .setPlaceholder("Confirm or go back")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Continue — link this account")
        .setValue(CONFIRM_ACTION_CONTINUE)
        .setDescription(`Link ${username} on ${label}`),
      new StringSelectMenuOptionBuilder()
        .setLabel("Go back")
        .setValue(CONFIRM_ACTION_BACK)
        .setDescription("Return to account overview"),
    );

  return new ContainerBuilder()
    .setAccentColor(UI_WARNING_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(WarningOrangeEmoji, "Confirm Your Account")),
      new TextDisplayBuilder().setContent(
        `We'll look up your **${label}** profile and link it to Discord.`,
      ),
      separator(),
      new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
      new TextDisplayBuilder().setContent(`**Username**\n\`${username}\``),
      new TextDisplayBuilder().setContent(`**Game**\n${GAME_NAME}`),
      separator(),
      new TextDisplayBuilder().setContent("**Next step**"),
      new TextDisplayBuilder().setContent(
        "-# Choose **Continue** to link, or **Go back** to pick another platform.",
      ),
      new ActionRowBuilder().addComponents(actionSelect),
    );
}

export function buildSuccessCard(
  usernameNormalized: string,
  playerId: number,
  platform: Platform,
): ContainerBuilder {
  const label = platformLabel(platform);

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(ThumbsUpEmoji, "Account Linked")),
      separator(),
      new TextDisplayBuilder().setContent(`### ${GAME_NAME}`),
      new TextDisplayBuilder().setContent(`**Username**\n\`${usernameNormalized}\``),
      new TextDisplayBuilder().setContent(`**Player ID**\n\`${playerId}\``),
      new TextDisplayBuilder().setContent(`**Platform**\n${label}`),
    );
}

export function buildAlreadyLinkedCard(identity: LinkedIdentity): ContainerBuilder {
  return buildLinkHubCard([identity]);
}

export function buildUnlinkCooldownCard(cooldownUntilMs: number): ContainerBuilder {
  const discordTs = `<t:${Math.floor(cooldownUntilMs / 1000)}:R>`;

  return new ContainerBuilder()
    .setAccentColor(UI_WARNING_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(ClockEmoji, "Re-link Cooldown")),
      separator(),
      new TextDisplayBuilder().setContent(
        `You recently removed a link. You can link again ${discordTs}.`,
      ),
    );
}

export function buildUnlinkedCard(cooldownUntilMs: number): ContainerBuilder {
  const lines = [
    new TextDisplayBuilder().setContent(titleWith(ThumbsUpEmoji, "Account Removed")),
    separator(),
    new TextDisplayBuilder().setContent("That platform is no longer linked to your Discord."),
  ];
  if (cooldownUntilMs > 0) {
    const discordTs = `<t:${Math.floor(cooldownUntilMs / 1000)}:F>`;
    lines.push(new TextDisplayBuilder().setContent(`**Re-link available**\n${discordTs}`));
  }
  lines.push(
    separator(),
    new TextDisplayBuilder().setContent("-# Use the menus below to link another platform."),
  );
  return new ContainerBuilder().setAccentColor(UI_SUCCESS_COLOR).addComponents(...lines);
}

export function buildErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(UI_ERROR_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(WarningEmoji, "Link Failed")),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildFetchingStatsCard(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(ClockEmoji, "Fetching Your Stats")),
      separator(),
      new TextDisplayBuilder().setContent(
        "Account linked. Pulling your stats from stats.cc — this can take a moment.",
      ),
    );
}

export function buildReadyToPlayCard(args: {
  usernameNormalized: string;
  playerId: number;
  platform: Platform;
  stats: FetchStatsResponse;
}): ContainerBuilder {
  const label = platformLabel(args.platform);
  const stats = args.stats.stats;
  const profile = stats?.profile;
  const ranked = stats?.rankedStats;

  return new ContainerBuilder()
    .setAccentColor(UI_SUCCESS_COLOR)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(ThumbsUpEmoji, "You're Ready To Play")),
      separator(),
      new TextDisplayBuilder().setContent(`### ${GAME_NAME} · ${label}`),
      new TextDisplayBuilder().setContent(`**Username**\n\`${args.usernameNormalized}\``),
      new TextDisplayBuilder().setContent(`**Player ID**\n\`${args.playerId}\``),
      separator(),
      ...buildStatsLines(profile, ranked),
      separator(),
      new TextDisplayBuilder().setContent(
        "-# Run `/link` again or use **Add a platform** to connect another profile.",
      ),
    );
}

function buildStatsLines(
  profile: ScrapedStats["profile"],
  ranked: ScrapedStats["rankedStats"],
): TextDisplayBuilder[] {
  const lines: TextDisplayBuilder[] = [];
  const seededElo = ranked && ranked.rankPoints > 0 ? ranked.rankPoints : 0;
  if (seededElo > 0) {
    lines.push(
      new TextDisplayBuilder().setContent(`**Parley Rank**\n${formatParleyRankLine(seededElo)}`),
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

export function isConfirmSelectCustomId(customId: string): boolean {
  return customId.startsWith(`${CONFIRM_SELECT_PREFIX}/`);
}

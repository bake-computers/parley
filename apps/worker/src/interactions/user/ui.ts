import { ButtonStyle } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  formatApplicationEmoji,
  toComponentEmoji,
  type ApplicationEmojiCatalog,
  type AppEmojiName,
} from "@parley/runtime";
import { type AnonymizationCounts, type UserSettings as ProtoUserSettings } from "@parley/proto";
import {
  COLORS,
  USER_DELETE_OPEN,
  USER_MATCHMAKING_PREFIX,
  USER_PAGE_PREFIX,
  USER_REFRESH_STATS,
  USER_SETTINGS_PAGE_COUNT,
  USER_VISIBILITY_PREFIX,
} from "#/interactions/user/constants";

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function visibilityLabel(public_: boolean): string {
  return public_ ? "Public" : "Hidden";
}

function titleWith(
  catalog: ApplicationEmojiCatalog,
  emojiName: AppEmojiName,
  title: string,
): string {
  const formatted = formatApplicationEmoji(catalog, emojiName);
  return formatted ? `${formatted} **${title}**` : `**${title}**`;
}

function emojiOr(catalog: ApplicationEmojiCatalog, name: AppEmojiName): string {
  return formatApplicationEmoji(catalog, name) ?? "";
}

function choiceButton(
  catalog: ApplicationEmojiCatalog,
  args: { customId: string; label: string; active: boolean; emojiName?: AppEmojiName },
): ButtonBuilder {
  const button = new ButtonBuilder()
    .setCustomId(args.customId)
    .setLabel(args.label)
    .setStyle(args.active ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(args.active);
  if (args.emojiName) {
    const emoji = toComponentEmoji(catalog, args.emojiName);
    if (emoji) {
      button.setEmoji(emoji);
    }
  }
  return button;
}

function pageNav(catalog: ApplicationEmojiCatalog, page: number): ActionRowBuilder {
  const previous = new ButtonBuilder()
    .setCustomId(`${USER_PAGE_PREFIX}${Math.max(0, page - 1)}`)
    .setLabel("Back")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 0);
  const next = new ButtonBuilder()
    .setCustomId(`${USER_PAGE_PREFIX}${Math.min(USER_SETTINGS_PAGE_COUNT - 1, page + 1)}`)
    .setLabel("Privacy")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(page >= USER_SETTINGS_PAGE_COUNT - 1);
  for (const button of [previous, next]) {
    const pin = toComponentEmoji(catalog, "redirect");
    if (pin) {
      button.setEmoji(pin);
    }
  }
  return new ActionRowBuilder().addComponents(previous, next);
}

function buildPreferencesPage(
  settings: ProtoUserSettings,
  emojis: ApplicationEmojiCatalog,
  page: number,
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(COLORS.main).addComponents(
    new TextDisplayBuilder().setContent(titleWith(emojis, "pin", "Your Settings")),
    new TextDisplayBuilder().setContent(
      `Page **${page + 1}** / **${USER_SETTINGS_PAGE_COUNT}** · ${emojiOr(emojis, "global")} Preferences`,
    ),
    separator(),
    new TextDisplayBuilder().setContent(
      `${emojiOr(emojis, "linked")} **Matchmaking** · ${settings.matchmakingEnabled ? "Enabled" : "Disabled"}`,
    ),
    new ActionRowBuilder().addComponents(
      choiceButton(emojis, {
        customId: `${USER_MATCHMAKING_PREFIX}on`,
        label: "Enabled",
        active: settings.matchmakingEnabled,
        emojiName: "linked",
      }),
      choiceButton(emojis, {
        customId: `${USER_MATCHMAKING_PREFIX}off`,
        label: "Disabled",
        active: !settings.matchmakingEnabled,
        emojiName: "ban_hammer",
      }),
    ),
    separator(),
    new TextDisplayBuilder().setContent(
      `**Visibility** · ${visibilityLabel(settings.profilePublic)}`,
    ),
    new ActionRowBuilder().addComponents(
      choiceButton(emojis, {
        customId: `${USER_VISIBILITY_PREFIX}public`,
        label: "Public",
        active: settings.profilePublic,
        emojiName: "global",
      }),
      choiceButton(emojis, {
        customId: `${USER_VISIBILITY_PREFIX}hidden`,
        label: "Hidden",
        active: !settings.profilePublic,
        emojiName: "ban_hammer_red",
      }),
    ),
    separator(),
    pageNav(emojis, page),
  );
  return container;
}

function buildPrivacyPage(
  settings: ProtoUserSettings,
  emojis: ApplicationEmojiCatalog,
  page: number,
): ContainerBuilder {
  const cooldownLine =
    settings.termsAcceptedAtMs > 0
      ? `${emojiOr(emojis, "calendar")} Re-link cooldown · none`
      : `${emojiOr(emojis, "warning_orange")} Accept terms before linking`;
  const refreshBtn = new ButtonBuilder()
    .setCustomId(USER_REFRESH_STATS)
    .setLabel("Refresh stats")
    .setStyle(ButtonStyle.Primary);
  const reloadEmoji = toComponentEmoji(emojis, "reload");
  if (reloadEmoji) {
    refreshBtn.setEmoji(reloadEmoji);
  }
  const deleteBtn = new ButtonBuilder()
    .setCustomId(USER_DELETE_OPEN)
    .setLabel("Delete my data")
    .setStyle(ButtonStyle.Danger);
  const trashEmoji = toComponentEmoji(emojis, "trash_red");
  if (trashEmoji) {
    deleteBtn.setEmoji(trashEmoji);
  }
  const backBtn = new ButtonBuilder()
    .setCustomId(`${USER_PAGE_PREFIX}0`)
    .setLabel("Preferences")
    .setStyle(ButtonStyle.Secondary);
  const redirectEmoji = toComponentEmoji(emojis, "redirect");
  if (redirectEmoji) {
    backBtn.setEmoji(redirectEmoji);
  }
  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "pin", "Privacy & Data")),
      new TextDisplayBuilder().setContent(
        `Page **${page + 1}** / **${USER_SETTINGS_PAGE_COUNT}** · Stats · Account data`,
      ),
      separator(),
      new TextDisplayBuilder().setContent(cooldownLine),
      separator(),
      new SectionBuilder()
        .addText(
          new TextDisplayBuilder().setContent(
            "Pull the latest snapshot from the stats provider after linking.",
          ),
        )
        .setAccessory(refreshBtn),
      new SectionBuilder()
        .addText(
          new TextDisplayBuilder().setContent(
            "Permanently anonymize your Parley records. **30-day** re-link cooldown applies.",
          ),
        )
        .setAccessory(deleteBtn),
      separator(),
      new SectionBuilder()
        .addText(new TextDisplayBuilder().setContent("Return to preferences."))
        .setAccessory(backBtn),
    );
}

export type UserSettingsView = { page?: number };

export function buildSettingsCard(
  settings: ProtoUserSettings,
  emojis: ApplicationEmojiCatalog,
  view: UserSettingsView = {},
): ContainerBuilder {
  const page = Math.min(USER_SETTINGS_PAGE_COUNT - 1, Math.max(0, view.page ?? 0));
  return page === 0
    ? buildPreferencesPage(settings, emojis, page)
    : buildPrivacyPage(settings, emojis, page);
}

export function buildInfoCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(new TextDisplayBuilder().setContent(message));
}

export function buildErrorCard(message: string, emojis: ApplicationEmojiCatalog): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "ban_hammer_red", "Settings Error")),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildRefreshErrorCard(
  message: string,
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.warning)
    .addComponents(
      new TextDisplayBuilder().setContent(
        titleWith(emojis, "warning_orange", "Stats Refresh Failed"),
      ),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildDeleteResultCard(
  response: {
    anonymizedDiscordUserId: string;
    cooldownUntilMs: number;
    tablesAffected: AnonymizationCounts;
  },
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  const t = response.tablesAffected;
  const lines = [
    `Players: ${t.players}`,
    `Discord identities: ${t.discordIdentities}`,
    `Guild memberships: ${t.guildMemberships}`,
    `Matches: ${t.matches}`,
    `Match participants: ${t.matchParticipants}`,
    `Tournaments: ${t.tournaments}`,
    `Tournament teams: ${t.tournamentTeams}`,
    `Tournament rosters: ${t.tournamentTeamRosters}`,
  ];
  const cooldownDiscordTs = `<t:${Math.floor(response.cooldownUntilMs / 1000)}:F>`;
  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "trash_red", "Data Deleted")),
      separator(),
      new TextDisplayBuilder().setContent(
        "Your records are anonymized. You may re-link a new account after the cooldown ends.",
      ),
      new TextDisplayBuilder().setContent(
        `**Anonymized id**\n\`${response.anonymizedDiscordUserId}\``,
      ),
      new TextDisplayBuilder().setContent(`**Cooldown ends**\n${cooldownDiscordTs}`),
      new TextDisplayBuilder().setContent(`**Tables affected**\n${lines.join("\n")}`),
    );
}

export { visibilityLabel };

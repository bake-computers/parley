import { ButtonStyle } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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
  USER_MATCHMAKING_SELECT,
  USER_PAGE_PREFIX,
  USER_REFRESH_STATS,
  USER_SETTINGS_PAGE_COUNT,
  USER_VISIBILITY_SELECT,
} from "#/interactions/user/constants";

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function titleWith(
  catalog: ApplicationEmojiCatalog,
  emojiName: AppEmojiName,
  title: string,
): string {
  const formatted = formatApplicationEmoji(catalog, emojiName);
  return formatted ? `${formatted} **${title}**` : `**${title}**`;
}

function headerTitle(
  catalog: ApplicationEmojiCatalog,
  emojiName: AppEmojiName,
  title: string,
): string {
  const formatted = formatApplicationEmoji(catalog, emojiName);
  return formatted ? `# ${formatted} ${title}` : `# ${title}`;
}

function sectionHeader(title: string): string {
  return `## ${title}`;
}

function emojiOr(catalog: ApplicationEmojiCatalog, name: AppEmojiName): string {
  return formatApplicationEmoji(catalog, name) ?? "";
}

type SettingSelectOption = {
  label: string;
  value: string;
  emojiName?: AppEmojiName;
  isDefault?: boolean;
};

function buildSettingSelect(
  catalog: ApplicationEmojiCatalog,
  args: { customId: string; placeholder: string; options: SettingSelectOption[] },
): StringSelectMenuBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId(args.customId)
    .setPlaceholder(args.placeholder)
    .setMinValues(1)
    .setMaxValues(1);
  const options = args.options.map((option) => {
    const builder = new StringSelectMenuOptionBuilder()
      .setLabel(option.label)
      .setValue(option.value);
    if (option.isDefault) {
      builder.setDefault(true);
    }
    if (option.emojiName) {
      const emoji = toComponentEmoji(catalog, option.emojiName);
      if (emoji) {
        builder.setEmoji(emoji);
      }
    }
    return builder;
  });
  return select.addOptions(...options);
}

function navRow(catalog: ApplicationEmojiCatalog, page: number): ActionRowBuilder {
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
    const emoji = toComponentEmoji(catalog, "redirect");
    if (emoji) {
      button.setEmoji(emoji);
    }
  }
  return new ActionRowBuilder().addComponents(previous, next);
}

function privacyActionsRow(catalog: ApplicationEmojiCatalog): ActionRowBuilder {
  const refresh = new ButtonBuilder()
    .setCustomId(USER_REFRESH_STATS)
    .setLabel("Refresh stats")
    .setStyle(ButtonStyle.Primary);
  const reloadEmoji = toComponentEmoji(catalog, "reload");
  if (reloadEmoji) {
    refresh.setEmoji(reloadEmoji);
  }
  const deleteBtn = new ButtonBuilder()
    .setCustomId(USER_DELETE_OPEN)
    .setLabel("Delete my data")
    .setStyle(ButtonStyle.Danger);
  const trashEmoji = toComponentEmoji(catalog, "trash_red");
  if (trashEmoji) {
    deleteBtn.setEmoji(trashEmoji);
  }
  const back = new ButtonBuilder()
    .setCustomId(`${USER_PAGE_PREFIX}0`)
    .setLabel("Preferences")
    .setStyle(ButtonStyle.Secondary);
  const redirectEmoji = toComponentEmoji(catalog, "redirect");
  if (redirectEmoji) {
    back.setEmoji(redirectEmoji);
  }
  return new ActionRowBuilder().addComponents(refresh, deleteBtn, back);
}

function buildPreferencesPage(
  settings: ProtoUserSettings,
  emojis: ApplicationEmojiCatalog,
  page: number,
): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COLORS.main).addComponents(
    new TextDisplayBuilder().setContent(headerTitle(emojis, "pin", "Your Settings")),
    new TextDisplayBuilder().setContent(
      `Page **${page + 1}** / **${USER_SETTINGS_PAGE_COUNT}** · ${emojiOr(emojis, "global")} Preferences`,
    ),
    separator(),
    new TextDisplayBuilder().setContent(sectionHeader("Matchmaking")),
    new TextDisplayBuilder().setContent("Join the ranked queue, or pause it."),
    new ActionRowBuilder().addComponents(
      buildSettingSelect(emojis, {
        customId: USER_MATCHMAKING_SELECT,
        placeholder: "Matchmaking status",
        options: [
          {
            label: "Enabled",
            value: "on",
            emojiName: "linked",
            isDefault: settings.matchmakingEnabled,
          },
          {
            label: "Disabled",
            value: "off",
            emojiName: "ban_hammer",
            isDefault: !settings.matchmakingEnabled,
          },
        ],
      }),
    ),
    separator(),
    new TextDisplayBuilder().setContent(sectionHeader("Visibility")),
    new TextDisplayBuilder().setContent("Control who sees your profile and stats."),
    new ActionRowBuilder().addComponents(
      buildSettingSelect(emojis, {
        customId: USER_VISIBILITY_SELECT,
        placeholder: "Profile visibility",
        options: [
          {
            label: "Public",
            value: "public",
            emojiName: "global",
            isDefault: settings.profilePublic,
          },
          {
            label: "Hidden",
            value: "hidden",
            emojiName: "ban_hammer_red",
            isDefault: !settings.profilePublic,
          },
        ],
      }),
    ),
  );
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
  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(headerTitle(emojis, "pin", "Privacy & Data")),
      new TextDisplayBuilder().setContent(
        `Page **${page + 1}** / **${USER_SETTINGS_PAGE_COUNT}** · Stats · Account data`,
      ),
      separator(),
      new TextDisplayBuilder().setContent(cooldownLine),
      separator(),
      new TextDisplayBuilder().setContent(sectionHeader("Stats snapshot")),
      new TextDisplayBuilder().setContent("Pull the latest data from the stats provider."),
      separator(),
      new TextDisplayBuilder().setContent(sectionHeader("Your data")),
      new TextDisplayBuilder().setContent("Anonymize all Parley records. 30-day re-link cooldown."),
    );
}

export type UserSettingsView = { page?: number };

export function buildSettingsCard(
  settings: ProtoUserSettings,
  emojis: ApplicationEmojiCatalog,
  view: UserSettingsView = {},
): (ContainerBuilder | ActionRowBuilder)[] {
  const page = Math.min(USER_SETTINGS_PAGE_COUNT - 1, Math.max(0, view.page ?? 0));
  const container =
    page === 0
      ? buildPreferencesPage(settings, emojis, page)
      : buildPrivacyPage(settings, emojis, page);
  const actions = page === 0 ? navRow(emojis, page) : privacyActionsRow(emojis);
  return [container, actions];
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

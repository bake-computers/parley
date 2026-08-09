import { ButtonStyle } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "@parley/runtime";
import { type AnonymizationCounts, type UserSettings as ProtoUserSettings } from "@parley/proto";
import {
  USER_DELETE_OPEN,
  USER_MATCHMAKING_SELECT,
  USER_PAGE_PREFIX,
  USER_REFRESH_STATS,
  USER_SETTINGS_PAGE_COUNT,
  USER_VISIBILITY_SELECT,
} from "#/interactions/user/constants";
import { ColorPalette } from "#/utils/constants";

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

type SettingSelectOption = {
  label: string;
  value: string;
  isDefault?: boolean;
};

function buildSettingSelect(args: {
  customId: string;
  placeholder: string;
  options: SettingSelectOption[];
}): StringSelectMenuBuilder {
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
    return builder;
  });
  return select.addOptions(...options);
}

function navRow(page: number): ActionRowBuilder {
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
  return new ActionRowBuilder().addComponents(previous, next);
}

function privacyActionsRow(): ActionRowBuilder {
  const refresh = new ButtonBuilder()
    .setCustomId(USER_REFRESH_STATS)
    .setLabel("Refresh stats")
    .setStyle(ButtonStyle.Secondary);
  const deleteBtn = new ButtonBuilder()
    .setCustomId(USER_DELETE_OPEN)
    .setLabel("Delete my data")
    .setStyle(ButtonStyle.Danger);
  const back = new ButtonBuilder()
    .setCustomId(`${USER_PAGE_PREFIX}0`)
    .setLabel("Preferences")
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(refresh, deleteBtn, back);
}

function buildPreferencesPage(settings: ProtoUserSettings, page: number): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(ColorPalette.main).addComponents(
    new TextDisplayBuilder().setContent("# Your Settings"),
    new TextDisplayBuilder().setContent(
      `Page **${page + 1}** / **${USER_SETTINGS_PAGE_COUNT}** - Preferences`,
    ),
    separator(),
    new TextDisplayBuilder().setContent("## Matchmaking"),
    new TextDisplayBuilder().setContent("Join the ranked queue, or pause it."),
    new ActionRowBuilder().addComponents(
      buildSettingSelect({
        customId: USER_MATCHMAKING_SELECT,
        placeholder: "Matchmaking status",
        options: [
          {
            label: "Enabled",
            value: "on",
            isDefault: settings.matchmakingEnabled,
          },
          {
            label: "Disabled",
            value: "off",
            isDefault: !settings.matchmakingEnabled,
          },
        ],
      }),
    ),
    separator(),
    new TextDisplayBuilder().setContent("## Visibility"),
    new TextDisplayBuilder().setContent("Control who sees your profile and stats."),
    new ActionRowBuilder().addComponents(
      buildSettingSelect({
        customId: USER_VISIBILITY_SELECT,
        placeholder: "Profile visibility",
        options: [
          {
            label: "Public",
            value: "public",
            isDefault: settings.profilePublic,
          },
          {
            label: "Hidden",
            value: "hidden",
            isDefault: !settings.profilePublic,
          },
        ],
      }),
    ),
  );
}

function buildPrivacyPage(page: number): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ColorPalette.main)
    .addComponents(
      new TextDisplayBuilder().setContent("# Privacy & Data"),
      new TextDisplayBuilder().setContent(
        `Page **${page + 1}** / **${USER_SETTINGS_PAGE_COUNT}** - Stats - Account data`,
      ),
      separator(),
      new TextDisplayBuilder().setContent("## Stats snapshot"),
      new TextDisplayBuilder().setContent("Pull the latest data from the stats provider."),
      separator(),
      new TextDisplayBuilder().setContent("## Your data"),
      new TextDisplayBuilder().setContent("Anonymize all Parley records. 30-day re-link cooldown."),
    );
}

export type UserSettingsView = { page?: number };

export function buildSettingsCard(
  settings: ProtoUserSettings,
  view: UserSettingsView = {},
): (ContainerBuilder | ActionRowBuilder)[] {
  const page = Math.min(USER_SETTINGS_PAGE_COUNT - 1, Math.max(0, view.page ?? 0));
  const container = page === 0 ? buildPreferencesPage(settings, page) : buildPrivacyPage(page);
  const actions = page === 0 ? navRow(page) : privacyActionsRow();
  return [container, actions];
}

export function buildInfoCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ColorPalette.main)
    .addComponents(new TextDisplayBuilder().setContent(message));
}

export function buildErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ColorPalette.warning)
    .addComponents(
      new TextDisplayBuilder().setContent("**Settings Error**"),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildRefreshErrorCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ColorPalette.warning)
    .addComponents(
      new TextDisplayBuilder().setContent("**Stats Refresh Failed**"),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

export function buildDeleteResultCard(response: {
  anonymizedDiscordUserId: string;
  cooldownUntilMs: number;
  tablesAffected: AnonymizationCounts;
}): ContainerBuilder {
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
  return new ContainerBuilder()
    .setAccentColor(ColorPalette.error)
    .addComponents(
      new TextDisplayBuilder().setContent("Data Deleted"),
      separator(),
      new TextDisplayBuilder().setContent(
        "Your records are anonymized. You may re-link a new account after the cooldown ends.",
      ),
      new TextDisplayBuilder().setContent(`Anonymized id: \`${response.anonymizedDiscordUserId}\``),
      new TextDisplayBuilder().setContent(
        `Cooldown ends: <t:${Math.floor(response.cooldownUntilMs / 1000)}:F>`,
      ),
      new TextDisplayBuilder().setContent(`Tables affected: ${lines.join("\n")}`),
    );
}

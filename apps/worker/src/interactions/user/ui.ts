import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  formatApplicationEmoji,
  type ApplicationEmojiCatalog,
  type AppEmojiName,
} from "@parley/runtime";
import { COLORS } from "./constants.js";
import type { UserSettings as ProtoUserSettings, AnonymizationCounts } from "@parley/proto";
import { Language } from "@parley/proto";

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function languageLabel(lang: number): string {
  return lang === Language.DE ? "Deutsch" : "English";
}

function languageValue(lang: number): string {
  return lang === Language.DE ? "de" : "en";
}

function visibilityLabel(public_: boolean): string {
  return public_ ? "Public" : "Hidden";
}

function titleWith(catalog: ApplicationEmojiCatalog, emojiName: AppEmojiName, title: string): string {
  const formatted = formatApplicationEmoji(catalog, emojiName);
  return formatted ? `${formatted} **${title}**` : `**${title}**`;
}

export function buildSettingsCard(
  settings: ProtoUserSettings,
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  const cooldownLine =
    settings.termsAcceptedAtMs > 0
      ? "Cooldown: none"
      : "Cooldown: not yet accepted";

  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "pin", "Your Settings")),
      new TextDisplayBuilder().setContent(
        "Language · Matchmaking · Visibility · Timezone · Cooldown",
      ),
      separator(),
      new TextDisplayBuilder().setContent(
        `**Language**\n${languageLabel(settings.language)}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Matchmaking**\n${settings.matchmakingEnabled ? "● Enabled" : "○ Disabled"}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Visibility**\n${visibilityLabel(settings.profilePublic)}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Timezone**\n${settings.timezone}`,
      ),
      separator(),
      new TextDisplayBuilder().setContent(cooldownLine),
      separator(),
      new TextDisplayBuilder().setContent(
        "Use the buttons below to change a setting.",
      ),
    );
}

export function buildInfoCard(message: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(new TextDisplayBuilder().setContent(message));
}

export function buildErrorCard(
  message: string,
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
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
      new TextDisplayBuilder().setContent(titleWith(emojis, "warning_orange", "Stats Refresh Failed")),
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
    `Queues: ${t.matchmakingQueues}`,
    `Queue participants: ${t.matchmakingQueueParticipants}`,
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
      new TextDisplayBuilder().setContent(
        `**Cooldown ends**\n${cooldownDiscordTs}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Tables affected**\n${lines.join("\n")}`,
      ),
    );
}

export { languageLabel, languageValue, visibilityLabel };

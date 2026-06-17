import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  formatApplicationEmoji,
  type ApplicationEmojiCatalog,
  type AppEmojiName,
} from "@parley/runtime";
import { COLORS } from "./constants.js";
import type { GuildNotificationSettings as ProtoNotificationSettings } from "@parley/proto";

const SEPARATOR_SPACING_SMALL = 1;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function channelMention(channelId: string): string {
  return channelId ? `<#${channelId}>` : "Not set";
}

function toggleLabel(enabled: boolean): string {
  return enabled ? "● Enabled" : "○ Disabled";
}

function titleWith(
  catalog: ApplicationEmojiCatalog,
  emojiName: AppEmojiName,
  title: string,
): string {
  const formatted = formatApplicationEmoji(catalog, emojiName);
  return formatted ? `${formatted} **${title}**` : `**${title}**`;
}

export function buildNotificationSettingsCard(
  settings: ProtoNotificationSettings,
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(
        titleWith(emojis, "pin", "Notification Settings"),
      ),
      new TextDisplayBuilder().setContent("Channels · Toggles"),
      separator(),
      new TextDisplayBuilder().setContent(
        `**Match Results Channel**\n${channelMention(settings.matchResultsChannel)}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Tournament Announcements Channel**\n${channelMention(settings.tournamentAnnouncementsChannel)}`,
      ),
      separator(),
      new TextDisplayBuilder().setContent(
        `**Leaderboard Updates**\n${toggleLabel(settings.leaderboardUpdatesEnabled)}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Cross-Guild Announcements**\n${toggleLabel(settings.crossGuildAnnouncementsEnabled)}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Announce Match Ready**\n${toggleLabel(settings.announceMatchReadyEnabled)}`,
      ),
      new TextDisplayBuilder().setContent(
        `**Announce Match Results**\n${toggleLabel(settings.announceMatchResultsEnabled)}`,
      ),
      separator(),
      new TextDisplayBuilder().setContent("Use the buttons below to change a setting."),
    );
}

export function buildSettingsErrorCard(
  message: string,
  emojis: ApplicationEmojiCatalog,
): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(COLORS.error)
    .addComponents(
      new TextDisplayBuilder().setContent(
        titleWith(emojis, "ban_hammer_red", "Settings Error"),
      ),
      separator(),
      new TextDisplayBuilder().setContent(message),
    );
}

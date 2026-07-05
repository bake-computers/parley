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
import type { GuildNotificationSettings as ProtoNotificationSettings } from "@parley/proto";
import type { GuildTextChannel } from "../../ui/guild-channels.js";
import {
  COLORS,
  SETTINGS_CHANNEL_NONE,
  SETTINGS_MATCH_RESULTS_PREFIX,
  SETTINGS_PAGE_COUNT,
  SETTINGS_PAGE_PREFIX,
  SETTINGS_TOGGLE_PREFIX,
  SETTINGS_TOURNAMENT_PREFIX,
} from "./constants.js";

const SEPARATOR_SPACING_SMALL = 1;
const MAX_CHANNEL_OPTIONS = 25;

const TOGGLE_FIELDS = [
  {
    field: "leaderboard",
    label: "Leaderboard Updates",
    description: "Post when guild leaderboard rankings change.",
    key: "leaderboardUpdatesEnabled" as const,
    emojiOn: "global" as AppEmojiName,
    emojiOff: "ban_hammer" as AppEmojiName,
  },
  {
    field: "cross_guild",
    label: "Cross-Guild Announcements",
    description: "Allow cross-server tournament announcements.",
    key: "crossGuildAnnouncementsEnabled" as const,
    emojiOn: "global" as AppEmojiName,
    emojiOff: "ban_hammer" as AppEmojiName,
  },
  {
    field: "match_ready",
    label: "Announce Match Ready",
    description: "Ping players when a lobby is ready.",
    key: "announceMatchReadyEnabled" as const,
    emojiOn: "linked" as AppEmojiName,
    emojiOff: "timeout" as AppEmojiName,
  },
  {
    field: "match_results",
    label: "Announce Match Results",
    description: "Post summaries when matches finish.",
    key: "announceMatchResultsEnabled" as const,
    emojiOn: "redirect" as AppEmojiName,
    emojiOff: "ban_hammer_red" as AppEmojiName,
  },
] as const;

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING_SMALL);
}

function channelMention(channelId: string): string {
  return channelId ? `<#${channelId}>` : "Not set";
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

function toggleButton(
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

function channelSelect(
  customIdPrefix: string,
  guildId: string,
  channels: GuildTextChannel[],
  selectedId: string,
  placeholder: string,
): StringSelectMenuBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${customIdPrefix}${guildId}`)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1);

  const options: StringSelectMenuOptionBuilder[] = [
    new StringSelectMenuOptionBuilder()
      .setLabel("None — disable channel")
      .setValue(SETTINGS_CHANNEL_NONE)
      .setDescription("Clear this notification channel")
      .setDefault(!selectedId),
  ];

  for (const ch of channels.slice(0, MAX_CHANNEL_OPTIONS - 1)) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`#${ch.name}`)
        .setValue(ch.id)
        .setDescription(`Channel ID ${ch.id}`)
        .setDefault(ch.id === selectedId),
    );
  }

  return select.addOptions(...options);
}

function pageNav(catalog: ApplicationEmojiCatalog, page: number): ActionRowBuilder[] {
  const prev = new ButtonBuilder()
    .setCustomId(`${SETTINGS_PAGE_PREFIX}${Math.max(0, page - 1)}`)
    .setLabel("Channels")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 0);
  const next = new ButtonBuilder()
    .setCustomId(`${SETTINGS_PAGE_PREFIX}${Math.min(SETTINGS_PAGE_COUNT - 1, page + 1)}`)
    .setLabel("Toggles")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(page >= SETTINGS_PAGE_COUNT - 1);
  for (const btn of [prev, next]) {
    const pin = toComponentEmoji(catalog, "redirect");
    if (pin) {
      btn.setEmoji(pin);
    }
  }
  return [new ActionRowBuilder().addComponents(prev, next)];
}

function buildChannelsPage(
  settings: ProtoNotificationSettings,
  emojis: ApplicationEmojiCatalog,
  guildChannels: GuildTextChannel[],
  page: number,
): ContainerBuilder {
  const container = new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "pin", "Notification Settings")),
      new TextDisplayBuilder().setContent(
        `Page **${page + 1}** / **${SETTINGS_PAGE_COUNT}** · ${emojiOr(emojis, "global")} Channels`,
      ),
      separator(),
      new TextDisplayBuilder().setContent(
        `**Match Results**\n${channelMention(settings.matchResultsChannel)}`,
      ),
    );

  const matchSelect = channelSelect(
    SETTINGS_MATCH_RESULTS_PREFIX,
    settings.guildId,
    guildChannels,
    settings.matchResultsChannel,
    "Select match results channel",
  );
  container.addComponents(
    new TextDisplayBuilder().setContent("Where finished match summaries are posted."),
    new ActionRowBuilder().addComponents(matchSelect),
    separator(),
    new TextDisplayBuilder().setContent(
      `**Tournament Announcements**\n${channelMention(settings.tournamentAnnouncementsChannel)}`,
    ),
  );

  const tournamentSelect = channelSelect(
    SETTINGS_TOURNAMENT_PREFIX,
    settings.guildId,
    guildChannels,
    settings.tournamentAnnouncementsChannel,
    "Select tournament channel",
  );
  container.addComponents(
    new TextDisplayBuilder().setContent("Bracket updates and tournament news."),
    new ActionRowBuilder().addComponents(tournamentSelect),
    separator(),
    ...pageNav(emojis, page),
  );

  return container;
}

function buildTogglesPage(
  settings: ProtoNotificationSettings,
  emojis: ApplicationEmojiCatalog,
  page: number,
): ContainerBuilder {
  const container = new ContainerBuilder()
    .setAccentColor(COLORS.main)
    .addComponents(
      new TextDisplayBuilder().setContent(titleWith(emojis, "pin", "Notification Settings")),
      new TextDisplayBuilder().setContent(
        `Page **${page + 1}** / **${SETTINGS_PAGE_COUNT}** · ${emojiOr(emojis, "linked")} Toggles`,
      ),
      separator(),
    );

  for (const toggle of TOGGLE_FIELDS) {
    const enabled = settings[toggle.key];
    container.addComponents(
      new TextDisplayBuilder().setContent(
        `**${toggle.label}** · ${enabled ? "Enabled" : "Disabled"}\n-# ${toggle.description}`,
      ),
      new ActionRowBuilder().addComponents(
        toggleButton(emojis, {
          customId: `${SETTINGS_TOGGLE_PREFIX}${toggle.field}/on`,
          label: "Enabled",
          active: enabled,
          emojiName: toggle.emojiOn,
        }),
        toggleButton(emojis, {
          customId: `${SETTINGS_TOGGLE_PREFIX}${toggle.field}/off`,
          label: "Disabled",
          active: !enabled,
          emojiName: toggle.emojiOff,
        }),
      ),
      separator(),
    );
  }

  container.addComponents(...pageNav(emojis, page));
  return container;
}

export type NotificationSettingsView = {
  page?: number;
};

export function buildNotificationSettingsCard(
  settings: ProtoNotificationSettings,
  emojis: ApplicationEmojiCatalog,
  guildChannels: GuildTextChannel[] = [],
  view: NotificationSettingsView = {},
): ContainerBuilder {
  const page = Math.min(SETTINGS_PAGE_COUNT - 1, Math.max(0, view.page ?? 0));
  if (page === 0) {
    return buildChannelsPage(settings, emojis, guildChannels, page);
  }
  return buildTogglesPage(settings, emojis, page);
}

export function buildSettingsErrorCard(
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

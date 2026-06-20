import { ComponentHandler, logger, StringSelectInteraction } from "@parley/runtime";
import type { MessageComponentInteraction } from "@parley/runtime";
import type { GuildNotificationSettings as ProtoNotificationSettings } from "@parley/proto";
import { Game } from "@parley/proto";
import { getGuildSettingsClient } from "../../transport.js";
import { editReplyV2 } from "../../ui/discord.js";
import { fetchGuildTextChannels } from "../../ui/guild-channels.js";
import { resolveEmojis } from "../../ui/emojis.js";
import {
  SETTINGS_MATCH_RESULTS_PREFIX,
  SETTINGS_TOURNAMENT_PREFIX,
  SETTINGS_TOGGLE_PREFIX,
  SETTINGS_PAGE_PREFIX,
  SETTINGS_CANCEL,
  channelIdFromSelectValue,
} from "./constants.js";
import { buildNotificationSettingsCard, buildSettingsErrorCard } from "./ui.js";
import {
  invokeGetNotificationSettings,
  invokeUpsertNotificationSettings,
} from "./rpc.js";

const COMPONENT_BUTTON = 2;
const COMPONENT_STRING_SELECT = 3;

async function deferComponent(interaction: MessageComponentInteraction): Promise<boolean> {
  const deferred = await interaction.deferUpdate();
  if (deferred.isErr()) {
    logger.error("settings.defer_failed", "Failed to defer component interaction", {
      interactionId: interaction.id,
      error: deferred.error,
    });
    return false;
  }
  return true;
}

function getClient(env: unknown) {
  return getGuildSettingsClient(env as never);
}

function botToken(env: Record<string, unknown>): string | undefined {
  const token = env["DISCORD_BOT_TOKEN"] ?? env["DISCORD_TOKEN"];
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

async function loadGuildChannels(
  interaction: MessageComponentInteraction,
  guildId: string,
) {
  const env = interaction.context.env as Record<string, unknown>;
  const token = botToken(env);
  if (!token) {
    return [];
  }
  return fetchGuildTextChannels(guildId, token);
}

function baseSettings(guildId: string): ProtoNotificationSettings {
  return {
    guildId,
    game: Game.R6,
    matchResultsChannel: "",
    tournamentAnnouncementsChannel: "",
    leaderboardUpdatesEnabled: false,
    updatedAtMs: 0n,
    crossGuildAnnouncementsEnabled: false,
    announceMatchReadyEnabled: false,
    announceMatchResultsEnabled: false,
  } as unknown as ProtoNotificationSettings;
}

async function fetchAndRender(
  interaction: MessageComponentInteraction,
  guildId: string,
  view: { page?: number } = { page: 0 },
) {
  const env = interaction.context.env;
  const client = getClient(env) as never;
  const r = await invokeGetNotificationSettings(client, guildId);
  const emojis = await resolveEmojis(interaction);
  if (r.isErr()) {
    await editReplyV2(interaction, buildSettingsErrorCard(r.error.message, emojis));
    return;
  }
  if (!r.value.success || !r.value.settings) {
    await editReplyV2(
      interaction,
      buildSettingsErrorCard(r.value.error?.message ?? "Could not load settings.", emojis),
    );
    return;
  }
  const channels = await loadGuildChannels(interaction, guildId);
  await editReplyV2(
    interaction,
    buildNotificationSettingsCard(r.value.settings, emojis, channels, view),
  );
}

async function applyUpdate(
  interaction: MessageComponentInteraction,
  newSettings: ProtoNotificationSettings,
  view: { page?: number } = { page: 0 },
) {
  const env = interaction.context.env;
  const client = getClient(env) as never;
  const result = await invokeUpsertNotificationSettings(client, newSettings);
  const emojis = await resolveEmojis(interaction);
  if (result.isErr()) {
    await editReplyV2(interaction, buildSettingsErrorCard(result.error.message, emojis));
    return;
  }
  if (!result.value.success) {
    await editReplyV2(
      interaction,
      buildSettingsErrorCard(
        result.value.error?.message ?? "Settings update failed",
        emojis,
      ),
    );
    return;
  }
  const channels = await loadGuildChannels(interaction, newSettings.guildId);
  const card = buildNotificationSettingsCard(
    result.value.settings ?? newSettings,
    emojis,
    channels,
    view,
  );
  await editReplyV2(interaction, card);
}

export const settingsButtonHandler = new ComponentHandler(
  "settings",
  COMPONENT_BUTTON,
).addHandler(async (interaction) => {
  const customId = interaction.customId;
  const env = interaction.context.env;
  const guildId = interaction.guildId;

  if (!guildId) {
    const emojis = await resolveEmojis(interaction);
    await editReplyV2(interaction, buildSettingsErrorCard("No guild context.", emojis));
    return;
  }

  if (!(await deferComponent(interaction))) {
    return;
  }

  if (customId.startsWith(SETTINGS_PAGE_PREFIX)) {
    const pageStr = customId.slice(SETTINGS_PAGE_PREFIX.length);
    const page = Number.parseInt(pageStr, 10);
    if (!Number.isFinite(page)) {
      return;
    }
    await fetchAndRender(interaction, guildId, { page });
    return;
  }

  if (customId.startsWith(SETTINGS_TOGGLE_PREFIX)) {
    const rest = customId.slice(SETTINGS_TOGGLE_PREFIX.length);
    const sep = rest.lastIndexOf("/");
    const field = rest.slice(0, sep);
    const value = rest.slice(sep + 1);
    const enabled = value === "on";

    const client = getClient(env) as never;
    const currentResult = await invokeGetNotificationSettings(client, guildId);
    const current =
      currentResult.isOk() && currentResult.value.success && currentResult.value.settings
        ? currentResult.value.settings
        : baseSettings(guildId);

    const updated: ProtoNotificationSettings = {
      ...current,
      updatedAtMs: BigInt(Date.now()),
    };

    switch (field) {
      case "leaderboard":
        (updated as { leaderboardUpdatesEnabled: boolean }).leaderboardUpdatesEnabled = enabled;
        break;
      case "cross_guild":
        (updated as { crossGuildAnnouncementsEnabled: boolean }).crossGuildAnnouncementsEnabled =
          enabled;
        break;
      case "match_ready":
        (updated as { announceMatchReadyEnabled: boolean }).announceMatchReadyEnabled = enabled;
        break;
      case "match_results":
        (updated as { announceMatchResultsEnabled: boolean }).announceMatchResultsEnabled = enabled;
        break;
      default:
        logger.warn("settings.toggle_unknown", `Unknown toggle field: ${field}`);
        return;
    }

    await applyUpdate(interaction, updated, { page: 1 });
    return;
  }

  if (customId === SETTINGS_CANCEL) {
    await fetchAndRender(interaction, guildId);
    return;
  }
});

export const settingsSelectHandler = new ComponentHandler(
  "settings",
  COMPONENT_STRING_SELECT,
).addHandler(async (interaction) => {
  const customId = interaction.customId;
  const guildId = interaction.guildId;

  if (!guildId) {
    const emojis = await resolveEmojis(interaction);
    await editReplyV2(interaction, buildSettingsErrorCard("No guild context.", emojis));
    return;
  }

  if (!(await deferComponent(interaction))) {
    return;
  }

  const selectedValues =
    interaction instanceof StringSelectInteraction
      ? interaction.values
      : (interaction.raw.data as { values?: string[] }).values;
  const selectedChannel = channelIdFromSelectValue(selectedValues?.[0] ?? "");

  const env = interaction.context.env;
  const client = getClient(env) as never;
  const currentResult = await invokeGetNotificationSettings(client, guildId);
  const current =
    currentResult.isOk() && currentResult.value.success && currentResult.value.settings
      ? currentResult.value.settings
      : baseSettings(guildId);

  const updated: ProtoNotificationSettings = {
    ...current,
    updatedAtMs: BigInt(Date.now()),
  };

  if (customId.startsWith(SETTINGS_MATCH_RESULTS_PREFIX)) {
    (updated as { matchResultsChannel: string }).matchResultsChannel = selectedChannel;
  } else if (customId.startsWith(SETTINGS_TOURNAMENT_PREFIX)) {
    (updated as { tournamentAnnouncementsChannel: string }).tournamentAnnouncementsChannel =
      selectedChannel;
  }

  await applyUpdate(interaction, updated, { page: 0 });
});

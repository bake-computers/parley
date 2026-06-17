import { ComponentHandler, logger } from "@parley/runtime";
import type { MessageComponentInteraction } from "@parley/runtime";
import type { GuildNotificationSettings as ProtoNotificationSettings } from "@parley/proto";
import { Game } from "@parley/proto";
import { getGuildSettingsClient } from "../../transport.js";
import { editReplyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import {
  SETTINGS_MATCH_RESULTS_PREFIX,
  SETTINGS_TOURNAMENT_PREFIX,
  SETTINGS_TOGGLE_PREFIX,
  SETTINGS_CANCEL,
} from "./constants.js";
import { buildNotificationSettingsCard, buildSettingsErrorCard } from "./ui.js";
import {
  invokeGetNotificationSettings,
  invokeUpsertNotificationSettings,
} from "./rpc.js";

const COMPONENT_BUTTON = 2;
const COMPONENT_STRING_SELECT = 3;

function getClient(env: unknown) {
  return getGuildSettingsClient(env as never);
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

async function fetchAndRender(interaction: MessageComponentInteraction, guildId: string) {
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
  await editReplyV2(interaction, buildNotificationSettingsCard(r.value.settings, emojis));
}

async function applyUpdate(
  interaction: MessageComponentInteraction,
  newSettings: ProtoNotificationSettings,
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
  const card = buildNotificationSettingsCard(
    result.value.settings ?? newSettings,
    emojis,
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

    await applyUpdate(interaction, updated);
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

  const selectedValues = (interaction as { values?: string[] }).values;
  const selectedChannel = selectedValues?.[0] ?? "";

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

  await applyUpdate(interaction, updated);
});

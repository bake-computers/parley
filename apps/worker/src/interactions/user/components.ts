import {
  ComponentHandler,
  ModalHandler,
  type MessageComponentInteraction,
  type ModalInteraction,
  logger,
} from "@parley/runtime";
import { UserSettingsService } from "@parley/proto";
import type { UserSettings as ProtoUserSettings } from "@parley/proto";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { resolveEngineTransport } from "../../engine-transport.js";
import { editReplyV2, updateV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { nowMs } from "./helpers.js";
import {
  USER_CANCEL,
  USER_DELETE_MODAL,
  USER_DELETE_OPEN,
  USER_LANG_PREFIX,
  USER_MATCHMAKING_PREFIX,
  USER_REFRESH_STATS,
  USER_TIMEZONE_PREFIX,
  USER_VISIBILITY_PREFIX,
  USER_ACCEPT_BUTTON,
} from "./constants.js";
import { buildDeleteConfirmModal } from "./modal.js";
import { buildDeleteResultCard, buildErrorCard, buildInfoCard, buildSettingsCard } from "./ui.js";
import { invokeDeleteUserData, invokeGetUserSettings, invokeUpsertUserSettings } from "./rpc.js";
import { Language } from "@parley/proto";

const COMPONENT_BUTTON = 2;

function getClient(env: unknown) {
  const config = resolveEngineTransport(env as never);
  const transport = createConnectTransport({
    baseUrl: config.baseUrl,
    fetch: config.fetchImpl as typeof fetch,
    jsonOptions: { enumAsInteger: true },
  });
  return createClient(UserSettingsService, transport);
}

function baseSettings(discordUserId: string): ProtoUserSettings {
  return {
    discordUserId,
    language: Language.EN,
    updatedAtMs: 0,
    matchmakingEnabled: true,
    termsAcceptedAtMs: 0,
    profilePublic: true,
    timezone: "UTC",
  } as unknown as ProtoUserSettings;
}

async function applyUpdate(
  interaction: MessageComponentInteraction,
  newSettings: ProtoUserSettings,
) {
  const env = interaction.context.env;
  const client = getClient(env) as never;
  const result = await invokeUpsertUserSettings(client, newSettings);
  const emojis = await resolveEmojis(interaction);
  if (result.isErr()) {
    await editReplyV2(interaction, buildErrorCard(result.error.message, emojis));
    return;
  }
  if (!result.value.success) {
    await editReplyV2(
      interaction,
      buildErrorCard(result.value.error?.message ?? "Settings update failed", emojis),
    );
    return;
  }
  const card = buildSettingsCard(result.value.settings ?? newSettings, emojis);
  await editReplyV2(interaction, card);
}

export const userButtonHandler = new ComponentHandler("user", COMPONENT_BUTTON).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const customId = interaction.customId;
    const env = interaction.context.env;
    const discordUserId = interaction.user?.id ?? "";

    if (customId === USER_ACCEPT_BUTTON) {
      const settingsResult = await invokeGetUserSettings(getClient(env) as never, discordUserId);
      const current =
        settingsResult.isOk() && settingsResult.value.success
          ? (settingsResult.value.settings ?? baseSettings(discordUserId))
          : baseSettings(discordUserId);
      const updated: ProtoUserSettings = {
        ...current,
        termsAcceptedAtMs: nowMs(),
        updatedAtMs: nowMs(),
      };
      const r = await invokeUpsertUserSettings(getClient(env) as never, updated);
      const emojis = await resolveEmojis(interaction);
      if (r.isErr()) {
        await updateV2(interaction, buildErrorCard(r.error.message, emojis));
        return;
      }
      await updateV2(interaction, buildInfoCard("✅ Accepted. Please re-run your command."));
      return;
    }

    const settingsResult = await invokeGetUserSettings(getClient(env) as never, discordUserId);
    if (settingsResult.isErr() || !settingsResult.value.success || !settingsResult.value.settings) {
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildErrorCard("Could not load your settings.", emojis));
      return;
    }
    const current = settingsResult.value.settings;

    if (customId.startsWith(USER_LANG_PREFIX)) {
      const v = customId.slice(USER_LANG_PREFIX.length);
      await applyUpdate(interaction, {
        ...current,
        language: v === "de" ? Language.DE : Language.EN,
        updatedAtMs: nowMs(),
      });
      return;
    }
    if (customId.startsWith(USER_MATCHMAKING_PREFIX)) {
      const v = customId.slice(USER_MATCHMAKING_PREFIX.length);
      await applyUpdate(interaction, {
        ...current,
        matchmakingEnabled: v === "on",
        updatedAtMs: nowMs(),
      });
      return;
    }
    if (customId.startsWith(USER_VISIBILITY_PREFIX)) {
      const v = customId.slice(USER_VISIBILITY_PREFIX.length);
      await applyUpdate(interaction, {
        ...current,
        profilePublic: v === "public",
        updatedAtMs: nowMs(),
      });
      return;
    }
    if (customId.startsWith(USER_TIMEZONE_PREFIX)) {
      const tz = decodeURIComponent(customId.slice(USER_TIMEZONE_PREFIX.length));
      await applyUpdate(interaction, { ...current, timezone: tz, updatedAtMs: nowMs() });
      return;
    }
    if (customId === USER_REFRESH_STATS) {
      await editReplyV2(
        interaction,
        buildInfoCard(
          "To refresh your stats, run `/profile` first to confirm your linked account, then click here again. Full auto-refresh ships next cycle.",
        ),
      );
      return;
    }
    if (customId === USER_DELETE_OPEN) {
      const deferred = await interaction.deferUpdate();
      if (deferred.isErr()) {
        return;
      }
      const modal = buildDeleteConfirmModal(interaction.user?.username ?? "");
      const r = await interaction.showModal(modal);
      if (r.isErr()) {
        logger.error("user.modal_open_failed", "Failed to open delete modal", {
          interactionId: interaction.id,
          error: r.error,
        });
      }
      return;
    }
    if (customId === USER_CANCEL) {
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildSettingsCard(current, emojis));
      return;
    }
  },
);

export const userModalHandler = new ModalHandler(USER_DELETE_MODAL).addHandler(
  async (interaction: ModalInteraction) => {
    const env = interaction.context.env;
    const discordUserId = interaction.user?.id ?? "";
    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      return;
    }
    const client = getClient(env) as never;
    const result = await invokeDeleteUserData(client, discordUserId);
    const emojis = await resolveEmojis(interaction);
    if (result.isErr()) {
      await editReplyV2(interaction, buildErrorCard(result.error.message, emojis));
      return;
    }
    if (!result.value.success || !result.value.anonymizedDiscordUserId) {
      await editReplyV2(
        interaction,
        buildErrorCard(result.value.error?.message ?? "Could not delete your data.", emojis),
      );
      return;
    }
    const card = buildDeleteResultCard(
      {
        anonymizedDiscordUserId: result.value.anonymizedDiscordUserId,
        cooldownUntilMs: Number(result.value.cooldownUntilMs),
        tablesAffected: result.value.tablesAffected!,
      },
      emojis,
    );
    await editReplyV2(interaction, card);
  },
);

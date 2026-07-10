import {
  ComponentHandler,
  ModalHandler,
  type MessageComponentInteraction,
  type ModalInteraction,
  logger,
} from "@parley/runtime";
import type { UserSettings as ProtoUserSettings } from "@parley/proto";
import { getUserSettingsClient } from "#/transport";
import { editReplyV2, updateV2 } from "#/ui/discord";
import { resolveEmojis } from "#/ui/emojis";
import { nowMs } from "#/interactions/user/helpers";
import {
  USER_CANCEL,
  USER_DELETE_MODAL,
  USER_DELETE_OPEN,
  USER_MATCHMAKING_PREFIX,
  USER_REFRESH_STATS,
  USER_TIMEZONE_PREFIX,
  USER_VISIBILITY_PREFIX,
  USER_ACCEPT_BUTTON,
  USER_PAGE_PREFIX,
  USER_TZ_PAGE_PREFIX,
} from "#/interactions/user/constants";
import { buildDeleteConfirmModal, USER_DELETE_CONFIRM_INPUT } from "#/interactions/user/modal";
import { parseAcceptSource, refreshSettingsCache } from "#/interactions/_shared/acceptance";
import { resumeAfterAccept } from "#/interactions/_shared/resume-after-accept";
import {
  buildDeleteResultCard,
  buildErrorCard,
  buildInfoCard,
  buildSettingsCard,
} from "#/interactions/user/ui";
import {
  invokeDeleteUserData,
  invokeGetUserSettings,
  invokeUpsertUserSettings,
} from "#/interactions/user/rpc";
const COMPONENT_BUTTON = 2;

function getClient(env: unknown) {
  return getUserSettingsClient(env as never);
}

function baseSettings(discordUserId: string): ProtoUserSettings {
  return {
    discordUserId,
    updatedAtMs: 0,
    matchmakingEnabled: true,
    termsAcceptedAtMs: 0,
    profilePublic: true,
    timezone: "UTC",
  } as unknown as ProtoUserSettings;
}

type UserSettingsView = { page: number; timezonePage: number };

const DEFAULT_VIEW: UserSettingsView = { page: 0, timezonePage: 0 };

async function deferComponent(interaction: MessageComponentInteraction): Promise<boolean> {
  const deferred = await interaction.deferUpdate();
  if (deferred.isErr()) {
    logger.error("user.defer_failed", "Failed to defer component interaction", {
      interactionId: interaction.id,
      error: deferred.error,
    });
    return false;
  }
  return true;
}

async function applyUpdate(
  interaction: MessageComponentInteraction,
  newSettings: ProtoUserSettings,
  view: UserSettingsView = DEFAULT_VIEW,
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
  const card = buildSettingsCard(result.value.settings ?? newSettings, emojis, view);
  await editReplyV2(interaction, card);
}

function parseUserPageCustomId(customId: string): UserSettingsView | undefined {
  if (customId.startsWith(USER_PAGE_PREFIX)) {
    const rest = customId.slice(USER_PAGE_PREFIX.length);
    const [pageStr, tzStr] = rest.split(":");
    const page = Number(pageStr);
    const timezonePage = Number(tzStr);
    if (Number.isFinite(page) && Number.isFinite(timezonePage)) {
      return { page, timezonePage };
    }
  }
  if (customId.startsWith(USER_TZ_PAGE_PREFIX)) {
    const rest = customId.slice(USER_TZ_PAGE_PREFIX.length);
    const [tzStr, pageStr] = rest.split(":");
    const timezonePage = Number(tzStr);
    const page = Number(pageStr);
    if (Number.isFinite(page) && Number.isFinite(timezonePage)) {
      return { page, timezonePage };
    }
  }
  return undefined;
}

function parseTimezoneCustomId(
  customId: string,
): { timezone: string; view: UserSettingsView } | undefined {
  if (!customId.startsWith(USER_TIMEZONE_PREFIX)) {
    return undefined;
  }
  const rest = customId.slice(USER_TIMEZONE_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return undefined;
  }
  const meta = rest.slice(0, slash);
  const timezone = decodeURIComponent(rest.slice(slash + 1));
  const [pageStr, timezonePageStr] = meta.split(":");
  const page = Number(pageStr);
  const timezonePage = Number(timezonePageStr);
  if (!timezone || !Number.isFinite(page) || !Number.isFinite(timezonePage)) {
    return undefined;
  }
  return { timezone, view: { page, timezonePage } };
}

export const userButtonHandler = new ComponentHandler("user", COMPONENT_BUTTON).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const customId = interaction.customId;
    const env = interaction.context.env;
    const discordUserId = interaction.user?.id ?? "";

    if (customId === USER_ACCEPT_BUTTON || customId.startsWith(`${USER_ACCEPT_BUTTON}/`)) {
      const source = parseAcceptSource(customId);
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
      const settings = r.value.settings ?? updated;
      refreshSettingsCache(interaction, settings);
      await resumeAfterAccept(interaction, source, settings);
      return;
    }

    if (customId === USER_DELETE_OPEN) {
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

    if (!(await deferComponent(interaction))) {
      return;
    }

    const settingsResult = await invokeGetUserSettings(getClient(env) as never, discordUserId);
    if (settingsResult.isErr() || !settingsResult.value.success || !settingsResult.value.settings) {
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildErrorCard("Could not load your settings.", emojis));
      return;
    }
    const current = settingsResult.value.settings;

    const pageView = parseUserPageCustomId(customId);
    if (pageView) {
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildSettingsCard(current, emojis, pageView));
      return;
    }

    if (customId.startsWith(USER_MATCHMAKING_PREFIX)) {
      const v = customId.slice(USER_MATCHMAKING_PREFIX.length);
      await applyUpdate(
        interaction,
        {
          ...current,
          matchmakingEnabled: v === "on",
          updatedAtMs: nowMs(),
        },
        DEFAULT_VIEW,
      );
      return;
    }
    if (customId.startsWith(USER_VISIBILITY_PREFIX)) {
      const v = customId.slice(USER_VISIBILITY_PREFIX.length);
      await applyUpdate(
        interaction,
        {
          ...current,
          profilePublic: v === "public",
          updatedAtMs: nowMs(),
        },
        DEFAULT_VIEW,
      );
      return;
    }
    const timezoneSelection = parseTimezoneCustomId(customId);
    if (timezoneSelection) {
      await applyUpdate(
        interaction,
        { ...current, timezone: timezoneSelection.timezone, updatedAtMs: nowMs() },
        timezoneSelection.view,
      );
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
    if (customId === USER_CANCEL) {
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildSettingsCard(current, emojis, DEFAULT_VIEW));
      return;
    }
  },
);

export const userModalHandler = new ModalHandler(USER_DELETE_MODAL).addHandler(
  async (interaction: ModalInteraction) => {
    const env = interaction.context.env;
    const discordUserId = interaction.user?.id ?? "";
    const confirmation = interaction.fields.getString(USER_DELETE_CONFIRM_INPUT);
    const expectedUsername = interaction.user?.username ?? "";
    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      return;
    }
    if (confirmation !== expectedUsername) {
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(
        interaction,
        buildErrorCard(
          "Confirmation did not match your Discord username. Your data was not deleted.",
          emojis,
        ),
      );
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

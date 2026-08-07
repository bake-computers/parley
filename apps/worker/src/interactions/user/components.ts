import {
  ComponentHandler,
  ModalHandler,
  StringSelectInteraction,
  type MessageComponentInteraction,
  type ModalInteraction,
  logger,
} from "@parley/runtime";
import { type UserSettings as ProtoUserSettings } from "@parley/proto";
import { getUserSettingsClient } from "#/transport";
import { editReplyV2 } from "#/utils/discord";
import {
  USER_CANCEL,
  USER_DELETE_MODAL,
  USER_DELETE_OPEN,
  USER_MATCHMAKING_SELECT,
  USER_REFRESH_STATS,
  USER_VISIBILITY_SELECT,
  USER_PAGE_PREFIX,
} from "#/interactions/user/constants";
import { buildDeleteConfirmModal, USER_DELETE_CONFIRM_INPUT } from "#/interactions/user/modal";
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
const COMPONENT_STRING_SELECT = 3;

function getClient(env: unknown) {
  return getUserSettingsClient(env as never);
}

type UserSettingsView = { page: number };

const DEFAULT_VIEW: UserSettingsView = { page: 0 };

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

function selectValues(interaction: MessageComponentInteraction): string[] {
  if (interaction instanceof StringSelectInteraction) {
    return [...interaction.values];
  }
  const data = interaction.raw.data as { values?: string[] };
  return Array.isArray(data.values) ? data.values : [];
}

async function applyUpdate(
  interaction: MessageComponentInteraction,
  newSettings: ProtoUserSettings,
  view: UserSettingsView = DEFAULT_VIEW,
) {
  const env = interaction.context.env;
  const client = getClient(env) as never;
  const result = await invokeUpsertUserSettings(client, newSettings);
  if (result.isErr()) {
    await editReplyV2(interaction, buildErrorCard(result.error.message));
    return;
  }
  if (!result.value.success) {
    await editReplyV2(
      interaction,
      buildErrorCard(result.value.error?.message ?? "Settings update failed"),
    );
    return;
  }
  const card = buildSettingsCard(result.value.settings ?? newSettings, view);
  await editReplyV2(interaction, card);
}

function parseUserPageCustomId(customId: string): UserSettingsView | undefined {
  if (customId.startsWith(USER_PAGE_PREFIX)) {
    const page = Number(customId.slice(USER_PAGE_PREFIX.length));
    if (Number.isFinite(page)) {
      return { page };
    }
  }
  return undefined;
}

async function loadCurrentSettings(
  interaction: MessageComponentInteraction,
  discordUserId: string,
): Promise<ProtoUserSettings | undefined> {
  const env = interaction.context.env;
  const settingsResult = await invokeGetUserSettings(getClient(env) as never, discordUserId);
  if (settingsResult.isErr() || !settingsResult.value.success || !settingsResult.value.settings) {
    await editReplyV2(interaction, buildErrorCard("Could not load your settings."));
    return undefined;
  }
  return settingsResult.value.settings;
}

export const userButtonHandler = new ComponentHandler("user", COMPONENT_BUTTON).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const customId = interaction.customId;
    const discordUserId = interaction.user?.id ?? "";

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

    const current = await loadCurrentSettings(interaction, discordUserId);
    if (!current) {
      return;
    }

    const pageView = parseUserPageCustomId(customId);
    if (pageView) {
      await editReplyV2(interaction, buildSettingsCard(current, pageView));
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
      await editReplyV2(interaction, buildSettingsCard(current, DEFAULT_VIEW));
    }
  },
);

export const userSelectHandler = new ComponentHandler("user", COMPONENT_STRING_SELECT).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const customId = interaction.customId;
    const discordUserId = interaction.user?.id ?? "";

    if (customId !== USER_MATCHMAKING_SELECT && customId !== USER_VISIBILITY_SELECT) {
      logger.warn("user.unknown_select", "Select interaction had no recognised customId", {
        interactionId: interaction.id,
        customId,
      });
      return;
    }

    if (!(await deferComponent(interaction))) {
      return;
    }

    const current = await loadCurrentSettings(interaction, discordUserId);
    if (!current) {
      return;
    }

    const selected = selectValues(interaction)[0] ?? "";

    if (customId === USER_MATCHMAKING_SELECT) {
      await applyUpdate(
        interaction,
        {
          ...current,
          matchmakingEnabled: selected === "on",
          updatedAtMs: BigInt(Date.now())
        },
        DEFAULT_VIEW,
      );
      return;
    }
    if (customId === USER_VISIBILITY_SELECT) {
      await applyUpdate(
        interaction,
        {
          ...current,
          profilePublic: selected === "public",
          updatedAtMs: BigInt(Date.now())
        },
        DEFAULT_VIEW,
      );
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
      await editReplyV2(
        interaction,
        buildErrorCard(
          "Confirmation did not match your Discord username. Your data was not deleted.",
        ),
      );
      return;
    }
    const client = getClient(env) as never;
    const result = await invokeDeleteUserData(client, discordUserId);
    if (result.isErr()) {
      await editReplyV2(interaction, buildErrorCard(result.error.message));
      return;
    }
    if (!result.value.success || !result.value.anonymizedDiscordUserId || !result.value.tablesAffected) {
      await editReplyV2(
        interaction,
        buildErrorCard(result.value.error?.message ?? "Could not delete your data."),
      );
      return;
    }
    const card = buildDeleteResultCard(
      {
        anonymizedDiscordUserId: result.value.anonymizedDiscordUserId,
        cooldownUntilMs: Number(result.value.cooldownUntilMs),
        tablesAffected: result.value.tablesAffected,
      },
    );
    await editReplyV2(interaction, card);
  },
);

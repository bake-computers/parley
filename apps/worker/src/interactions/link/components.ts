import {
  ComponentHandler,
  logger,
  parseCustomId,
  StringSelectInteraction,
  type MessageComponentInteraction,
} from "@parley/runtime";
import { Game } from "@parley/proto";
import { editReplyV2 } from "#/utils/discord";
import {
  CONFIRM_ACTION_BACK,
  CONFIRM_ACTION_CONTINUE,
  PLATFORM_SELECT_CUSTOM_ID,
  UNLINK_SELECT_CUSTOM_ID,
  isPlatform,
} from "#/interactions/link/constants";
import { buildUsernameModal } from "#/interactions/link/modal";
import {
  executeFetchStats,
  executeLinkAccount,
  executeUnlinkAccount,
} from "#/interactions/link/rpc";
import {
  buildConfirmCard,
  buildErrorCard,
  buildFetchingStatsCard,
  buildLinkHubCard,
  buildReadyToPlayCard,
  buildUnlinkCooldownCard,
  isConfirmSelectCustomId,
} from "#/interactions/link/ui";
import { invokeLookupByDiscord } from "#/interactions/profile";
import { getIdentityClient, type EngineTransportEnv } from "#/transport";
import { parseCooldownUntilMs } from "#/utils/parley-rank";

const COMPONENT_STRING_SELECT = 3;

function selectValues(interaction: MessageComponentInteraction): string[] {
  if (interaction instanceof StringSelectInteraction) {
    return [...interaction.values];
  }
  const data = interaction.raw.data as { values?: string[] };
  return Array.isArray(data.values) ? data.values : [];
}

async function loadIdentities(interaction: MessageComponentInteraction) {
  const env = interaction.context.env as EngineTransportEnv;
  return invokeLookupByDiscord(getIdentityClient(env) as never, {
    discordUserId: interaction.user?.id ?? "",
    game: Game.R6,
  });
}

async function safeEditReplyV2(
  interaction: MessageComponentInteraction,
  container: ReturnType<typeof buildLinkHubCard>,
  event: string,
): Promise<void> {
  const result = await editReplyV2(interaction, container);
  if (result.isErr()) {
    logger.error(event, "Failed to edit deferred interaction reply", {
      interactionId: interaction.id,
      error: result.error,
    });
  }
}

export const linkSelectHandler = new ComponentHandler("link", COMPONENT_STRING_SELECT).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const customId = interaction.customId;
    const selected = selectValues(interaction)[0]?.trim() ?? "";
    if (customId === PLATFORM_SELECT_CUSTOM_ID) {
      if (!isPlatform(selected)) {
        await interaction.reply("Unknown platform. Run `/link` again.", true);
        return;
      }
      const result = await interaction.showModal(buildUsernameModal(selected));
      if (result.isErr()) {
        logger.error("link.modal_open_failed", "Failed to open username modal", {
          interactionId: interaction.id,
          error: result.error,
        });
      }
      return;
    }

    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      logger.error("link.defer_failed", "Failed to defer select interaction", {
        interactionId: interaction.id,
        error: deferred.error,
      });
      return;
    }

    if (customId === UNLINK_SELECT_CUSTOM_ID) {
      if (!isPlatform(selected)) {
        await safeEditReplyV2(
          interaction,
          buildErrorCard("Unknown platform. Run `/link` again."),
          "link.unlink_select_invalid",
        );
        return;
      }

      const unlinkResult = await executeUnlinkAccount({
        context: interaction.context,
        user: interaction.user,
        platform: selected,
      });
      if (unlinkResult.isErr()) {
        logger.error("link.unlink_failed", "unlinkAccount RPC failed", {
          interactionId: interaction.id,
          error: unlinkResult.error,
        });
        await safeEditReplyV2(
          interaction,
          buildErrorCard(unlinkResult.error.message),
          "link.unlink_card_failed",
        );
        return;
      }

      const cooldownUntilMs = Number(unlinkResult.value.cooldownUntilMs);
      const lookup = await loadIdentities(interaction);
      const identities = lookup.isOk() ? lookup.value.identities : [];
      let notice = "✓ **Account removed** for that platform.";
      if (cooldownUntilMs > 0) {
        const discordTs = `<t:${Math.floor(cooldownUntilMs / 1000)}:F>`;
        notice += `\n-# Re-link available after ${discordTs}.`;
      }
      await safeEditReplyV2(
        interaction,
        buildLinkHubCard(identities, notice),
        "link.unlinked_hub_failed",
      );
      return;
    }

    if (!isConfirmSelectCustomId(customId)) {
      logger.warn("link.unknown_select", "Select interaction had no recognised customId", {
        interactionId: interaction.id,
        customId,
      });
      return;
    }

    const parsed = parseCustomId(customId);
    if (typeof parsed === "string") {
      await safeEditReplyV2(
        interaction,
        buildErrorCard("Invalid confirmation data. Please run `/link` again."),
        "link.confirm_parse_failed",
      );
      return;
    }

    const platformValue = parsed.path[2];
    const username = parsed.params.get("username")?.trim() ?? "";

    if (!platformValue || !isPlatform(platformValue) || !username) {
      await safeEditReplyV2(
        interaction,
        buildErrorCard("Invalid confirmation data. Please run `/link` again."),
        "link.confirm_invalid",
      );
      return;
    }

    if (selected === CONFIRM_ACTION_BACK) {
      const lookup = await loadIdentities(interaction);
      const identities = lookup.isOk() ? lookup.value.identities : [];
      await safeEditReplyV2(interaction, buildLinkHubCard(identities), "link.back_to_hub_failed");
      return;
    }

    if (selected !== CONFIRM_ACTION_CONTINUE) {
      await safeEditReplyV2(
        interaction,
        buildConfirmCard(platformValue, username),
        "link.confirm_unknown_action",
      );
      return;
    }

    const rpcResult = await executeLinkAccount({
      context: interaction.context,
      user: interaction.user,
      guildId: interaction.guildId,
      platform: platformValue,
      username,
    });

    if (rpcResult.isErr()) {
      const message = rpcResult.error.message;
      const cooldownUntilMs = parseCooldownUntilMs(message);
      if (cooldownUntilMs !== null) {
        await safeEditReplyV2(
          interaction,
          buildUnlinkCooldownCard(cooldownUntilMs),
          "link.cooldown_card_failed",
        );
        return;
      }
      if (message.includes("already linked")) {
        const lookup = await loadIdentities(interaction);
        if (lookup.isOk()) {
          await safeEditReplyV2(
            interaction,
            buildLinkHubCard(lookup.value.identities),
            "link.already_linked_hub_failed",
          );
          return;
        }
      }
      logger.error("link.rpc_failed", "linkAccount RPC failed", {
        interactionId: interaction.id,
        error: rpcResult.error,
      });
      await safeEditReplyV2(interaction, buildErrorCard(message), "link.error_card_failed");
      return;
    }

    const response = rpcResult.value;
    if (!response.success) {
      const message = response.error?.message ?? "Could not link your account.";
      await safeEditReplyV2(interaction, buildErrorCard(message), "link.error_card_failed");
      return;
    }

    await safeEditReplyV2(interaction, buildFetchingStatsCard(), "link.fetching_card_failed");

    const statsResult = await executeFetchStats({
      context: interaction.context,
      username: response.usernameNormalized,
      platform: platformValue,
    });

    if (statsResult.isErr()) {
      logger.warn("link.fetch_stats_failed", "Stats fetch RPC failed", {
        interactionId: interaction.id,
        error: statsResult.error,
      });
      const lookup = await loadIdentities(interaction);
      const identities = lookup.isOk() ? lookup.value.identities : [];
      await safeEditReplyV2(
        interaction,
        buildLinkHubCard(
          identities,
          "Account linked, but stats could not be fetched. Try `/profile` shortly.",
        ),
        "link.fetch_stats_card_failed",
      );
      return;
    }

    const statsResponse = statsResult.value;
    if (!statsResponse.success) {
      const lookup = await loadIdentities(interaction);
      const identities = lookup.isOk() ? lookup.value.identities : [];
      await safeEditReplyV2(
        interaction,
        buildLinkHubCard(
          identities,
          statsResponse.error?.message ??
            "Account linked, but the stats provider returned an error. Try `/profile` shortly.",
        ),
        "link.fetch_stats_card_failed",
      );
      return;
    }

    await safeEditReplyV2(
      interaction,
      buildReadyToPlayCard({
        usernameNormalized: response.usernameNormalized,
        playerId: response.playerId,
        platform: platformValue,
        stats: statsResponse,
      }),
      "link.ready_card_failed",
    );
  },
);

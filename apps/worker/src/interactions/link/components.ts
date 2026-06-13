import {
  ComponentHandler,
  logger,
  parseCustomId,
  type MessageComponentInteraction,
} from "@parley/runtime";
import { resolveEmojis } from "../../ui/emojis.js";
import { editReplyV2 } from "../../ui/discord.js";
import { CANCEL_CUSTOM_ID, isPlatform } from "./constants.js";
import { buildUsernameModal } from "./modal.js";
import { executeFetchStats, executeLinkAccount } from "./rpc.js";
import {
  buildErrorCard,
  buildFetchingStatsCard,
  buildPlatformSelectCard,
  buildReadyToPlayCard,
} from "./ui.js";
import { assertAccepted } from "../_shared/acceptance.js";
import type { EngineTransportEnv } from "../../transport.js";

const COMPONENT_BUTTON = 2;

/**
 * Route a button click to the right step.
 *
 * Three customId shapes are recognised (all share the `link` prefix):
 *
 *   - `link/cancel`                                 — "Back" from confirm
 *   - `link/platform/{platform}`                    — Step 1 -> Step 2 (open modal)
 *   - `link/confirm/{platform}?username={username}` — Step 3 -> Step 4 (engine call)
 *
 * The platform action uses `showModal` (no deferral needed — no async RPC).
 * Every other action calls `deferUpdate` first so we get Discord's 15-minute
 * follow-up window for the engine RPC. If we tried to respond with
 * `updateV2` after a slow `linkAccount` call, Discord would time out the
 * interaction at 3s and the user would see "Interaction failed".
 */
export const linkButtonHandler = new ComponentHandler("link", COMPONENT_BUTTON).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never))) {
      return;
    }
    const customId = interaction.customId;

    // Platform action: open the username modal. No defer — showModal IS the
    // interaction response, and the user needs to see it immediately.
    if (customId.startsWith("link/platform/")) {
      const parsed = parseCustomId(customId);
      if (typeof parsed === "string") {
        logger.warn("link.malformed_custom_id", "Platform click had no path", {
          interactionId: interaction.id,
          customId,
        });
        return;
      }
      const platformValue = parsed.path[2];
      if (!platformValue || !isPlatform(platformValue)) {
        logger.warn("link.invalid_platform", "Platform click had unknown platform", {
          interactionId: interaction.id,
          customId,
        });
        return;
      }
      const result = await interaction.showModal(buildUsernameModal(platformValue));
      if (result.isErr()) {
        logger.error("link.modal_open_failed", "Failed to open username modal", {
          interactionId: interaction.id,
          error: result.error,
        });
      }
      return;
    }

    // Everything below involves editing the source message after async work.
    // Defer immediately so we have 15 minutes for the engine call rather
    // than the 3-second initial-response window.
    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      logger.error("link.defer_failed", "Failed to defer component interaction", {
        interactionId: interaction.id,
        error: deferred.error,
      });
      return;
    }

    const emojis = await resolveEmojis(interaction);

    if (customId === CANCEL_CUSTOM_ID) {
      await safeEditReplyV2(interaction, buildPlatformSelectCard(emojis), "link.cancel_failed");
      return;
    }

    const parsed = parseCustomId(customId);
    if (typeof parsed === "string") {
      logger.warn("link.malformed_custom_id", "Component interaction had no path", {
        interactionId: interaction.id,
        customId,
      });
      return;
    }

    const action = parsed.path[1];
    if (action !== "confirm") {
      logger.warn("link.unknown_action", "Component interaction had no recognised action", {
        interactionId: interaction.id,
        customId,
        action,
      });
      return;
    }

    const platformValue = parsed.path[2];
    const username = parsed.params.get("username")?.trim() ?? "";

    if (!platformValue || !isPlatform(platformValue) || !username) {
      await safeEditReplyV2(
        interaction,
        buildErrorCard("Invalid confirmation data. Please run `/link` again.", emojis),
        "link.error_card_failed",
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
      logger.error("link.rpc_failed", "linkAccount RPC failed", {
        interactionId: interaction.id,
        error: rpcResult.error,
      });
      await safeEditReplyV2(
        interaction,
        buildErrorCard(rpcResult.error.message, emojis),
        "link.error_card_failed",
      );
      return;
    }

    const response = rpcResult.value;
    if (!response.success) {
      const message = response.error?.message ?? "Could not link your account.";
      await safeEditReplyV2(interaction, buildErrorCard(message, emojis), "link.error_card_failed");
      return;
    }

    await safeEditReplyV2(interaction, buildFetchingStatsCard(emojis), "link.fetching_card_failed");

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
      const message =
        "Your account is linked, but we couldn't pull your stats right now. Try `/profile` in a few minutes — the snapshot will appear once stats.cc is reachable.";
      await safeEditReplyV2(
        interaction,
        buildErrorCard(message, emojis),
        "link.fetch_stats_card_failed",
      );
      return;
    }

    const statsResponse = statsResult.value;
    if (!statsResponse.success) {
      const message =
        statsResponse.error?.message ??
        "Your account is linked, but the stats provider returned an error. Try `/profile` shortly.";
      await safeEditReplyV2(
        interaction,
        buildErrorCard(message, emojis),
        "link.fetch_stats_card_failed",
      );
      return;
    }

    await safeEditReplyV2(
      interaction,
      buildReadyToPlayCard(
        {
          usernameNormalized: response.usernameNormalized,
          playerId: response.playerId,
          platform: platformValue,
          stats: statsResponse,
        },
        emojis,
      ),
      "link.ready_card_failed",
    );
  },
);

async function safeEditReplyV2(
  interaction: MessageComponentInteraction,
  container: ReturnType<typeof buildPlatformSelectCard>,
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

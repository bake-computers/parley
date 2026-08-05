import { ComponentHandler, logger, type MessageComponentInteraction } from "@parley/runtime";
import { editReplyV2 } from "#/ui/discord";
import { invokeListMatches } from "#/interactions/history/rpc";
import { buildHistoryCard, buildHistoryErrorCard } from "#/interactions/history/ui";
import { HISTORY_PAGE_PREFIX, HISTORY_PAGE_WINDOW } from "#/interactions/history/constants";
import { Game } from "@parley/proto";
import type { EngineTransportEnv } from "#/transport";

const COMPONENT_BUTTON = 2;

function parsePage(customId: string): number | undefined {
  if (!customId.startsWith(HISTORY_PAGE_PREFIX)) {
    return undefined;
  }
  const page = Number(customId.slice(HISTORY_PAGE_PREFIX.length));
  return Number.isInteger(page) && page >= 0 ? page : undefined;
}

export const historyButtonHandler = new ComponentHandler("history", COMPONENT_BUTTON).addHandler(
  async (interaction: MessageComponentInteraction) => {
    const page = parsePage(interaction.customId);
    if (page === undefined) {
      return;
    }
    const guildId = interaction.guildId;
    if (!guildId) {
      return;
    }

    const deferred = await interaction.deferUpdate();
    if (deferred.isErr()) {
      logger.error("history.defer_failed", "Failed to defer component interaction", {
        interactionId: interaction.id,
        error: deferred.error,
      });
      return;
    }

    const env = interaction.context.env as EngineTransportEnv;
    const result = await invokeListMatches({
      env,
      guildId,
      game: Game.R6,
      limit: HISTORY_PAGE_WINDOW,
      cursor: "",
    });
    if (result.isErr()) {
      await editReplyV2(
        interaction,
        buildHistoryErrorCard(`Could not load match history: ${result.error.message}`),
      );
      return;
    }
    await editReplyV2(interaction, buildHistoryCard(result.value.matches, page));
  },
);

import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { editReplyV2 } from "#/utils/discord";
import { invokeListMatches } from "#/interactions/history/rpc";
import { buildHistoryCard, buildHistoryErrorCard } from "#/interactions/history/ui";
import {
  HISTORY_COMMAND_NAME,
  HISTORY_COMMAND_DESCRIPTION,
  HISTORY_PAGE_WINDOW,
} from "#/interactions/history/constants";
import { Game } from "@parley/proto";
import type { EngineTransportEnv } from "#/transport";

export const historyCommand = new SlashCommand()
  .setName(HISTORY_COMMAND_NAME)
  .setDescription(HISTORY_COMMAND_DESCRIPTION)
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;

    const guildId = interaction.guildId;
    if (!guildId) {
      await editReplyV2(
        interaction,
        buildHistoryErrorCard("This command can only be used in a server."),
      );
      return;
    }

    const result = await invokeListMatches({
      env,
      guildId,
      game: Game.R6,
      limit: HISTORY_PAGE_WINDOW,
      cursor: "",
    });
    if (result.isOk()) {
      await editReplyV2(interaction, buildHistoryCard(result.value.matches, 0));
    } else {
      await editReplyV2(
        interaction,
        buildHistoryErrorCard(`Could not load match history: ${result.error.message}`),
      );
    }
  });

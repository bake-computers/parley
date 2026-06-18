import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { assertAccepted } from "../_shared/acceptance.js";
import { editReplyV2 } from "../../ui/discord.js";
import { invokeListMatches } from "./rpc.js";
import { buildHistoryCard, buildHistoryErrorCard } from "./ui.js";
import {
  HISTORY_COMMAND_NAME,
  HISTORY_COMMAND_DESCRIPTION,
} from "./constants.js";
import { Game } from "@parley/proto";
import type { EngineTransportEnv } from "../../transport.js";

export const historyCommand = new SlashCommand()
  .setName(HISTORY_COMMAND_NAME)
  .setDescription(HISTORY_COMMAND_DESCRIPTION)
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never))) {
      return;
    }

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
      limit: 5,
      cursor: "",
    });
    if (result.isOk()) {
      const card = buildHistoryCard(result.value.matches, guildId);
      await editReplyV2(interaction, card);
    } else {
      await editReplyV2(
        interaction,
        buildHistoryErrorCard(`Could not load match history: ${result.error.message}`),
      );
    }
  });

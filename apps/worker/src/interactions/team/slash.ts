import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { assertAccepted } from "#/interactions/_shared/acceptance";
import { replyV2 } from "#/ui/discord";
import { resolveEmojis } from "#/ui/emojis";
import type { EngineTransportEnv } from "#/transport";
import { TEAM_COMMAND_DESCRIPTION, TEAM_COMMAND_NAME } from "#/interactions/team/constants";
import { buildTeamErrorCard, buildTeamSetupCard } from "#/interactions/team/ui";

export const teamSlashCommand = new SlashCommand()
  .setName(TEAM_COMMAND_NAME)
  .setDescription(TEAM_COMMAND_DESCRIPTION)
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    const env = interaction.context.env as EngineTransportEnv;
    if (!(await assertAccepted(interaction, env as never))) {
      return;
    }
    if (!interaction.guildId) {
      const emojis = await resolveEmojis(interaction);
      await replyV2(interaction, buildTeamErrorCard("Use /team in a server channel.", emojis));
      return;
    }
    // Non-ephemeral: everyone in the channel sees the lobby and can be picked.
    await replyV2(interaction, buildTeamSetupCard(), false);
  });

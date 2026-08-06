import { SlashCommand, type ChatInputCommandInteraction } from "@parley/runtime";
import { editReplyV2 } from "#/ui/discord";
import { resolveEmojis } from "#/ui/emojis";
import { TEAM_COMMAND_DESCRIPTION, TEAM_COMMAND_NAME } from "#/interactions/team/constants";
import { buildTeamErrorCard, buildTeamSetupCard } from "#/interactions/team/ui";

export const teamSlashCommand = new SlashCommand()
  .setName(TEAM_COMMAND_NAME)
  .setDescription(TEAM_COMMAND_DESCRIPTION)
  .addHandler(async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guildId) {
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildTeamErrorCard("Use /team in a server channel.", emojis));
      return;
    }
    await editReplyV2(interaction, buildTeamSetupCard());
  });

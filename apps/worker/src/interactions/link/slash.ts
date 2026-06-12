import { SlashCommand } from "@parley/runtime";
import { editReplyV2 } from "../../ui/discord.js";
import { resolveEmojis } from "../../ui/emojis.js";
import { buildErrorCard, buildPlatformSelectCard } from "./ui.js";

export const linkSlashCommand = new SlashCommand()
  .setName("link")
  .setDescription("Link your Discord account to your game account")
  .addHandler(async (interaction) => {
    if (!interaction.user) {
      await interaction.deferReply(true);
      const emojis = await resolveEmojis(interaction);
      await editReplyV2(interaction, buildErrorCard("Could not identify Discord user.", emojis));
      return;
    }

    await interaction.deferReply(true);
    const emojis = await resolveEmojis(interaction);
    await editReplyV2(interaction, buildPlatformSelectCard(emojis));
  });

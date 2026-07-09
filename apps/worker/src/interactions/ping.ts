import { ContainerBuilder, SlashCommand, TextDisplayBuilder } from "@parley/runtime";
import { replyV2 } from "#/ui/discord.js";
import { UI_TOKENS } from "#/ui/tokens.js";

export const pingCommand = new SlashCommand()
  .setName("ping")
  .setDescription("Check if the bot is responsive")
  .addHandler(async (interaction) => {
    const container = new ContainerBuilder()
      .setAccentColor(UI_TOKENS.main)
      .addComponents(new TextDisplayBuilder().setContent("Pong! 🏓"));
    await replyV2(interaction, container, true);
  });

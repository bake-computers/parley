import { ContainerBuilder, SlashCommand, TextDisplayBuilder } from "@parley/runtime";
import { replyV2 } from "#/utils/discord";
import { ColorPalette } from "#/utils/constants";

export const pingCommand = new SlashCommand()
  .setName("ping")
  .setDescription("Check if the bot is responsive")
  .addHandler(async (interaction) => {
    const container = new ContainerBuilder()
      .setAccentColor(ColorPalette.main)
      .addComponents(new TextDisplayBuilder().setContent("Pong! 🏓"));
    await replyV2(interaction, container, true);
  });

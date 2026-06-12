import { SlashCommand } from "@parley/runtime";

export const pingCommand = new SlashCommand()
  .setName("ping")
  .setDescription("Check if the bot is responsive")
  .addHandler(async (interaction) => {
    await interaction.reply("Pong! 🏓", true);
  });

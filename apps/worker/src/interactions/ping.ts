import { SlashCommand } from "@parley/discord-runtime";

export const pingCommand = new SlashCommand()
  .setName("ping")
  .setDescription("Check bot latency")
  .addHandler(async (interaction) => {
    await interaction.reply("🏓 Pong!");
  });

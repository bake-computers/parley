import { EmbedBuilder, SlashCommand } from "@parley/runtime";

export const helpCommand = new SlashCommand()
  .setName("help")
  .setDescription("List all available commands")
  .addHandler(async (interaction) => {
    const embed = new EmbedBuilder()
      .setTitle("Parley Commands")
      .setColor(0xffffff)
      .addFields(
        { name: "/ping", value: "Check if the bot is responsive" },
        { name: "/help", value: "List all available commands" },
        { name: "/link", value: "Link your Discord account to your game account" },
        { name: "/profile", value: "View your linked game accounts and stats" },
      );

    await interaction.reply({ embeds: [embed.toJSON()] }, true);
  });

import { SlashCommandHandler } from "honocord";

export const pingCommand = new SlashCommandHandler()
  .setName("ping")
  .setDescription("Check bot latency")
  .addHandler(async (interaction) => {
    // await interaction.reply({
    //     embeds: [
    //         {
    //             title
    //         }
    //     ]
    // });
  });

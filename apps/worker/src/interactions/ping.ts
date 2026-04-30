import { SlashCommand } from "@parley/discord-runtime";
import type { WorkerRuntimeEnv } from "../env";
import { enforceCommandCooldown } from "./command-cooldowns";

export const pingCommand = new SlashCommand()
  .setName("ping")
  .setDescription("Check bot latency")
  .addHandler(async (interaction) => {
    const cooldown = await enforceCommandCooldown(
      interaction.context.env as Partial<WorkerRuntimeEnv>,
      {
        commandKey: "ping",
        userId: interaction.userId,
      },
    );
    if (!cooldown.allowed) {
      await interaction.reply(cooldown.payload, true);
      return;
    }

    await interaction.reply("🏓 Pong!");
  });

import { registerApplicationCommands } from "@parley/discord-runtime";
import { logger } from "@parley/core/logger";
import * as interactions from "./interactions";

const result = await registerApplicationCommands(
  process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN,
  process.env.DISCORD_APPLICATION_ID,
  ...Object.values(interactions),
);

if (result.isErr()) {
  logger.error("discord.command.register_failed", "Failed to register Discord commands", {
    error: result.error,
  });
  process.exit(1);
}

logger.info("discord.command.registered", "Registered Discord commands", {
  globalCommandCount: result.value.globalCommandCount,
  guildCommandCounts: result.value.guildCommandCounts,
});

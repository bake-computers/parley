import { logger } from "@parley/core/logger";
import { registerApplicationCommands } from "@parley/discord-runtime";
import * as interactions from "./interactions";
import { findMissingDiscordEnv, loadLocalEnvFiles, resolveDiscordToken } from "./local-env";

const loadedEnv = await loadLocalEnvFiles(import.meta.url);
const missingEnv = findMissingDiscordEnv({
  requirePublicKey: false,
  requireApplicationId: true,
  requireToken: true,
});

if (missingEnv.length > 0) {
  logger.error("discord.command.register_missing_env", "Discord register env is missing", {
    missingEnv,
    loadedFiles: loadedEnv.loadedFiles,
    hint: "Set Discord vars in apps/worker/.dev.vars, the repo root .env/.env.local, or your shell env.",
  });
  process.exit(1);
}

const result = await registerApplicationCommands(
  resolveDiscordToken(),
  process.env.DISCORD_APPLICATION_ID,
  ...Object.values(interactions),
);

if (result.isErr()) {
  logger.error("discord.command.register_failed", "Failed to register Discord commands", {
    error: result.error,
    loadedFiles: loadedEnv.loadedFiles,
  });
  process.exit(1);
}

logger.info("discord.command.registered", "Registered Discord commands", {
  globalCommandCount: result.value.globalCommandCount,
  guildCommandCounts: result.value.guildCommandCounts,
  loadedFiles: loadedEnv.loadedFiles,
});

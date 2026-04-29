import { spawn } from "node:child_process";
import { logger } from "@parley/core/logger";
import {
  collectDiscordEnvForWorker,
  findMissingDiscordEnv,
  hydrateDiscordApplicationEnvFromApi,
  loadLocalEnvFiles,
  writeWorkerDevVars,
} from "./local-env";

const loadedEnv = await loadLocalEnvFiles(import.meta.url);
const hydrated = await hydrateDiscordApplicationEnvFromApi();
const missingEnv = findMissingDiscordEnv({
  requirePublicKey: true,
  requireApplicationId: true,
  requireToken: true,
});

if (missingEnv.length > 0) {
  logger.error("discord.dev.missing_env", "Discord dev env is missing", {
    missingEnv,
    loadedFiles: loadedEnv.loadedFiles,
    loadedPublicKeyFromApi: hydrated.loadedFromApi,
    hint: "Set Discord secrets in apps/worker/.dev.vars or the repo root .env/.env.local. DISCORD_PUBLIC_KEY can also be derived automatically when a valid bot token is present.",
  });
  process.exit(1);
}

const devVarsPath = await writeWorkerDevVars(loadedEnv.workerDir, collectDiscordEnvForWorker());
logger.info("discord.dev.env_ready", "Prepared Wrangler dev env", {
  devVarsPath,
  loadedFiles: loadedEnv.loadedFiles,
  loadedPublicKeyFromApi: hydrated.loadedFromApi,
});

if (process.argv.includes("--check")) {
  process.exit(0);
}

const child = spawn("wrangler", ["dev", "--config", "wrangler.jsonc"], {
  cwd: loadedEnv.workerDir,
  env: process.env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

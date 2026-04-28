import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@parley/core/logger";
import { registerApplicationCommands } from "@parley/discord-runtime";
import * as interactions from "./interactions";

const REQUIRED_ENV_KEYS = ["DISCORD_APPLICATION_ID", "DISCORD_BOT_TOKEN"] as const;

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function loadEnvFile(filepath: string): Promise<boolean> {
  let contents: string;
  try {
    contents = await readFile(filepath, "utf8");
  } catch {
    return false;
  }

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length) : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const value = normalizedLine.slice(separatorIndex + 1);
    if (key.length === 0 || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(value);
  }

  return true;
}

async function loadRegisterEnv(): Promise<string[]> {
  const sourceFile = fileURLToPath(import.meta.url);
  const workerDir = resolve(dirname(sourceFile), "..");
  const repoRoot = resolve(workerDir, "..", "..");
  const candidates = [
    resolve(workerDir, ".dev.vars"),
    resolve(workerDir, ".env.local"),
    resolve(workerDir, ".env"),
    resolve(repoRoot, ".env.local"),
    resolve(repoRoot, ".env"),
  ];
  const loadedFiles: string[] = [];

  for (const candidate of candidates) {
    if (await loadEnvFile(candidate)) {
      loadedFiles.push(candidate);
    }
  }

  return loadedFiles;
}

function hasRequiredRegisterEnv(): boolean {
  const hasApplicationId = typeof process.env.DISCORD_APPLICATION_ID === "string";
  const hasBotToken =
    typeof process.env.DISCORD_BOT_TOKEN === "string" ||
    typeof process.env.DISCORD_TOKEN === "string";
  return hasApplicationId && hasBotToken;
}

const loadedFiles = await loadRegisterEnv();

if (!hasRequiredRegisterEnv()) {
  logger.error("discord.command.register_missing_env", "Discord register env is missing", {
    requiredKeys: REQUIRED_ENV_KEYS,
    acceptsTokenFallback: "DISCORD_TOKEN",
    loadedFiles,
    hint: "Set Discord vars in apps/worker/.dev.vars, the repo root .env/.env.local, or your shell env.",
  });
  process.exit(1);
}

const result = await registerApplicationCommands(
  process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN,
  process.env.DISCORD_APPLICATION_ID,
  ...Object.values(interactions),
);

if (result.isErr()) {
  logger.error("discord.command.register_failed", "Failed to register Discord commands", {
    error: result.error,
    loadedFiles,
  });
  process.exit(1);
}

logger.info("discord.command.registered", "Registered Discord commands", {
  globalCommandCount: result.value.globalCommandCount,
  guildCommandCounts: result.value.guildCommandCounts,
  loadedFiles,
});

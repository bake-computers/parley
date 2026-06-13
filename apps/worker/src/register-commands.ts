import { join } from "node:path";
import {
  flattenHandlers,
  isSlashCommandHandler,
  registerApplicationCommands,
} from "@parley/runtime";
import { helpCommand } from "./interactions/help.js";
import { linkSlashCommand } from "./interactions/link/slash.js";
import { pingCommand } from "./interactions/ping.js";
import { profileCommand } from "./interactions/profile.js";
import { userSlashCommand } from "./interactions/user/index.js";

async function loadEnvFile(path: string): Promise<void> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return;
  }

  const text = await file.text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const current = process.env[key];
    if (current === undefined || current === "") {
      process.env[key] = value;
    }
  }
}

const scriptDir = import.meta.dirname;
const workerDir = join(scriptDir, "..");
const repoRoot = join(workerDir, "../..");

await loadEnvFile(join(repoRoot, ".env"));
await loadEnvFile(join(workerDir, ".env"));

const token = process.env["DISCORD_BOT_TOKEN"];
const applicationId = process.env["DISCORD_APPLICATION_ID"];

if (!token || !applicationId) {
  console.error("Error: DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set");
  console.error("Set them in apps/worker/.env or the repo root .env file.");
  process.exit(1);
}

const commands = [pingCommand, helpCommand, linkSlashCommand, profileCommand, userSlashCommand];

console.log(`Registering commands for application ${applicationId}...`);
const slashCommandCount = flattenHandlers(commands).filter(isSlashCommandHandler).length;
console.log(`Loaded ${slashCommandCount} slash commands`);

const result = await registerApplicationCommands(token, applicationId, ...commands);

if (result.isErr()) {
  console.error(`Failed to register commands: ${result.error.message}`);
  process.exit(1);
}

const summary = result.value;
console.log(`Successfully registered ${summary.globalCommandCount} global commands`);

if (Object.keys(summary.guildCommandCounts).length > 0) {
  for (const [guildId, count] of Object.entries(summary.guildCommandCounts)) {
    console.log(`  Guild ${guildId}: ${count} commands`);
  }
}

process.exit(0);

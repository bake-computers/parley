import { registerApplicationCommands } from "@parley/runtime";

async function loadCommands() {
  try {
    const [ping, help, link, profile] = await Promise.all([
      import("./commands/ping.js" as string),
      import("./commands/help.js" as string),
      import("./commands/link.js" as string),
      import("./commands/profile.js" as string),
    ]);
    return [ping.pingCommand, help.helpCommand, link.linkCommand, profile.profileCommand];
  } catch {
    console.error("Error: One or more command modules not found. Ensure T9-T12 are implemented.");
    process.exit(1);
  }
}

const token = process.env["DISCORD_BOT_TOKEN"];
const applicationId = process.env["DISCORD_APPLICATION_ID"];

if (!token || !applicationId) {
  console.error("Error: DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set");
  process.exit(1);
}

console.log(`Registering commands for application ${applicationId}...`);

const [pingCommand, helpCommand, linkCommand, profileCommand] = await loadCommands();
const result = await registerApplicationCommands(
  token,
  applicationId,
  pingCommand,
  helpCommand,
  linkCommand,
  profileCommand,
);

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

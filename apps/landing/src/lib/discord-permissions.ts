import type { DiscordOAuthGuild } from "./discord-oauth.js";

const PERM_ADMINISTRATOR = 1n << 3n;
const PERM_MANAGE_GUILD = 1n << 5n;

export function canManageGuild(guild: DiscordOAuthGuild): boolean {
  if (guild.owner) {
    return true;
  }
  try {
    const perms = BigInt(guild.permissions);
    if ((perms & PERM_ADMINISTRATOR) !== 0n) {
      return true;
    }
    return (perms & PERM_MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
}

export function filterManageableGuilds(guilds: DiscordOAuthGuild[]): DiscordOAuthGuild[] {
  return guilds.filter(canManageGuild).sort((a, b) => a.name.localeCompare(b.name));
}
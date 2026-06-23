import type { CookieGuild, DiscordOAuthGuild } from "./oauth.js";

const PERM_ADMINISTRATOR = 1n << 3n;
const PERM_MANAGE_GUILD = 1n << 5n;

function hasManageBits(owner: boolean, permissions: string): boolean {
  if (owner) {
    return true;
  }
  try {
    const perms = BigInt(permissions);
    if ((perms & PERM_ADMINISTRATOR) !== 0n) {
      return true;
    }
    return (perms & PERM_MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
}

export function canManageGuild(guild: DiscordOAuthGuild): boolean {
  return hasManageBits(guild.owner, guild.permissions);
}

export function canManageCookieGuild(guild: CookieGuild): boolean {
  return hasManageBits(guild.owner, guild.permissions);
}

export function filterManageableGuilds(guilds: DiscordOAuthGuild[]): DiscordOAuthGuild[] {
  return guilds.filter(canManageGuild).sort((a, b) => a.name.localeCompare(b.name));
}
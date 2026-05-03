import { AUTHORIZED_DISCORD_USER_IDS } from "@parley/auth";
import type { SessionAccess } from "@parley/auth";
import type { AuthorizedSession } from "@parley/auth";

export function isGlobalAdmin(session: SessionAccess): boolean {
  if (session.status !== "authorized") {
    return false;
  }
  return AUTHORIZED_DISCORD_USER_IDS.has(session.discordUserId);
}

export function isDiscordAuthorized(discordUserId: string | null): boolean {
  if (!discordUserId) {
    return false;
  }
  return AUTHORIZED_DISCORD_USER_IDS.has(discordUserId);
}

export function assertAuthorized(session: SessionAccess): asserts session is AuthorizedSession {
  if (session.status !== "authorized") {
    throw new Error("Unauthorized access");
  }
}

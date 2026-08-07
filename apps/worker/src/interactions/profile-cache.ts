import { logger } from "@parley/runtime";
import { getProfileClient, type EngineTransportEnv } from "#/transport";

type DiscordUserLike = {
  id?: string;
  username?: string;
  globalName?: string | null;
  global_name?: string | null;
  avatar?: string | null;
};

/**
 * Cache Discord identity for parley.bot/@{username} after link (or other bot
 * actions). Non-fatal: account linking must not depend on profile upsert.
 */
export async function cacheDiscordProfileFromUser(
  env: EngineTransportEnv,
  user: DiscordUserLike | undefined,
): Promise<void> {
  const discordUserId = user?.id?.trim() ?? "";
  const username = user?.username?.trim() ?? "";
  if (!discordUserId || !username) {
    return;
  }
  const globalName = user?.globalName ?? user?.global_name ?? "";
  const avatarHash = user?.avatar ?? "";
  try {
    const client = getProfileClient(env) as {
      upsertDiscordProfile: (req: {
        discordUserId: string;
        username: string;
        globalName: string;
        avatarHash: string;
      }) => Promise<unknown>;
    };
    await client.upsertDiscordProfile({
      discordUserId,
      username,
      globalName: typeof globalName === "string" ? globalName : "",
      avatarHash: typeof avatarHash === "string" ? avatarHash : "",
    });
  } catch (err) {
    logger.warn("profile.cache_failed", "UpsertDiscordProfile failed after bot action", {
      discordUserId,
      error: err,
    });
  }
}

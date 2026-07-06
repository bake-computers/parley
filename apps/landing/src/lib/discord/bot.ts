const DISCORD_API = "https://discord.com/api/v10";

/** Slash commands, messages, embeds, channels, history — enough for matchmaking. */
export const PARLEY_BOT_PERMISSIONS = "388160";

export function buildBotInviteUrl(clientId: string, guildId: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("permissions", PARLEY_BOT_PERMISSIONS);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("guild_id", guildId);
  url.searchParams.set("disable_guild_select", "true");
  url.searchParams.set("response_type", "code");
  return url.toString();
}

async function fetchBotUserId(botToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) {
      return null;
    }
    const user = (await res.json()) as { id?: string };
    return typeof user.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

export async function botIsInGuild(
  botToken: string,
  guildId: string,
  botUserId?: string | null,
): Promise<boolean> {
  const headers = { Authorization: `Bot ${botToken}` };
  const id = guildId.trim();

  try {
    const guildRes = await fetch(`${DISCORD_API}/guilds/${id}`, { headers });
    if (guildRes.ok) {
      return true;
    }
    if (guildRes.status === 404) {
      return false;
    }

    if (botUserId) {
      const memberRes = await fetch(`${DISCORD_API}/guilds/${id}/members/${botUserId}`, {
        headers,
      });
      if (memberRes.ok) {
        return true;
      }
      if (memberRes.status === 404) {
        return false;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function botInstalledGuildIds(
  botToken: string,
  guildIds: string[],
): Promise<Set<string>> {
  const installed = new Set<string>();
  if (guildIds.length === 0) {
    return installed;
  }

  const botUserId = await fetchBotUserId(botToken);
  const batchSize = 8;
  for (let i = 0; i < guildIds.length; i += batchSize) {
    const chunk = guildIds.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map(async (id) => ({
        id,
        ok: await botIsInGuild(botToken, id, botUserId),
      })),
    );
    for (const { id, ok } of results) {
      if (ok) {
        installed.add(id);
      }
    }
  }
  return installed;
}

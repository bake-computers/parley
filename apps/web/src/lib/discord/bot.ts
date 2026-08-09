import {
  BOT_GUILDS_CACHE_KEY,
  BOT_GUILDS_TTL_SEC,
  cacheGetJson,
  cachePutJson,
} from "./discord-cache.js";
import { discordAvatarUrl } from "./oauth.js";

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

export type GuildMember = {
  id: string;
  name: string;
  avatarUrl: string;
};

type RawGuildMember = {
  nick?: string | null;
  user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
  };
};

function memberDisplayName(member: RawGuildMember): string | null {
  const user = member.user;
  if (!user?.id || user.bot) {
    return null;
  }
  return member.nick?.trim() || user.global_name?.trim() || user.username?.trim() || null;
}

/**
 * Lists non-bot guild members for roster selection. Requires the privileged
 * Server Members Intent — the REST members endpoint returns 403 without it.
 */
export async function fetchGuildMembers(botToken: string, guildId: string): Promise<GuildMember[]> {
  const headers = { Authorization: `Bot ${botToken}` };
  const members: GuildMember[] = [];
  let after: string | undefined;

  for (let page = 0; page < 5; page++) {
    const url = new URL(`${DISCORD_API}/guilds/${guildId}/members`);
    url.searchParams.set("limit", "1000");
    if (after) {
      url.searchParams.set("after", after);
    }
    const res = await fetch(url.href, { headers });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          "Discord guild members failed (403) — the bot needs the Server Members Intent enabled",
        );
      }
      throw new Error(`Discord guild members failed (${res.status})`);
    }
    const batch = (await res.json()) as RawGuildMember[];
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    for (const member of batch) {
      const name = memberDisplayName(member);
      const id = member.user?.id;
      if (name && id) {
        members.push({
          id,
          name,
          avatarUrl: discordAvatarUrl(id, member.user?.avatar ?? null, 64),
        });
      }
    }
    if (batch.length < 1000) {
      break;
    }
    const last = batch.at(-1)?.user?.id;
    if (!last) {
      break;
    }
    after = last;
  }

  return members.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** One Discord list call instead of N per-guild membership probes. */
export async function fetchBotGuildIds(botToken: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  const headers = { Authorization: `Bot ${botToken}` };

  for (let page = 0; page < 50; page++) {
    const url = new URL(`${DISCORD_API}/users/@me/guilds`);
    url.searchParams.set("limit", "200");
    if (after) {
      url.searchParams.set("after", after);
    }
    const res = await fetch(url.href, { headers });
    if (!res.ok) {
      throw new Error(`Discord bot guilds failed (${res.status})`);
    }
    const batch = (await res.json()) as Array<{ id?: string }>;
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }
    for (const g of batch) {
      if (typeof g.id === "string") {
        ids.push(g.id);
      }
    }
    if (batch.length < 200) {
      break;
    }
    const last = batch.at(-1)?.id;
    if (!last) {
      break;
    }
    after = last;
  }
  return ids;
}

let botGuildsInflight: Promise<Set<string>> | null = null;

async function loadBotGuildIdSet(botToken: string): Promise<Set<string>> {
  const cached = await cacheGetJson<string[]>(BOT_GUILDS_CACHE_KEY);
  if (cached) {
    return new Set(cached);
  }
  if (botGuildsInflight) {
    return botGuildsInflight;
  }
  botGuildsInflight = (async () => {
    const ids = await fetchBotGuildIds(botToken);
    await cachePutJson(BOT_GUILDS_CACHE_KEY, ids, BOT_GUILDS_TTL_SEC);
    return new Set(ids);
  })().finally(() => {
    botGuildsInflight = null;
  });
  return botGuildsInflight;
}

/** Prefetch bot guild membership into cache (call after login). */
export async function primeBotGuildsCache(botToken: string): Promise<void> {
  await loadBotGuildIdSet(botToken);
}

/** Legacy path: one Discord request per guild (batched). */
async function botInstalledGuildIdsLegacy(
  botToken: string,
  guildIds: string[],
): Promise<Set<string>> {
  const installed = new Set<string>();
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

export async function botInstalledGuildIds(
  botToken: string,
  guildIds: string[],
): Promise<Set<string>> {
  const installed = new Set<string>();
  if (guildIds.length === 0) {
    return installed;
  }

  try {
    const botGuilds = await loadBotGuildIdSet(botToken);
    for (const id of guildIds) {
      if (botGuilds.has(id)) {
        installed.add(id);
      }
    }
    return installed;
  } catch {
    // ponytail: list endpoint can fail for some bot configs; fall back to probes
    return botInstalledGuildIdsLegacy(botToken, guildIds);
  }
}

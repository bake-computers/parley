/**
 * Two-layer match cache: landing caches rendered HTML at `match:html:<uuid>`,
 * bridge caches raw JSON at `match:json:<uuid>`. This helper reads through
 * the HTML layer and falls back to fetching JSON from the bridge service.
 */

export interface MatchParticipantData {
  discordUserId: string;
  playerId: number;
  username: string;
  platform: string;
  balanceRating: number;
  mu: number;
  phi: number;
  cpr: number;
  team?: string;
}

export interface MatchData {
  id: number;
  guildId: string;
  channelId: string;
  status: string;
  matchType: string;
  winningTeam: string;
  balanceGap: number;
  createdAtMs: number;
  participants: MatchParticipantData[];
  publicUuid: string;
  mvpUserId?: string;
}

const HTML_KEY_PREFIX = "match:html:";
const CACHE_TTL_SECONDS = 3600;

function htmlKey(uuid: string): string {
  return `${HTML_KEY_PREFIX}${uuid}`;
}

export async function fetchMatchFromCacheOrBridge(
  env: Cloudflare.Env,
  guildId: string,
  uuid: string,
): Promise<MatchData | null> {
  const cached = await env.MATCH_KV.get(htmlKey(uuid), "json");
  if (cached !== null) {
    return cached as MatchData;
  }

  const url = `https://internal/match/${guildId}/${uuid}`;
  const res = await env.BRIDGE.fetch(url);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`bridge returned ${res.status}`);
  }
  return (await res.json()) as MatchData;
}

export async function cacheMatchHtml(
  env: Cloudflare.Env,
  uuid: string,
  html: string,
): Promise<void> {
  await env.MATCH_KV.put(htmlKey(uuid), html, {
    expirationTtl: CACHE_TTL_SECONDS,
  });
}

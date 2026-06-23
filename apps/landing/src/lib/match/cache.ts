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

function readString(raw: Record<string, unknown>, camel: string, snake: string): string {
  const value = raw[camel] ?? raw[snake];
  return typeof value === "string" ? value : "";
}

function readNumber(raw: Record<string, unknown>, camel: string, snake: string): number {
  const value = raw[camel] ?? raw[snake];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeParticipant(raw: Record<string, unknown>): MatchParticipantData {
  return {
    discordUserId: readString(raw, "discordUserId", "discord_user_id"),
    playerId: readNumber(raw, "playerId", "player_id"),
    username: readString(raw, "username", "username"),
    platform: readString(raw, "platform", "platform"),
    balanceRating: readNumber(raw, "balanceRating", "balance_rating"),
    mu: readNumber(raw, "mu", "mu"),
    phi: readNumber(raw, "phi", "phi"),
    cpr: readNumber(raw, "cpr", "cpr"),
    team: readString(raw, "team", "team") || undefined,
  };
}

export function normalizeMatchData(raw: unknown): MatchData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const participantsRaw = record["participants"];
  const participants = Array.isArray(participantsRaw)
    ? participantsRaw
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .map((entry) => normalizeParticipant(entry))
    : [];

  const mvp = readString(record, "mvpUserId", "mvp_user_id");

  return {
    id: readNumber(record, "id", "id"),
    guildId: readString(record, "guildId", "guild_id"),
    channelId: readString(record, "channelId", "channel_id"),
    status: readString(record, "status", "status"),
    matchType: readString(record, "matchType", "match_type"),
    winningTeam: readString(record, "winningTeam", "winning_team"),
    balanceGap: readNumber(record, "balanceGap", "balance_gap"),
    createdAtMs: readNumber(record, "createdAtMs", "created_at_ms"),
    participants,
    publicUuid: readString(record, "publicUuid", "public_uuid"),
    mvpUserId: mvp || undefined,
  };
}

export async function fetchMatchFromCacheOrBridge(
  env: Cloudflare.Env,
  guildId: string,
  uuid: string,
): Promise<MatchData | null> {
  const cached = await env.MATCH_KV.get(htmlKey(uuid), "json");
  if (cached !== null) {
    return normalizeMatchData(cached);
  }

  const url = `https://internal/match/${guildId}/${uuid}`;
  const res = await env.BRIDGE.fetch(url);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`bridge returned ${res.status}`);
  }
  return normalizeMatchData(await res.json());
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

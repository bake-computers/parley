import type { EngineTransportEnv } from "../engine/transport.js";
import { readEngineResponse, resolveEngineTransport } from "../engine/transport.js";

const PROFILE_SERVICE = "parley.profile.v1.ProfileService";

export type RatingPointJson = {
  recordedAtMs: number;
  elo: number;
  delta?: number;
  source: string;
};

export type ProfileMatchPlayerJson = {
  discordUserId: string;
  discordUsername: string;
  gameUsername: string;
  platform: string;
  profilePublic: boolean;
};

export type ProfileMatchJson = {
  publicUuid: string;
  createdAtMs: number;
  result: string;
  ratingDelta?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  opponents: ProfileMatchPlayerJson[];
  teammates: ProfileMatchPlayerJson[];
};

export type ProfileGameIdentityJson = {
  username: string;
  platform: string;
  internalElo: number;
  matches: number;
  wins: number;
  losses: number;
};

export type PublicProfileJson = {
  discordUserId: string;
  username: string;
  globalName: string;
  avatarHash: string;
  internalElo: number;
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  memberSinceMs: number;
  ratingHistory: RatingPointJson[];
  recentMatches: ProfileMatchJson[];
  identities: ProfileGameIdentityJson[];
};

export type GetPublicProfileResult =
  | { kind: "not_found" }
  | { kind: "redirect"; username: string }
  | {
      kind: "private";
      profile: Pick<PublicProfileJson, "discordUserId" | "username" | "globalName" | "avatarHash">;
    }
  | { kind: "public"; profile: PublicProfileJson };

/** protojson emits int64 as decimal strings; coerce for app use. */
export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

function normalizeProfile(raw: Record<string, unknown>): PublicProfileJson {
  const historyRaw = Array.isArray(raw.ratingHistory) ? raw.ratingHistory : [];
  const matchesRaw = Array.isArray(raw.recentMatches) ? raw.recentMatches : [];
  const identitiesRaw = Array.isArray(raw.identities) ? raw.identities : [];

  return {
    discordUserId: String(raw.discordUserId ?? ""),
    username: String(raw.username ?? ""),
    globalName: String(raw.globalName ?? ""),
    avatarHash: String(raw.avatarHash ?? ""),
    internalElo: asNumber(raw.internalElo),
    matches: asNumber(raw.matches),
    wins: asNumber(raw.wins),
    losses: asNumber(raw.losses),
    kills: asNumber(raw.kills),
    deaths: asNumber(raw.deaths),
    assists: asNumber(raw.assists),
    memberSinceMs: asNumber(raw.memberSinceMs),
    ratingHistory: historyRaw.map((p) => {
      const row = (p ?? {}) as Record<string, unknown>;
      return {
        recordedAtMs: asNumber(row.recordedAtMs),
        elo: asNumber(row.elo),
        delta: row.delta === undefined || row.delta === null ? undefined : asNumber(row.delta),
        source: String(row.source ?? ""),
      };
    }),
    recentMatches: matchesRaw.map((m) => {
      const row = (m ?? {}) as Record<string, unknown>;
      const opponents = Array.isArray(row.opponents) ? row.opponents : [];
      const teammates = Array.isArray(row.teammates) ? row.teammates : [];
      return {
        publicUuid: String(row.publicUuid ?? ""),
        createdAtMs: asNumber(row.createdAtMs),
        result: String(row.result ?? "unknown"),
        ratingDelta:
          row.ratingDelta === undefined || row.ratingDelta === null
            ? undefined
            : asNumber(row.ratingDelta),
        kills: row.kills === undefined || row.kills === null ? undefined : asNumber(row.kills),
        deaths: row.deaths === undefined || row.deaths === null ? undefined : asNumber(row.deaths),
        assists:
          row.assists === undefined || row.assists === null ? undefined : asNumber(row.assists),
        opponents: opponents.map(normalizeMatchPlayer),
        teammates: teammates.map(normalizeMatchPlayer),
      };
    }),
    identities: identitiesRaw.map((i) => {
      const row = (i ?? {}) as Record<string, unknown>;
      return {
        username: String(row.username ?? ""),
        platform: String(row.platform ?? ""),
        internalElo: asNumber(row.internalElo),
        matches: asNumber(row.matches),
        wins: asNumber(row.wins),
        losses: asNumber(row.losses),
      };
    }),
  };
}

function normalizeMatchPlayer(p: unknown): ProfileMatchPlayerJson {
  const row = (p ?? {}) as Record<string, unknown>;
  return {
    discordUserId: String(row.discordUserId ?? ""),
    discordUsername: String(row.discordUsername ?? ""),
    gameUsername: String(row.gameUsername ?? ""),
    platform: String(row.platform ?? ""),
    profilePublic: Boolean(row.profilePublic ?? true),
  };
}

async function profileCall<T>(
  env: EngineTransportEnv,
  method: string,
  body: unknown,
): Promise<T> {
  const { baseUrl, fetchImpl } = resolveEngineTransport(env);
  const res = await fetchImpl(new URL(`/${PROFILE_SERVICE}/${method}`, baseUrl).href, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readEngineResponse<T>(res);
}

export async function rpcGetPublicProfile(
  env: EngineTransportEnv,
  username: string,
): Promise<GetPublicProfileResult> {
  const json = await profileCall<{
    found?: boolean;
    isPrivate?: boolean;
    redirectUsername?: string;
    profile?: Record<string, unknown>;
  }>(env, "GetPublicProfile", {
    username,
    game: 1,
    recentMatchLimit: 15,
    ratingHistoryLimit: 120,
  });

  if (!json.found) {
    return { kind: "not_found" };
  }
  if (json.redirectUsername) {
    return { kind: "redirect", username: json.redirectUsername };
  }
  if (!json.profile) {
    return { kind: "not_found" };
  }
  if (json.isPrivate) {
    return {
      kind: "private",
      profile: {
        discordUserId: String(json.profile.discordUserId ?? ""),
        username: String(json.profile.username ?? ""),
        globalName: String(json.profile.globalName ?? ""),
        avatarHash: String(json.profile.avatarHash ?? ""),
      },
    };
  }
  return { kind: "public", profile: normalizeProfile(json.profile) };
}

export async function rpcUpsertDiscordProfile(
  env: EngineTransportEnv,
  input: {
    discordUserId: string;
    username: string;
    globalName?: string | null;
    avatarHash?: string | null;
  },
): Promise<void> {
  await profileCall<{ success?: boolean }>(env, "UpsertDiscordProfile", {
    discordUserId: input.discordUserId,
    username: input.username,
    globalName: input.globalName ?? "",
    avatarHash: input.avatarHash ?? "",
  });
}

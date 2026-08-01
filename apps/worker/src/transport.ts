import { createClient, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  GuildSettingsService,
  IdentityService,
  MatchmakingService,
  StatsService,
  TournamentService,
  UserSettingsService,
} from "@parley/proto";
import { resolveEngineTransport, type EngineTransportEnv } from "#/engine-transport";

export type { EngineTransportEnv } from "#/engine-transport";

const clientCache = new Map<string, unknown>();

/**
 * Request-body fields that carry the Discord user the interaction
 * verified. Mirrored into the acting-user header so the engine can
 * authorize against a caller identity it did not receive from an
 * attacker-controlled body alone.
 */
const ACTING_USER_FIELDS = [
  "discordUserId",
  "createdByDiscordUserId",
  "cancelledByDiscordUserId",
  "captainDiscordUserId",
  "reportedByDiscordUserId",
  "updatedByDiscordUserId",
] as const;

export const ACTING_USER_HEADER = "X-Parley-Acting-Discord-User-Id";

const actingUserInterceptor: Interceptor = (next) => async (req) => {
  const message = req.message as Record<string, unknown>;
  let acting: string | undefined;
  for (const field of ACTING_USER_FIELDS) {
    const value = message[field];
    if (typeof value === "string" && value.trim() !== "") {
      acting = value.trim();
      break;
    }
  }
  // UpsertUserSettings nests the target id inside `settings`.
  if (acting === undefined) {
    const settings = message["settings"];
    if (settings !== null && typeof settings === "object") {
      const value = (settings as Record<string, unknown>)["discordUserId"];
      if (typeof value === "string" && value.trim() !== "") {
        acting = value.trim();
      }
    }
  }
  if (acting !== undefined) {
    req.header.set(ACTING_USER_HEADER, acting);
  }
  return next(req);
};

/**
 * Wraps a fetch implementation to force `redirect: "follow"`.
 *
 * `@connectrpc/connect-web@2.1.1` hardcodes `redirect: "error"` in the
 * request init (see `fetchOptions` in `connect-transport.js`) and merges it
 * with `Object.assign`, so callers cannot override it via the transport
 * options. Cloudflare Workers' `fetch` rejects `"error"` because the
 * runtime only supports `"follow"` and `"manual"`. The wrapper rewrites
 * the init after connect-web has already constructed it.
 */
function withFollowRedirect(fetchImpl: typeof fetch): typeof fetch {
  return ((input, init) => {
    const nextInit: RequestInit = { ...init, redirect: "follow" };
    return fetchImpl(input, nextInit);
  }) as typeof fetch;
}

export { withFollowRedirect };

function getOrCreateClient(service: { typeName: string }, env: EngineTransportEnv): unknown {
  const { baseUrl, cacheKey, fetchImpl } = resolveEngineTransport(env);
  const key = `${service.typeName}:${cacheKey}`;
  const cached = clientCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const transport = createConnectTransport({
    baseUrl,
    fetch: withFollowRedirect(fetchImpl as typeof fetch),
    jsonOptions: { enumAsInteger: true },
    interceptors: [actingUserInterceptor],
  });
  const client = createClient(service as never, transport);
  clientCache.set(key, client);
  return client;
}

export function getIdentityClient(env: EngineTransportEnv) {
  return getOrCreateClient(IdentityService, env);
}

export function getGuildSettingsClient(env: EngineTransportEnv) {
  return getOrCreateClient(GuildSettingsService, env);
}

export function getMatchmakingClient(env: EngineTransportEnv) {
  return getOrCreateClient(MatchmakingService, env);
}

export function getStatsClient(env: EngineTransportEnv) {
  return getOrCreateClient(StatsService, env);
}

export function getTournamentClient(env: EngineTransportEnv) {
  return getOrCreateClient(TournamentService, env);
}

export function getUserSettingsClient(env: EngineTransportEnv) {
  return getOrCreateClient(UserSettingsService, env);
}

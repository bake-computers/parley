import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  GuildSettingsService,
  IdentityService,
  MatchmakingService,
  StatsService,
  UserSettingsService,
} from "@parley/proto";
import { resolveEngineTransport, type EngineTransportEnv } from "./engine-transport.js";

export type { EngineTransportEnv } from "./engine-transport.js";

const clientCache = new Map<string, unknown>();

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

export function getUserSettingsClient(env: EngineTransportEnv) {
  return getOrCreateClient(UserSettingsService, env);
}

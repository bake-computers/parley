import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { GuildSettingsService, IdentityService, MatchmakingService } from "@parley/proto";
import { resolveEngineTransport, type EngineTransportEnv } from "./engine-transport.js";

export type { EngineTransportEnv } from "./engine-transport.js";

const clientCache = new Map<string, unknown>();

function getOrCreateClient(service: { typeName: string }, env: EngineTransportEnv): unknown {
  const { baseUrl, cacheKey, fetchImpl } = resolveEngineTransport(env);
  const key = `${service.typeName}:${cacheKey}`;
  const cached = clientCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const transport = createConnectTransport({
    baseUrl,
    fetch: fetchImpl as typeof fetch,
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

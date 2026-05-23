import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { IdentityService } from "@parley/proto/identity/v1/identity_connect.js";
import { GuildSettingsService } from "@parley/proto/guild/v1/guild_connect.js";

const clientCache = new Map<string, unknown>();

export function getIdentityClient(baseUrl: string) {
  const key = `${IdentityService.typeName}:${baseUrl}`;
  const cached = clientCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const transport = createConnectTransport({
    baseUrl,
    jsonOptions: { enumAsInteger: true },
  });
  const client = createClient(IdentityService as never, transport);
  clientCache.set(key, client);
  return client;
}

export function getGuildSettingsClient(baseUrl: string) {
  const key = `${GuildSettingsService.typeName}:${baseUrl}`;
  const cached = clientCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const transport = createConnectTransport({
    baseUrl,
    jsonOptions: { enumAsInteger: true },
  });
  const client = createClient(GuildSettingsService as never, transport);
  clientCache.set(key, client);
  return client;
}
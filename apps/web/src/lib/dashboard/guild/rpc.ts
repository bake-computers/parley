import type { EngineTransportEnv } from "../../engine/transport.js";
import { resolveEngineTransport } from "../../engine/transport.js";
import type { GuildMatchmakingRulesJson, GuildMatchQuotaJson, GuildSettingsJson } from "./types.js";

type RpcError = { code?: string; message?: string };

async function engineCall<T>(
  env: EngineTransportEnv,
  path: string,
  body: unknown,
  actingUserId?: string,
): Promise<T> {
  const { baseUrl, fetchImpl } = resolveEngineTransport(env);
  const url = new URL(path, baseUrl).href;
  const headers: Record<string, string> = { "content-type": "application/json" };
  // The engine authorizes writes against this verified session identity.
  if (actingUserId) {
    headers["x-parley-acting-discord-user-id"] = actingUserId;
  }
  const res = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: RpcError };
  if (!res.ok) {
    const msg = json.error?.message ?? `Engine ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

const SVC = "/parley.guild.v1.GuildSettingsService";

export async function rpcGetGuildSettings(env: EngineTransportEnv, guildId: string, game: number) {
  return engineCall<{
    success: boolean;
    settings?: GuildSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/GetGuildSettings`, { guildId, game });
}

export async function rpcUpsertGuildSettings(
  env: EngineTransportEnv,
  settings: GuildSettingsJson,
  actingUserId: string,
) {
  return engineCall<{
    success: boolean;
    settings?: GuildSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertGuildSettings`, { settings }, actingUserId);
}

export async function rpcGetMatchmakingRules(
  env: EngineTransportEnv,
  guildId: string,
  game: number,
) {
  return engineCall<{
    success: boolean;
    rules?: GuildMatchmakingRulesJson;
    error?: RpcError;
  }>(env, `${SVC}/GetMatchmakingRules`, { guildId, game });
}

export async function rpcUpsertMatchmakingRules(
  env: EngineTransportEnv,
  rules: GuildMatchmakingRulesJson,
  actingUserId: string,
) {
  return engineCall<{
    success: boolean;
    rules?: GuildMatchmakingRulesJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertMatchmakingRules`, { rules }, actingUserId);
}

export async function rpcGetMatchQuotas(env: EngineTransportEnv, guildId: string, game: number) {
  return engineCall<{
    success: boolean;
    quota?: GuildMatchQuotaJson;
    error?: RpcError;
  }>(env, `${SVC}/GetMatchQuotas`, { guildId, game });
}

export async function rpcUpsertMatchQuotas(
  env: EngineTransportEnv,
  quota: GuildMatchQuotaJson,
  actingUserId: string,
) {
  return engineCall<{
    success: boolean;
    quota?: GuildMatchQuotaJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertMatchQuotas`, { quota }, actingUserId);
}

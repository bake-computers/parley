import type { EngineTransportEnv, RpcError } from "../../engine/transport.js";
import { readEngineResponse, resolveEngineTransport } from "../../engine/transport.js";
import type { GuildMatchmakingRulesJson, GuildMatchQuotaJson, GuildSettingsJson } from "./types.js";

async function engineCall<T>(env: EngineTransportEnv, path: string, body: unknown): Promise<T> {
  const { baseUrl, fetchImpl } = resolveEngineTransport(env);
  const url = new URL(path, baseUrl).href;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readEngineResponse<T>(res);
}

const SVC = "/parley.guild.v1.GuildSettingsService";

export async function rpcGetGuildSettings(env: EngineTransportEnv, guildId: string, game: number) {
  return engineCall<{
    success: boolean;
    settings?: GuildSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/GetGuildSettings`, { guildId, game });
}

export async function rpcUpsertGuildSettings(env: EngineTransportEnv, settings: GuildSettingsJson) {
  return engineCall<{
    success: boolean;
    settings?: GuildSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertGuildSettings`, { settings });
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
) {
  return engineCall<{
    success: boolean;
    rules?: GuildMatchmakingRulesJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertMatchmakingRules`, { rules });
}

export async function rpcGetMatchQuotas(env: EngineTransportEnv, guildId: string, game: number) {
  return engineCall<{
    success: boolean;
    quota?: GuildMatchQuotaJson;
    error?: RpcError;
  }>(env, `${SVC}/GetMatchQuotas`, { guildId, game });
}

export async function rpcUpsertMatchQuotas(env: EngineTransportEnv, quota: GuildMatchQuotaJson) {
  return engineCall<{
    success: boolean;
    quota?: GuildMatchQuotaJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertMatchQuotas`, { quota });
}

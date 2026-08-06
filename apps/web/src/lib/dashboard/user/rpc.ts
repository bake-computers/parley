import type { EngineTransportEnv, RpcError } from "../../engine/transport.js";
import { readEngineResponse, resolveEngineTransport } from "../../engine/transport.js";
import type { UserSettingsJson } from "./types.js";

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

const SVC = "/parley.user.v1.UserSettingsService";

export async function rpcGetUserSettings(env: EngineTransportEnv, discordUserId: string) {
  return engineCall<{
    success: boolean;
    settings?: UserSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/GetUserSettings`, { discordUserId });
}

export async function rpcUpsertUserSettings(env: EngineTransportEnv, settings: UserSettingsJson) {
  return engineCall<{
    success: boolean;
    settings?: UserSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertUserSettings`, { settings });
}

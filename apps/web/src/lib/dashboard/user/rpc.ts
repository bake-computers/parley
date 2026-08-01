import type { EngineTransportEnv } from "../../engine/transport.js";
import { resolveEngineTransport } from "../../engine/transport.js";
import type { UserSettingsJson } from "./types.js";

type RpcError = { code?: string; message?: string };

async function engineCall<T>(
  env: EngineTransportEnv,
  path: string,
  body: unknown,
  actingUserId: string,
): Promise<T> {
  const { baseUrl, fetchImpl } = resolveEngineTransport(env);
  const url = new URL(path, baseUrl).href;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The engine authorizes against this verified session identity.
      "x-parley-acting-discord-user-id": actingUserId,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: RpcError };
  if (!res.ok) {
    const msg = json.error?.message ?? `Engine ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

const SVC = "/parley.user.v1.UserSettingsService";

export async function rpcGetUserSettings(env: EngineTransportEnv, discordUserId: string) {
  return engineCall<{
    success: boolean;
    settings?: UserSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/GetUserSettings`, { discordUserId }, discordUserId);
}

export async function rpcUpsertUserSettings(env: EngineTransportEnv, settings: UserSettingsJson) {
  return engineCall<{
    success: boolean;
    settings?: UserSettingsJson;
    error?: RpcError;
  }>(env, `${SVC}/UpsertUserSettings`, { settings }, settings.discordUserId);
}

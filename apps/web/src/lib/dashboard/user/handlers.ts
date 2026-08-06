import type { OAuthEnvSource } from "../../discord/env.js";
import { requireDashboardSession } from "../auth.js";
import type { EngineEnvSource } from "../../engine/env.js";
import { engineEnvFromCloudflare } from "../../engine/env.js";
import { rpcGetUserSettings, rpcUpsertUserSettings } from "./rpc.js";
import type { UserSettingsJson } from "./types.js";

function engineFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Engine request failed";
  return Response.json({ error: message }, { status: 502 });
}

export function normalizeUserSettings(settings: UserSettingsJson): UserSettingsJson {
  return {
    ...settings,
    matchmakingEnabled: settings.matchmakingEnabled ?? true,
    profilePublic: settings.profilePublic ?? true,
    updatedAtMs: settings.updatedAtMs ?? 0,
  };
}

function parseUserSettings(userId: string, payload: unknown): UserSettingsJson | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  return {
    discordUserId: userId,
    updatedAtMs: 0,
    matchmakingEnabled: Boolean(p.matchmakingEnabled ?? true),
    profilePublic: Boolean(p.profilePublic ?? true),
  };
}

export async function handleGetUserSettings(
  request: Request,
  oauthEnv: OAuthEnvSource,
  engineSource: EngineEnvSource,
): Promise<Response> {
  const auth = await requireDashboardSession(request, oauthEnv);
  if (auth instanceof Response) {
    return auth;
  }

  const env = engineEnvFromCloudflare(engineSource);
  const userId = auth.session.user.id;

  try {
    const res = await rpcGetUserSettings(env, userId);
    if (!res.success || !res.settings) {
      return Response.json(
        { error: res.error?.message ?? "Could not load user settings" },
        { status: 502 },
      );
    }
    return Response.json(
      { settings: normalizeUserSettings(res.settings) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return engineFailure(e);
  }
}

export async function handlePatchUserSettings(
  request: Request,
  oauthEnv: OAuthEnvSource,
  engineSource: EngineEnvSource,
): Promise<Response> {
  const auth = await requireDashboardSession(request, oauthEnv);
  if (auth instanceof Response) {
    return auth;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const payload = record?.settings ?? record;
  const userId = auth.session.user.id;
  const settings = parseUserSettings(userId, payload);
  if (!settings) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const env = engineEnvFromCloudflare(engineSource);
  try {
    const res = await rpcUpsertUserSettings(env, settings);
    if (!res.success || !res.settings) {
      return Response.json({ error: res.error?.message ?? "Update failed" }, { status: 502 });
    }
    return Response.json({ settings: normalizeUserSettings(res.settings) });
  } catch (e) {
    return engineFailure(e);
  }
}

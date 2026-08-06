import type { OAuthEnvSource } from "../../discord/env.js";
import { requireDashboardSession, sessionCanManageGuild, type DashboardSession } from "../auth.js";
import type { EngineEnvSource } from "../../engine/env.js";
import { engineEnvFromCloudflare } from "../../engine/env.js";
import {
  rpcGetGuildSettings,
  rpcGetMatchmakingRules,
  rpcGetMatchQuotas,
  rpcUpsertGuildSettings,
  rpcUpsertMatchmakingRules,
  rpcUpsertMatchQuotas,
} from "./rpc.js";
import type {
  GuildMatchmakingRulesJson,
  GuildMatchQuotaJson,
  GuildSettingsBundleJson,
  GuildSettingsJson,
  SettingsSection,
} from "./types.js";
import { GAME_R6 } from "./types.js";

function guildIdFromUrl(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/dashboard\/guilds\/([^/]+)\/settings/);
  return match?.[1] ?? null;
}

async function authorizeGuild(
  request: Request,
  oauthEnv: OAuthEnvSource,
  guildId: string,
): Promise<{ session: DashboardSession } | Response> {
  const auth = await requireDashboardSession(request, oauthEnv);
  if (auth instanceof Response) {
    return auth;
  }
  if (!(await sessionCanManageGuild(auth.session, guildId))) {
    return Response.json(
      {
        error:
          "You do not have permission to manage this server (Manage Server / Administrator), or Discord did not return this guild for your session. Sign out and sign in again.",
      },
      { status: 403 },
    );
  }
  return auth;
}

function engineFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Engine request failed";
  return Response.json({ error: message }, { status: 502 });
}

export async function handleGetGuildSettingsBundle(
  request: Request,
  oauthEnv: OAuthEnvSource,
  engineSource: EngineEnvSource,
): Promise<Response> {
  const guildId = guildIdFromUrl(request);
  if (!guildId) {
    return Response.json({ error: "invalid_guild" }, { status: 400 });
  }

  const auth = await authorizeGuild(request, oauthEnv, guildId);
  if (auth instanceof Response) {
    return auth;
  }

  const env = engineEnvFromCloudflare(engineSource);
  const game = GAME_R6;

  try {
    const [generalRes, rulesRes, quotaRes] = await Promise.all([
      rpcGetGuildSettings(env, guildId, game),
      rpcGetMatchmakingRules(env, guildId, game),
      rpcGetMatchQuotas(env, guildId, game),
    ]);

    if (!generalRes.success || !generalRes.settings) {
      return Response.json(
        { error: generalRes.error?.message ?? "Could not load guild settings" },
        { status: 502 },
      );
    }
    if (!rulesRes.success || !rulesRes.rules) {
      return Response.json(
        { error: rulesRes.error?.message ?? "Could not load matchmaking rules" },
        { status: 502 },
      );
    }
    if (!quotaRes.success || !quotaRes.quota) {
      return Response.json(
        { error: quotaRes.error?.message ?? "Could not load match quotas" },
        { status: 502 },
      );
    }

    const bundle: GuildSettingsBundleJson = {
      general: normalizeGeneral(generalRes.settings),
      matchmakingRules: normalizeRules(rulesRes.rules),
      matchQuota: quotaRes.quota,
    };

    return Response.json(bundle, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return engineFailure(e);
  }
}

function sectionFromBody(body: unknown): { section: SettingsSection; payload: unknown } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const section = record.section;
  if (section !== "general" && section !== "matchmakingRules" && section !== "matchQuota") {
    return null;
  }
  return { section, payload: record.payload };
}

function parseGeneral(guildId: string, userId: string, payload: unknown): GuildSettingsJson | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  return {
    guildId,
    game: GAME_R6,
    defaultTeamFormat: String(p.defaultTeamFormat ?? "5v5"),
    autoBalance: Boolean(p.autoBalance),
    crossGuildMatchmaking: Boolean(p.crossGuildMatchmaking),
    updatedAtMs: 0,
    updatedByDiscordUserId: userId,
    matchmakingEnabled: Boolean(p.matchmakingEnabled),
  };
}

function normalizeGeneral(settings: GuildSettingsJson): GuildSettingsJson {
  return {
    ...settings,
    defaultTeamFormat: settings.defaultTeamFormat || "5v5",
    matchmakingEnabled: settings.matchmakingEnabled ?? false,
    autoBalance: settings.autoBalance ?? false,
    crossGuildMatchmaking: settings.crossGuildMatchmaking ?? false,
  };
}

function normalizeRules(rules: GuildMatchmakingRulesJson): GuildMatchmakingRulesJson {
  return {
    ...rules,
    platforms: Array.isArray(rules.platforms) ? rules.platforms : [],
  };
}

function parseRules(guildId: string, payload: unknown): GuildMatchmakingRulesJson | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const platforms = Array.isArray(p.platforms)
    ? p.platforms.filter((x): x is string => typeof x === "string")
    : [];
  return {
    guildId,
    game: GAME_R6,
    minElo: Number(p.minElo ?? 0),
    maxElo: Number(p.maxElo ?? 0),
    platforms,
    requireVerified: Boolean(p.requireVerified),
    maxEloGap: Number(p.maxEloGap ?? 0),
    updatedAtMs: 0,
  };
}

function parseQuota(guildId: string, userId: string, payload: unknown): GuildMatchQuotaJson | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  return {
    guildId,
    game: GAME_R6,
    dailyMatchLimit: Number(p.dailyMatchLimit ?? 0),
    updatedByDiscordUserId: userId,
    updatedAtMs: 0,
  };
}

export async function handlePatchGuildSettingsBundle(
  request: Request,
  oauthEnv: OAuthEnvSource,
  engineSource: EngineEnvSource,
): Promise<Response> {
  const guildId = guildIdFromUrl(request);
  if (!guildId) {
    return Response.json({ error: "invalid_guild" }, { status: 400 });
  }

  const auth = await authorizeGuild(request, oauthEnv, guildId);
  if (auth instanceof Response) {
    return auth;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = sectionFromBody(body);
  if (!parsed) {
    return Response.json({ error: "invalid_section" }, { status: 400 });
  }

  const env = engineEnvFromCloudflare(engineSource);
  const userId = auth.session.user.id;

  try {
    switch (parsed.section) {
      case "general": {
        const settings = parseGeneral(guildId, userId, parsed.payload);
        if (!settings) {
          return Response.json({ error: "invalid_payload" }, { status: 400 });
        }
        const res = await rpcUpsertGuildSettings(env, settings);
        if (!res.success || !res.settings) {
          return Response.json({ error: res.error?.message ?? "Update failed" }, { status: 502 });
        }
        return Response.json({ general: normalizeGeneral(res.settings) });
      }
      case "matchmakingRules": {
        const rules = parseRules(guildId, parsed.payload);
        if (!rules) {
          return Response.json({ error: "invalid_payload" }, { status: 400 });
        }
        const res = await rpcUpsertMatchmakingRules(env, rules);
        if (!res.success || !res.rules) {
          return Response.json({ error: res.error?.message ?? "Update failed" }, { status: 502 });
        }
        return Response.json({ matchmakingRules: normalizeRules(res.rules) });
      }
      case "matchQuota": {
        const quota = parseQuota(guildId, userId, parsed.payload);
        if (!quota) {
          return Response.json({ error: "invalid_payload" }, { status: 400 });
        }
        const res = await rpcUpsertMatchQuotas(env, quota);
        if (!res.success || !res.quota) {
          return Response.json({ error: res.error?.message ?? "Update failed" }, { status: 502 });
        }
        return Response.json({ matchQuota: res.quota });
      }
      default:
        return Response.json({ error: "invalid_section" }, { status: 400 });
    }
  } catch (e) {
    return engineFailure(e);
  }
}

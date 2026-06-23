import type { CookieSession } from "../discord/oauth.js";
import { SESSION_COOKIE, unsealSession } from "../discord/oauth.js";
import type { OAuthEnvSource } from "../discord/env.js";
import { oauthEnvFromSource } from "../discord/env.js";

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("Cookie");
  if (!raw) {
    return null;
  }
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export type DashboardSession = {
  user: CookieSession["user"];
  guilds: CookieSession["guilds"];
  expiresAtMs: number;
};

export async function requireDashboardSession(
  request: Request,
  envSource: OAuthEnvSource,
): Promise<{ session: DashboardSession } | Response> {
  const cfg = oauthEnvFromSource(envSource);
  if (!cfg) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const raw = cookieValue(request, SESSION_COOKIE);
  if (!raw) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const session = await unsealSession(raw, cfg.AUTH_SECRET);
  if (!session || session.expiresAtMs <= Date.now()) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return { session };
}

export function sessionCanManageGuild(session: DashboardSession, guildId: string): boolean {
  return session.guilds.some((g) => g.id === guildId);
}
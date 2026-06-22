import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { OAuthEnvSource } from "./src/lib/discord-oauth-env.js";
import type { EngineEnvSource } from "./src/lib/engine-env.js";

function parseDevVars(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadLocalOAuthEnv(landingRoot: string): OAuthEnvSource {
  const fromFile = parseDevVars(path.join(landingRoot, ".dev.vars"));
  return {
    DISCORD_APPLICATION_ID:
      process.env.DISCORD_APPLICATION_ID ??
      fromFile.DISCORD_APPLICATION_ID ??
      "1495122091165618358",
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET ?? fromFile.DISCORD_CLIENT_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET ?? fromFile.AUTH_SECRET,
    DISCORD_OAUTH_REDIRECT_ORIGIN:
      process.env.DISCORD_OAUTH_REDIRECT_ORIGIN ?? fromFile.DISCORD_OAUTH_REDIRECT_ORIGIN,
  };
}

function loadLocalEngineEnv(landingRoot: string): EngineEnvSource {
  const fromFile = parseDevVars(path.join(landingRoot, ".dev.vars"));
  const useLocal =
    process.env.USE_LOCAL_ENGINE ?? fromFile.USE_LOCAL_ENGINE ?? "1";
  const base =
    process.env.ENGINE_SERVICE_URL ??
    fromFile.ENGINE_SERVICE_URL ??
    "http://127.0.0.1:50051";
  return {
    USE_LOCAL_ENGINE: useLocal,
    ENGINE_SERVICE_URL: base,
    ENGINE_INTERNAL_URL:
      process.env.ENGINE_INTERNAL_URL ?? fromFile.ENGINE_INTERNAL_URL ?? base,
  };
}

const DASHBOARD_GUILD_SETTINGS_RE = /^\/api\/dashboard\/guilds\/[^/]+\/settings$/;
const DASHBOARD_USER_SETTINGS_RE = /^\/api\/dashboard\/user\/settings$/;

async function sendNodeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      const existing = res.getHeader("Set-Cookie");
      if (existing === undefined) {
        res.setHeader("Set-Cookie", value);
      } else if (Array.isArray(existing)) {
        res.setHeader("Set-Cookie", [...existing, value]);
      } else {
        res.setHeader("Set-Cookie", [String(existing), value]);
      }
      return;
    }
    res.setHeader(key, value);
  });
  if (response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
    return;
  }
  res.end();
}

export function devDiscordAuthPlugin(): Plugin {
  const landingRoot = path.dirname(fileURLToPath(import.meta.url));
  let oauthEnv: OAuthEnvSource = {};
  let engineEnv: EngineEnvSource = {};

  return {
    name: "parley-dev-discord-auth",
    configureServer(server) {
      oauthEnv = loadLocalOAuthEnv(landingRoot);
      engineEnv = loadLocalEngineEnv(landingRoot);

      server.middlewares.use(async (req, res, next) => {
        const method = req.method ?? "GET";
        if (method !== "GET" && method !== "POST" && method !== "PATCH") {
          next();
          return;
        }

        const url = req.url ?? "/";
        const pathname = url.split("?")[0] ?? "/";
        const isAuth =
          pathname === "/auth/discord" ||
          pathname === "/auth/discord/" ||
          pathname === "/auth/discord/callback" ||
          pathname === "/auth/logout" ||
          pathname === "/api/auth/me";
        const isDashboardGuildSettings = DASHBOARD_GUILD_SETTINGS_RE.test(pathname);
        const isDashboardUserSettings = DASHBOARD_USER_SETTINGS_RE.test(pathname);

        if (!isAuth && !isDashboardGuildSettings && !isDashboardUserSettings) {
          next();
          return;
        }

        const host = req.headers.host ?? "localhost:3000";
        const init: RequestInit = {
          method,
          headers: req.headers as HeadersInit,
        };
        if (method === "PATCH" || method === "POST") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          if (chunks.length > 0) {
            init.body = Buffer.concat(chunks);
          }
        }

        const request = new Request(`http://${host}${url}`, init);

        if (isDashboardGuildSettings) {
          const {
            handleGetGuildSettingsBundle,
            handlePatchGuildSettingsBundle,
          } = await import("./src/lib/guild-settings-handlers.js");
          const response =
            method === "PATCH"
              ? await handlePatchGuildSettingsBundle(request, oauthEnv, engineEnv)
              : await handleGetGuildSettingsBundle(request, oauthEnv, engineEnv);
          await sendNodeResponse(res, response);
          return;
        }

        if (isDashboardUserSettings) {
          const { handleGetUserSettings, handlePatchUserSettings } = await import(
            "./src/lib/user-settings-handlers.js"
          );
          const response =
            method === "PATCH"
              ? await handlePatchUserSettings(request, oauthEnv, engineEnv)
              : await handleGetUserSettings(request, oauthEnv, engineEnv);
          await sendNodeResponse(res, response);
          return;
        }

        const {
          handleDiscordLogin,
          handleDiscordCallback,
          handleDiscordLogout,
          handleDiscordMe,
        } = await import("./src/lib/discord-oauth-handlers.js");

        let response: Response;
        if (pathname === "/auth/discord" || pathname === "/auth/discord/") {
          response = await handleDiscordLogin(request, oauthEnv);
        } else if (pathname === "/auth/discord/callback") {
          response = await handleDiscordCallback(request, oauthEnv);
        } else if (pathname === "/auth/logout") {
          response = await handleDiscordLogout(request);
        } else {
          response = await handleDiscordMe(request, oauthEnv);
        }

        await sendNodeResponse(res, response);
      });
    },
  };
}
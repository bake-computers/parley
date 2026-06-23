import {
  buildDiscordAuthorizeUrl,
  clearSessionCookieHeader,
  clearStateCookieHeader,
  discordRedirectUri,
  exchangeDiscordCode,
  fetchDiscordGuilds,
  fetchDiscordUser,
  cookieGuildsFromOAuth,
  sealOAuthState,
  sealSession,
  sessionCookieHeader,
  stateCookieHeader,
  unsealOAuthState,
  unsealSession,
  STATE_COOKIE,
  SESSION_COOKIE,
  toPublicSession,
  type DiscordOAuthEnv,
  type DiscordOAuthGuild,
  type DiscordUser,
} from "./oauth.js";
import { oauthEnvFromSource, type OAuthEnvSource } from "./env.js";
import { filterManageableGuilds } from "./permissions.js";

function readOAuthEnv(source: OAuthEnvSource | undefined): DiscordOAuthEnv | null {
  if (!source) {
    return null;
  }
  return oauthEnvFromSource(source);
}

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

function safeRedirectPath(request: Request): string {
  const url = new URL(request.url);
  const next = url.searchParams.get("redirect");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/dashboard";
}

export async function handleDiscordLogin(
  request: Request,
  envSource: OAuthEnvSource,
): Promise<Response> {
  const cfg = readOAuthEnv(envSource);
  if (!cfg) {
    return new Response("Discord OAuth is not configured", { status: 503 });
  }

  const redirectTo = safeRedirectPath(request);
  const redirectUri = discordRedirectUri(request.url, cfg.DISCORD_OAUTH_REDIRECT_ORIGIN);
  const state = await sealOAuthState(
    { nonce: crypto.randomUUID(), redirectTo, redirectUri },
    cfg.AUTH_SECRET,
  );
  const authorize = buildDiscordAuthorizeUrl({
    clientId: cfg.DISCORD_APPLICATION_ID,
    redirectUri,
    state,
  });

  const headers = new Headers({ Location: authorize });
  headers.append("Set-Cookie", stateCookieHeader(state, request.url));
  return new Response(null, { status: 302, headers });
}

export async function handleDiscordCallback(
  request: Request,
  envSource: OAuthEnvSource,
): Promise<Response> {
  try {
    return await handleDiscordCallbackImpl(request, envSource);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OAuth callback failed";
    return new Response(message, { status: 502 });
  }
}

async function handleDiscordCallbackImpl(
  request: Request,
  envSource: OAuthEnvSource,
): Promise<Response> {
  const cfg = readOAuthEnv(envSource);
  if (!cfg) {
    return new Response("Discord OAuth is not configured", { status: 503 });
  }

  const existingSession = cookieValue(request, SESSION_COOKIE);
  if (existingSession && (await unsealSession(existingSession, cfg.AUTH_SECRET))) {
    const headers = new Headers({ Location: "/dashboard" });
    headers.append("Set-Cookie", clearStateCookieHeader(request.url));
    return new Response(null, { status: 302, headers });
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Discord authorization denied: ${error}`, { status: 400 });
  }

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (!code || !stateParam) {
    return new Response("Invalid OAuth callback (missing code or state)", { status: 400 });
  }

  const statePayload = await unsealOAuthState(stateParam, cfg.AUTH_SECRET);
  if (!statePayload) {
    return new Response("Invalid or expired OAuth state — start again from /auth/discord", {
      status: 400,
    });
  }

  const stateCookie = cookieValue(request, STATE_COOKIE);
  if (stateCookie && stateCookie !== stateParam) {
    return new Response("Invalid OAuth callback (state mismatch)", { status: 400 });
  }

  let token: { access_token: string; expires_in: number };
  try {
    token = await exchangeDiscordCode({
      clientId: cfg.DISCORD_APPLICATION_ID,
      clientSecret: cfg.DISCORD_CLIENT_SECRET,
      code,
      redirectUri: statePayload.redirectUri,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "token exchange failed";
    return new Response(message, { status: 502 });
  }

  let user: DiscordUser;
  let guilds: DiscordOAuthGuild[];
  try {
    [user, guilds] = await Promise.all([
      fetchDiscordUser(token.access_token),
      fetchDiscordGuilds(token.access_token),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Discord API failed";
    return new Response(message, { status: 502 });
  }

  const manageable = filterManageableGuilds(guilds);
  const expiresAtMs = Date.now() + token.expires_in * 1000;
  const sessionToken = await sealSession(
    { user, guilds: cookieGuildsFromOAuth(manageable), expiresAtMs },
    cfg.AUTH_SECRET,
  );

  const headers = new Headers({
    Location: statePayload.redirectTo,
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", sessionCookieHeader(sessionToken, token.expires_in, request.url));
  headers.append("Set-Cookie", clearStateCookieHeader(request.url));
  return new Response(null, { status: 302, headers });
}

export async function handleDiscordLogout(request: Request): Promise<Response> {
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", clearSessionCookieHeader(request.url));
  return new Response(null, { status: 302, headers });
}

export async function handleDiscordMe(
  request: Request,
  envSource: OAuthEnvSource,
): Promise<Response> {
  const cfg = readOAuthEnv(envSource);
  if (!cfg) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const raw = cookieValue(request, SESSION_COOKIE);
  if (!raw) {
    return Response.json({ user: null }, { status: 401 });
  }

  const session = await unsealSession(raw, cfg.AUTH_SECRET);
  if (!session) {
    return Response.json({ user: null }, { status: 401 });
  }

  return Response.json(toPublicSession(session));
}
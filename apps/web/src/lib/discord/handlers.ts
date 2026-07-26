import {
  buildDiscordAuthorizeUrl,
  clearSessionCookieHeader,
  clearStateCookieHeader,
  discordRedirectUri,
  exchangeDiscordCode,
  cookieGuildsFromOAuth,
  fetchDiscordGuilds,
  fetchDiscordUser,
  primeSessionGuildsCache,
  resolveSessionGuilds,
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
  type DiscordUser,
} from "./oauth.js";
import { primeBotGuildsCache } from "./bot.js";
import { oauthEnvFromSource, resolveBotToken, type OAuthEnvSource } from "./env.js";
import { publicGuildsForDashboard } from "./guild-dashboard.js";
import { turnstileEnabled, verifyTurnstileToken } from "../turnstile.js";

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

function loginPageUrl(redirectTo: string, error?: string): string {
  const params = new URLSearchParams({ redirect: redirectTo });
  if (error) {
    params.set("error", error);
  }
  return `/auth/login?${params}`;
}

async function parseDiscordLoginRequest(request: Request): Promise<{
  redirectTo: string;
  turnstileToken: string | null;
}> {
  let redirectTo = safeRedirectPath(request);
  let turnstileToken: string | null = null;

  if (request.method === "POST") {
    const form = await request.formData();
    const next = form.get("redirect");
    if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) {
      redirectTo = next;
    }
    const token = form.get("cf-turnstile-response");
    if (typeof token === "string" && token.length > 0) {
      turnstileToken = token;
    }
  }

  return { redirectTo, turnstileToken };
}

export async function handleDiscordLogin(
  request: Request,
  envSource: OAuthEnvSource,
): Promise<Response> {
  const cfg = readOAuthEnv(envSource);
  if (!cfg) {
    return new Response("Discord OAuth is not configured", { status: 503 });
  }

  const useTurnstile = turnstileEnabled(
    envSource.TURNSTILE_SITE_KEY,
    envSource.TURNSTILE_SECRET_KEY,
  );
  const { redirectTo, turnstileToken } = await parseDiscordLoginRequest(request);

  if (useTurnstile) {
    if (request.method !== "POST") {
      return Response.redirect(loginPageUrl(redirectTo), 302);
    }
    if (
      !turnstileToken ||
      !(await verifyTurnstileToken(
        envSource.TURNSTILE_SECRET_KEY!,
        turnstileToken,
        request.headers.get("CF-Connecting-IP") ?? undefined,
      ))
    ) {
      return Response.redirect(loginPageUrl(redirectTo, "turnstile"), 302);
    }
  }
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
    return new Response("Invalid or expired OAuth state. Start again from /auth/discord", {
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
  let oauthGuilds: Awaited<ReturnType<typeof fetchDiscordGuilds>> | null = null;
  try {
    // Parallel: user, guild list, bot membership — so first /api/auth/me is warm.
    const botToken = resolveBotToken(envSource);
    const [u, guildsResult] = await Promise.all([
      fetchDiscordUser(token.access_token),
      fetchDiscordGuilds(token.access_token).then(
        (g) => g,
        () => null,
      ),
      botToken
        ? primeBotGuildsCache(botToken).then(
            () => null,
            () => null,
          )
        : Promise.resolve(null),
    ]);
    user = u;
    oauthGuilds = guildsResult;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Discord API failed";
    return new Response(message, { status: 502 });
  }

  if (oauthGuilds) {
    await primeSessionGuildsCache(user.id, cookieGuildsFromOAuth(oauthGuilds));
  }

  const expiresAtMs = Date.now() + token.expires_in * 1000;
  const sessionToken = await sealSession(
    { user, accessToken: token.access_token, expiresAtMs },
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

  const cookieGuilds = await resolveSessionGuilds(session);
  let guilds;
  try {
    guilds = await publicGuildsForDashboard(
      cookieGuilds,
      cfg.DISCORD_APPLICATION_ID,
      resolveBotToken(envSource),
    );
  } catch {
    guilds = await publicGuildsForDashboard(cookieGuilds, cfg.DISCORD_APPLICATION_ID);
  }
  return Response.json(toPublicSession(session, guilds), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

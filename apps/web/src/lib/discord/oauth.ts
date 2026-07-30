import {
  cacheGetJson,
  cachePutJson,
  USER_GUILDS_TTL_SEC,
  userGuildsCacheKey,
} from "./discord-cache.js";

export const DISCORD_OAUTH_SCOPES = ["identify", "guilds"] as const;

const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";
const DISCORD_API = "https://discord.com/api";

export type DiscordOAuthEnv = {
  DISCORD_APPLICATION_ID: string;
  DISCORD_CLIENT_SECRET: string;
  AUTH_SECRET: string;
  DISCORD_OAUTH_REDIRECT_ORIGIN?: string;
};

export type DiscordUser = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  discriminator: string;
};

export type DiscordOAuthGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

export type CookieGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

export type CookieSession = {
  user: DiscordUser;
  /** Fresh guild list is fetched from Discord when present (keeps the session cookie small). */
  accessToken?: string;
  /** Legacy sessions stored guilds in the cookie before accessToken was added. */
  guilds?: CookieGuild[];
  expiresAtMs: number;
};

export type OAuthStatePayload = {
  nonce: string;
  redirectTo: string;
  redirectUri: string;
};

export function oauthCallbackOrigin(requestUrl: string, overrideOrigin?: string): string {
  if (overrideOrigin) {
    return overrideOrigin.replace(/\/$/, "");
  }
  return new URL(requestUrl).origin;
}

export function discordRedirectUri(requestUrl: string, overrideOrigin?: string): string {
  return `${oauthCallbackOrigin(requestUrl, overrideOrigin)}/auth/discord/callback`;
}

export function buildDiscordAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(DISCORD_AUTHORIZE);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DISCORD_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeDiscordCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ access_token: string; expires_in: number; token_type: string }> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  let res: Response;
  try {
    res = await fetch(DISCORD_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    const hint = e instanceof Error ? e.message : "network error";
    throw new Error(
      `Discord token request failed (${hint}). If this is local Vite dev, outbound fetch from Miniflare can fail; try again or test on a deployed worker.`, { cause: e },
    );
  }

  if (!res.ok) {
    const text = await res.text();
    let hint = "";
    if (text.includes("invalid_grant")) {
      hint =
        " Common causes: redirect_uri must match authorize exactly (use one host: localhost OR 127.0.0.1), code already used (do not refresh callback; start fresh from /auth/discord), or wrong client secret.";
    }
    throw new Error(
      `Discord token exchange failed (${res.status}): ${text}.${hint} redirect_uri sent: ${params.redirectUri}`,
    );
  }

  return (await res.json()) as { access_token: string; expires_in: number; token_type: string };
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord @me failed (${res.status})`);
  }
  return (await res.json()) as DiscordUser;
}

export async function fetchDiscordGuilds(accessToken: string): Promise<DiscordOAuthGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord guilds failed (${res.status})`);
  }
  return (await res.json()) as DiscordOAuthGuild[];
}

/** Retry only on network / 5xx — not on 401/403. */
async function fetchDiscordGuildsResilient(accessToken: string): Promise<DiscordOAuthGuild[]> {
  try {
    return await fetchDiscordGuilds(accessToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("(401)") || msg.includes("(403)") || msg.includes("(400)")) {
      throw e;
    }
    return await fetchDiscordGuilds(accessToken);
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCodePoint(b);
  }
  return btoa(binary).replaceAll(/\+/g, "-").replaceAll(/\//g, "_").replaceAll(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll(/-/g, "+").replaceAll(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.codePointAt(i);
  }
  return out;
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function hmacVerify(message: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = base64UrlToBytes(signature);
  const sigBuffer = new Uint8Array(sigBytes.byteLength);
  sigBuffer.set(sigBytes);
  return crypto.subtle.verify("HMAC", key, sigBuffer, new TextEncoder().encode(message));
}

export async function sealOAuthState(payload: OAuthStatePayload, secret: string): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(body, secret);
  return `${sig}.${body}`;
}

export async function unsealOAuthState(
  token: string,
  secret: string,
): Promise<OAuthStatePayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) {
    return null;
  }
  const sig = token.slice(0, dot);
  const body = token.slice(dot + 1);
  if (!(await hmacVerify(body, sig, secret))) {
    return null;
  }
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(body));
    const parsed = JSON.parse(json) as Partial<OAuthStatePayload>;
    if (typeof parsed.nonce !== "string" || typeof parsed.redirectTo !== "string") {
      return null;
    }
    if (!parsed.redirectTo.startsWith("/") || parsed.redirectTo.startsWith("//")) {
      return null;
    }
    if (
      typeof parsed.redirectUri !== "string" ||
      !parsed.redirectUri.endsWith("/auth/discord/callback")
    ) {
      return null;
    }
    return {
      nonce: parsed.nonce,
      redirectTo: parsed.redirectTo,
      redirectUri: parsed.redirectUri,
    };
  } catch {
    return null;
  }
}

export async function sealSession(session: CookieSession, secret: string): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  const sig = await hmacSign(body, secret);
  return `${sig}.${body}`;
}

export async function unsealSession(token: string, secret: string): Promise<CookieSession | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) {
    return null;
  }
  const sig = token.slice(0, dot);
  const body = token.slice(dot + 1);
  if (!(await hmacVerify(body, sig, secret))) {
    return null;
  }
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(body));
    const parsed = JSON.parse(json) as CookieSession;
    if (!parsed.user?.id || typeof parsed.expiresAtMs !== "number") {
      return null;
    }
    if (Date.now() >= parsed.expiresAtMs) {
      return null;
    }
    if (Array.isArray(parsed.guilds)) {
      parsed.guilds = normalizeCookieGuilds(parsed.guilds);
    }
    return parsed;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "parley_discord_session";
export const STATE_COOKIE = "parley_discord_oauth_state";

export function cookieUsesSecure(requestUrl: string): boolean {
  return new URL(requestUrl).protocol === "https:";
}

function appendCookieFlags(parts: string[], requestUrl: string): void {
  parts.push("Path=/", "HttpOnly", "SameSite=Lax");
  if (cookieUsesSecure(requestUrl)) {
    parts.push("Secure");
  }
}

export function sessionCookieHeader(
  value: string,
  maxAgeSeconds: number,
  requestUrl: string,
): string {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, `Max-Age=${maxAgeSeconds}`];
  appendCookieFlags(parts, requestUrl);
  return parts.join("; ");
}

export function clearSessionCookieHeader(requestUrl: string): string {
  const parts = [`${SESSION_COOKIE}=`, "Max-Age=0"];
  appendCookieFlags(parts, requestUrl);
  return parts.join("; ");
}

export function stateCookieHeader(value: string, requestUrl: string): string {
  const parts = [`${STATE_COOKIE}=${encodeURIComponent(value)}`, "Max-Age=600"];
  appendCookieFlags(parts, requestUrl);
  return parts.join("; ");
}

export function clearStateCookieHeader(requestUrl: string): string {
  const parts = [`${STATE_COOKIE}=`, "Max-Age=0"];
  appendCookieFlags(parts, requestUrl);
  return parts.join("; ");
}

export function toPublicSession(session: CookieSession, guilds: PublicGuild[]) {
  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      globalName: session.user.global_name,
      avatar: session.user.avatar,
    },
    guilds,
    expiresAtMs: session.expiresAtMs,
  };
}

function normalizeCookieGuilds(guilds: CookieGuild[]): CookieGuild[] {
  return guilds.map((g) => ({
    ...g,
    // Missing/invalid permissions fail closed to "0" (no access). Defaulting to a
    // manage bit here would offer "Add Parley" on servers the user cannot manage.
    permissions: typeof g.permissions === "string" ? g.permissions : "0",
  }));
}

const userGuildsInflight = new Map<string, Promise<CookieGuild[]>>();

/** Warm the guild list cache (e.g. right after OAuth login). */
export async function primeSessionGuildsCache(
  userId: string,
  guilds: CookieGuild[],
): Promise<void> {
  await cachePutJson(
    userGuildsCacheKey(userId),
    normalizeCookieGuilds(guilds),
    USER_GUILDS_TTL_SEC,
  );
}

export async function resolveSessionGuilds(session: CookieSession): Promise<CookieGuild[]> {
  if (!session.accessToken) {
    return normalizeCookieGuilds(session.guilds ?? []);
  }

  const userId = session.user.id;
  const cacheKey = userGuildsCacheKey(userId);
  const cached = await cacheGetJson<CookieGuild[]>(cacheKey);
  if (cached) {
    return normalizeCookieGuilds(cached);
  }

  const pending = userGuildsInflight.get(userId);
  if (pending) {
    return pending;
  }

  const load = (async (): Promise<CookieGuild[]> => {
    try {
      const guilds = cookieGuildsFromOAuth(await fetchDiscordGuildsResilient(session.accessToken!));
      await cachePutJson(cacheKey, guilds, USER_GUILDS_TTL_SEC);
      return guilds;
    } catch {
      if (session.guilds?.length) {
        return normalizeCookieGuilds(session.guilds);
      }
      return [];
    } finally {
      userGuildsInflight.delete(userId);
    }
  })();

  userGuildsInflight.set(userId, load);
  return load;
}

export function cookieGuildsFromOAuth(guilds: DiscordOAuthGuild[]): CookieGuild[] {
  return guilds
    .map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      owner: g.owner,
      permissions: g.permissions,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

export type PublicGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  canManage: boolean;
  parleyInstalled: boolean;
  inviteUrl: string | null;
};

export function discordGuildIconUrl(guildId: string, icon: string | null): string | null {
  if (!icon) {
    return null;
  }
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=64`;
}

export function discordAvatarUrl(userId: string, avatar: string | null): string {
  if (avatar) {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`;
  }
  const index = Number(BigInt(userId) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { cacheClearMemoryForTests } from "./discord-cache.js";
import { canManageCookieGuild } from "./permissions.js";
import {
  buildDiscordAuthorizeUrl,
  cookieUsesSecure,
  clearSignedInCookieHeader,
  DISCORD_OAUTH_SCOPES,
  discordAvatarUrl,
  discordGuildIconUrl,
  primeSessionGuildsCache,
  resolveSessionGuilds,
  sealOAuthState,
  sealSession,
  signedInCookieHeader,
  stateCookieHeader,
  unsealOAuthState,
  unsealSession,
  type CookieSession,
} from "./oauth.js";

const REDIRECT = "http://localhost:3000/auth/discord/callback";

describe("discord oauth", () => {
  test("authorize URL uses identify and guilds scopes", () => {
    const url = buildDiscordAuthorizeUrl({
      clientId: "123",
      redirectUri: "https://parley.bot/auth/discord/callback",
      state: "abc",
    });
    expect(url).toContain("scope=identify+guilds");
    expect(DISCORD_OAUTH_SCOPES).toEqual(["identify", "guilds"]);
  });

  test("seal and unseal oauth state includes redirectUri", async () => {
    const secret = "test-secret-at-least-32-chars-long!!";
    const token = await sealOAuthState(
      { nonce: "n1", redirectTo: "/dashboard", redirectUri: REDIRECT },
      secret,
    );
    const parsed = await unsealOAuthState(token, secret);
    expect(parsed).toEqual({ nonce: "n1", redirectTo: "/dashboard", redirectUri: REDIRECT });
    expect(await unsealOAuthState(token, "wrong-secret-at-least-32-chars!!")).toBeNull();
  });

  test("state cookie is not Secure on http localhost", () => {
    expect(cookieUsesSecure("http://localhost:3000/auth/discord")).toBe(false);
    expect(stateCookieHeader("a.b", "http://localhost:3000/x")).not.toContain("Secure");
    expect(stateCookieHeader("a.b", "https://parley.bot/x")).toContain("Secure");
  });

  test("signed-in presence cookie is never HttpOnly and mirrors Secure", () => {
    const http = signedInCookieHeader(600, "http://localhost:3000/x");
    expect(http).toBe("parley_signed_in=1; Max-Age=600; Path=/; SameSite=Lax");
    expect(http).not.toContain("HttpOnly");

    const https = signedInCookieHeader(600, "https://parley.bot/x");
    expect(https).toContain("Secure");
    expect(https).not.toContain("HttpOnly");

    const cleared = clearSignedInCookieHeader("https://parley.bot/x");
    expect(cleared).toContain("parley_signed_in=");
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).not.toContain("HttpOnly");
  });

  test("avatar and guild icon URLs use webp/gif by hash with size param", () => {
    expect(discordAvatarUrl("1", "abc123", 64)).toBe(
      "https://cdn.discordapp.com/avatars/1/abc123.webp?size=64",
    );
    expect(discordAvatarUrl("1", "abc123")).toBe(
      "https://cdn.discordapp.com/avatars/1/abc123.webp?size=128",
    );
    // Animated hashes keep the gif so the animation plays.
    expect(discordAvatarUrl("1", "a_abc123")).toBe(
      "https://cdn.discordapp.com/avatars/1/a_abc123.gif?size=128",
    );
    expect(discordAvatarUrl("1", null)).toBe("https://cdn.discordapp.com/embed/avatars/1.png");
    expect(discordGuildIconUrl("9", "iconhash", 128)).toBe(
      "https://cdn.discordapp.com/icons/9/iconhash.webp?size=128",
    );
    expect(discordGuildIconUrl("9", null)).toBeNull();
  });

  test("seal and unseal session respects expiry", async () => {
    const secret = "test-secret-at-least-32-chars-long!!";
    const session: CookieSession = {
      user: {
        id: "1",
        username: "u",
        global_name: null,
        avatar: null,
        discriminator: "0",
      },
      guilds: [{ id: "99", name: "Test", icon: null, owner: true, permissions: "8" }],
      expiresAtMs: Date.now() + 60_000,
    };
    const token = await sealSession(session, secret);
    expect(await unsealSession(token, secret)).toMatchObject({
      user: { id: "1" },
      guilds: [{ id: "99", name: "Test" }],
    });

    const expired = await sealSession({ ...session, expiresAtMs: Date.now() - 1 }, secret);
    expect(await unsealSession(expired, secret)).toBeNull();
  });

  test("guild with missing permissions fails closed (no manage access)", async () => {
    const secret = "test-secret-at-least-32-chars-long!!";
    // Simulate a legacy/partial guild payload where permissions was never populated.
    const session = {
      user: {
        id: "1",
        username: "u",
        global_name: null,
        avatar: null,
        discriminator: "0",
      },
      guilds: [{ id: "99", name: "NoPerms", icon: null, owner: false }],
      expiresAtMs: Date.now() + 60_000,
    } as unknown as CookieSession;

    const token = await sealSession(session, secret);
    const unsealed = await unsealSession(token, secret);
    expect(unsealed?.guilds?.[0]?.permissions).toBe("0");
    expect(canManageCookieGuild(unsealed!.guilds![0])).toBe(false);
  });
});

describe("resolveSessionGuilds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cacheClearMemoryForTests();
  });

  test("falls back to legacy cookie guilds when Discord API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );

    const session: CookieSession = {
      user: {
        id: "1",
        username: "u",
        global_name: null,
        avatar: null,
        discriminator: "0",
      },
      accessToken: "expired-token",
      guilds: [{ id: "99", name: "Legacy", icon: null, owner: true, permissions: "8" }],
      expiresAtMs: Date.now() + 60_000,
    };

    const guilds = await resolveSessionGuilds(session);
    expect(guilds).toEqual([
      { id: "99", name: "Legacy", icon: null, owner: true, permissions: "8" },
    ]);
  });

  test("serves primed cache without hitting Discord", async () => {
    const fetchMock = vi.fn(async () => new Response("should-not-call", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await primeSessionGuildsCache("user-1", [
      { id: "g1", name: "Cached", icon: null, owner: true, permissions: "8" },
    ]);

    const session: CookieSession = {
      user: {
        id: "user-1",
        username: "u",
        global_name: null,
        avatar: null,
        discriminator: "0",
      },
      accessToken: "tok",
      expiresAtMs: Date.now() + 60_000,
    };

    const guilds = await resolveSessionGuilds(session);
    expect(guilds).toEqual([
      { id: "g1", name: "Cached", icon: null, owner: true, permissions: "8" },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not retry on 401", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const session: CookieSession = {
      user: {
        id: "user-401",
        username: "u",
        global_name: null,
        avatar: null,
        discriminator: "0",
      },
      accessToken: "bad",
      expiresAtMs: Date.now() + 60_000,
    };

    await expect(resolveSessionGuilds(session)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

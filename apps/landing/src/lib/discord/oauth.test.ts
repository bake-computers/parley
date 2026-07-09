import { afterEach, describe, expect, test, vi } from "vitest";
import { cacheClearMemoryForTests } from "./discord-cache.js";
import {
  buildDiscordAuthorizeUrl,
  cookieUsesSecure,
  DISCORD_OAUTH_SCOPES,
  primeSessionGuildsCache,
  resolveSessionGuilds,
  sealOAuthState,
  sealSession,
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

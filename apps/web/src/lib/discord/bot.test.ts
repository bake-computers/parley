import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  botInstalledGuildIds,
  buildBotInviteUrl,
  fetchBotGuildIds,
  fetchGuildMembers,
  PARLEY_BOT_PERMISSIONS,
} from "./bot.js";
import { cacheClearMemoryForTests } from "./discord-cache.js";

describe("discord bot invite", () => {
  test("builds guild-scoped invite URL", () => {
    const url = buildBotInviteUrl("123456789", "987654321");
    expect(url).toContain("client_id=123456789");
    expect(url).toContain(`permissions=${PARLEY_BOT_PERMISSIONS}`);
    expect(url).toContain("scope=bot+applications.commands");
    expect(url).toContain("guild_id=987654321");
    expect(url).toContain("disable_guild_select=true");
  });
});

describe("botInstalledGuildIds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cacheClearMemoryForTests();
  });

  test("uses bot guild list (one call) instead of per-guild probes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/users/@me/guilds")) {
        return new Response(JSON.stringify([{ id: "g1" }, { id: "g3" }]), { status: 200 });
      }
      return new Response("{}", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const installed = await botInstalledGuildIds("bot-token", ["g1", "g2", "g3"]);
    expect([...installed].sort()).toEqual(["g1", "g3"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/users/@me/guilds");
  });

  test("falls back to per-guild probes when list endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/users/@me/guilds")) {
          return new Response("nope", { status: 500 });
        }
        if (url.endsWith("/users/@me")) {
          return new Response(JSON.stringify({ id: "bot-user" }), { status: 200 });
        }
        if (url.includes("/guilds/g1")) {
          return new Response("{}", { status: 200 });
        }
        if (url.includes("/guilds/g2")) {
          return new Response("{}", { status: 404 });
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const installed = await botInstalledGuildIds("bot-token", ["g1", "g2"]);
    expect([...installed]).toEqual(["g1"]);
  });

  test("second call hits memory cache (no extra Discord fetch)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/users/@me/guilds")) {
        return new Response(JSON.stringify([{ id: "g1" }]), { status: 200 });
      }
      return new Response("{}", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await botInstalledGuildIds("bot-token", ["g1"]);
    await botInstalledGuildIds("bot-token", ["g1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchGuildMembers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("maps discord display names and avatars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              nick: null,
              user: {
                id: "111",
                username: "plain",
                global_name: "Pretty Name",
                avatar: "abcd",
                bot: false,
              },
            },
            {
              user: { id: "222", username: "botty", bot: true },
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchGuildMembers("bot-token", "guild-1")).resolves.toEqual([
      {
        id: "111",
        name: "Pretty Name",
        avatarUrl: "https://cdn.discordapp.com/avatars/111/abcd.png?size=128",
      },
    ]);
  });
});

describe("fetchBotGuildIds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("paginates with after cursor", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `g${i}` }));
    const page2 = [{ id: "g200" }];
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls++;
        const url = String(input);
        if (url.includes("after=")) {
          return new Response(JSON.stringify(page2), { status: 200 });
        }
        return new Response(JSON.stringify(page1), { status: 200 });
      }),
    );

    const ids = await fetchBotGuildIds("bot-token");
    expect(ids).toHaveLength(201);
    expect(ids[200]).toBe("g200");
    expect(calls).toBe(2);
  });
});

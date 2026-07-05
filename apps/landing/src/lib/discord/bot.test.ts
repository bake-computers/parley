import { afterEach, describe, expect, test, vi } from "vitest";
import { botInstalledGuildIds, buildBotInviteUrl, PARLEY_BOT_PERMISSIONS } from "./bot.js";

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
  });

  test("marks guilds where bot lookup succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
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

  test("does not clear all guilds when one lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/users/@me")) {
          return new Response(JSON.stringify({ id: "bot-user" }), { status: 200 });
        }
        if (url.includes("/guilds/good")) {
          return new Response("{}", { status: 200 });
        }
        if (url.includes("/guilds/bad")) {
          throw new Error("network");
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const installed = await botInstalledGuildIds("bot-token", ["good", "bad"]);
    expect([...installed]).toEqual(["good"]);
  });
});

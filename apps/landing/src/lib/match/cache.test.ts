import { describe, expect, test, vi } from "vitest";
import { cacheMatchHtml, fetchMatchFromCacheOrBridge, normalizeMatchData } from "./cache.js";

function createMockEnv(options: { cachedValue?: unknown; bridgeResponse?: Response } = {}) {
  const kvStore = new Map<string, unknown>();
  if (options.cachedValue !== undefined) {
    kvStore.set("match:html:test-uuid", options.cachedValue);
  }

  const kvGet = vi.fn(async (key: string) => kvStore.get(key) ?? null);
  const kvPut = vi.fn(async (key: string, value: string) => {
    kvStore.set(key, value);
  });
  const bridgeFetch = vi.fn(
    async () => options.bridgeResponse ?? new Response(null, { status: 404 }),
  );

  const env = {
    MATCH_KV: { get: kvGet, put: kvPut },
    BRIDGE: { fetch: bridgeFetch },
  } as unknown as Cloudflare.Env;

  return { env, kvGet, kvPut, bridgeFetch };
}

describe("fetchMatchFromCacheOrBridge", () => {
  test("returns cached data from KV when available", async () => {
    const cachedData = { id: 1, guildId: "test-guild", participants: [] };
    const { env, kvGet, bridgeFetch } = createMockEnv({ cachedValue: cachedData });

    const result = await fetchMatchFromCacheOrBridge(env, "test-guild", "test-uuid");

    expect(result).toEqual(normalizeMatchData(cachedData));
    expect(kvGet).toHaveBeenCalledWith("match:html:test-uuid", "json");
    expect(bridgeFetch).not.toHaveBeenCalled();
  });

  test("falls back to bridge when KV returns null", async () => {
    const bridgeData = { id: 2, guildId: "test-guild", participants: [] };
    const bridgeResponse = new Response(JSON.stringify(bridgeData), { status: 200 });
    const { env, bridgeFetch } = createMockEnv({ bridgeResponse });

    const result = await fetchMatchFromCacheOrBridge(env, "test-guild", "test-uuid");

    expect(result).toEqual(normalizeMatchData(bridgeData));
    expect(bridgeFetch).toHaveBeenCalledWith("https://internal/match/test-guild/test-uuid");
  });

  test("returns null when bridge returns 404", async () => {
    const bridgeResponse = new Response(null, { status: 404 });
    const { env } = createMockEnv({ bridgeResponse });

    const result = await fetchMatchFromCacheOrBridge(env, "test-guild", "test-uuid");

    expect(result).toBeNull();
  });
});

describe("normalizeMatchData", () => {
  test("defaults missing participants to an empty array", () => {
    const result = normalizeMatchData({ id: 1, guildId: "g1", publicUuid: "u1" });
    expect(result?.participants).toEqual([]);
  });

  test("reads snake_case bridge fields", () => {
    const result = normalizeMatchData({
      id: 2,
      guild_id: "g2",
      public_uuid: "u2",
      created_at_ms: 1700000000000,
      participants: [
        {
          discord_user_id: "d1",
          player_id: 9,
          username: "Ace",
          team: "team_a",
          cpr: 1200,
        },
      ],
    });
    expect(result).toMatchObject({
      guildId: "g2",
      publicUuid: "u2",
      createdAtMs: 1700000000000,
      participants: [
        expect.objectContaining({
          discordUserId: "d1",
          username: "Ace",
          team: "team_a",
        }),
      ],
    });
  });
});

describe("cacheMatchHtml", () => {
  test("writes HTML to KV with correct key and 1-hour TTL", async () => {
    const { env, kvPut } = createMockEnv();

    await cacheMatchHtml(env, "test-uuid", "<html>match content</html>");

    expect(kvPut).toHaveBeenCalledWith("match:html:test-uuid", "<html>match content</html>", {
      expirationTtl: 3600,
    });
  });
});

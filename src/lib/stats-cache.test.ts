import { describe, expect, test } from "bun:test";
import { readStatsCache } from "./stats-cache";

describe("stats cache", () => {
  test("rejects invalid envelopes", async () => {
    const cache = {
      get: async () => JSON.stringify({ version: 999, cachedAt: 0, username: "" }),
    } as unknown as KVNamespace;

    await expect(readStatsCache(cache, "stats:v1:auto:bad")).resolves.toBeNull();
  });
});

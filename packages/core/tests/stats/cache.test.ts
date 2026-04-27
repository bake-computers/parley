import { describe, expect, test } from "bun:test";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  buildStatsCacheKey,
  readGlobalSeasonCatalog,
  readPlayerSeasonCatalog,
  readStatsCache,
  writeGlobalSeasonCatalog,
  writePlayerSeasonCatalog,
} from "../../src/stats/cache";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe("stats cache", () => {
  test("buildStatsCacheKey includes season selector", () => {
    expect(buildStatsCacheKey("Player", "pc")).toBe("stats:v2:pc:player:latest");
    expect(buildStatsCacheKey("Player", "pc", "Deep Freeze")).toBe(
      "stats:v2:pc:player:deep-freeze",
    );
    expect(buildStatsCacheKey("Player", "pc", "deep-freeze")).toBe(
      "stats:v2:pc:player:deep-freeze",
    );
  });

  test("player and global season catalogs roundtrip", async () => {
    const cache = new FakeKV();
    const catalog = [
      { slug: "deep-freeze", display: "Deep Freeze", startedAt: "2024-12-01T00:00:00.000Z" },
      { slug: "new-blood", display: "New Blood", startedAt: "2025-06-01T00:00:00.000Z" },
    ];

    await writePlayerSeasonCatalog(cache as unknown as KVNamespace, "Player", "pc", catalog);
    await writeGlobalSeasonCatalog(cache as unknown as KVNamespace, catalog);

    await expect(
      readPlayerSeasonCatalog(cache as unknown as KVNamespace, "Player", "pc"),
    ).resolves.toEqual([
      { slug: "new-blood", display: "New Blood", startedAt: "2025-06-01T00:00:00.000Z" },
      { slug: "deep-freeze", display: "Deep Freeze", startedAt: "2024-12-01T00:00:00.000Z" },
    ]);
    await expect(readGlobalSeasonCatalog(cache as unknown as KVNamespace)).resolves.toEqual([
      { slug: "new-blood", display: "New Blood", startedAt: "2025-06-01T00:00:00.000Z" },
      { slug: "deep-freeze", display: "Deep Freeze", startedAt: "2024-12-01T00:00:00.000Z" },
    ]);
  });

  test("rejects invalid catalog payloads", async () => {
    const cache = new FakeKV();
    await cache.put(
      "stats:season-catalog:v1:player:pc:player",
      JSON.stringify({
        version: 1,
        entries: [{ slug: "", display: "Broken", startedAt: "" }],
      }),
    );

    await expect(
      readPlayerSeasonCatalog(cache as unknown as KVNamespace, "Player", "pc"),
    ).resolves.toBeNull();
  });

  test("rejects invalid envelopes", async () => {
    const cache = new FakeKV();
    await cache.put(
      "stats:v2:auto:bad:latest",
      JSON.stringify({ version: 999, cachedAt: 0, username: "" }),
    );

    await expect(
      readStatsCache(cache as unknown as KVNamespace, "stats:v2:auto:bad:latest"),
    ).resolves.toBeNull();
  });
});

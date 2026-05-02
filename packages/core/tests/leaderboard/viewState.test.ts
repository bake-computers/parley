import { describe, expect, test } from "bun:test";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  readLeaderboardViewState,
  writeLeaderboardViewState,
} from "../../src/leaderboard/viewState";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe("leaderboard view state", () => {
  test("writes and reads valid state", async () => {
    const cache = new FakeKV();

    await writeLeaderboardViewState(cache as unknown as KVNamespace, "interaction-1", {
      scope: "global",
      guildId: "guild-1",
      platform: "pc",
      minMatches: 10,
    });

    await expect(
      readLeaderboardViewState(cache as unknown as KVNamespace, "interaction-1"),
    ).resolves.toEqual({
      scope: "global",
      guildId: "guild-1",
      platform: "pc",
      minMatches: 10,
    });
  });

  test("returns null for invalid payloads", async () => {
    const cache = new FakeKV();
    await cache.put(
      "leaderboard:view-state:v1:interaction-2",
      JSON.stringify({
        scope: "global",
        guildId: "",
        platform: "pc",
        minMatches: 10,
      }),
    );

    await expect(
      readLeaderboardViewState(cache as unknown as KVNamespace, "interaction-2"),
    ).resolves.toBeNull();
  });

  test("handles missing cache gracefully", async () => {
    await expect(readLeaderboardViewState(undefined, "interaction-3")).resolves.toBeNull();
  });
});

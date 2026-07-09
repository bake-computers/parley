import { describe, expect, test } from "bun:test";
import { hashEntries, shouldBroadcast } from "#/hash.js";

describe("hash", () => {
  test("hashEntries is stable for identical payloads", async () => {
    const entries = [
      { rank: 1, playerId: "alpha", score: 4200 },
      { rank: 2, playerId: "bravo", score: 4100 },
    ];
    const first = await hashEntries(entries);
    const second = await hashEntries(entries);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  test("shouldBroadcast only fires when hash changes", () => {
    expect(shouldBroadcast("abc", "abc", false)).toBe(false);
    expect(shouldBroadcast("abc", "def", false)).toBe(true);
    expect(shouldBroadcast("", "def", true)).toBe(true);
  });
});

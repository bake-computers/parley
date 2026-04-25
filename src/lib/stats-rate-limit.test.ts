import { describe, expect, test } from "bun:test";
import {
  buildExecutorDailyKey,
  buildTrackedPlayerDailyKey,
  checkTrackedPlayerDailyCap,
  consumeExecutorDailyQuota,
  formatDiscordRetryAt,
} from "./stats-rate-limit";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const FIXED_NOW = Date.parse("2026-04-25T20:00:00.000Z");

describe("stats rate limit", () => {
  test("tracked-player cap checks all concrete platforms for auto lookups", async () => {
    const cache = new FakeKV();
    const pcDailyKey = buildTrackedPlayerDailyKey("Player", "pc", FIXED_NOW);
    await cache.put(pcDailyKey, "1");

    const result = await checkTrackedPlayerDailyCap(
      cache as unknown as KVNamespace,
      "Player",
      "auto",
      FIXED_NOW,
    );

    expect(result.isLimited).toBe(true);
    expect(result.key).toBe(pcDailyKey);
  });

  test("executor quota allows three refresh-triggering requests then caps", async () => {
    const cache = new FakeKV();
    const executorId = "123";

    const first = await consumeExecutorDailyQuota(
      cache as unknown as KVNamespace,
      executorId,
      FIXED_NOW,
    );
    const second = await consumeExecutorDailyQuota(
      cache as unknown as KVNamespace,
      executorId,
      FIXED_NOW,
    );
    const third = await consumeExecutorDailyQuota(
      cache as unknown as KVNamespace,
      executorId,
      FIXED_NOW,
    );
    const fourth = await consumeExecutorDailyQuota(
      cache as unknown as KVNamespace,
      executorId,
      FIXED_NOW,
    );

    expect(first.isLimited).toBe(false);
    expect(first.remaining).toBe(2);
    expect(second.isLimited).toBe(false);
    expect(second.remaining).toBe(1);
    expect(third.isLimited).toBe(false);
    expect(third.remaining).toBe(0);
    expect(fourth.isLimited).toBe(true);
    expect(fourth.remaining).toBe(0);
    expect(cache.values.get(buildExecutorDailyKey(executorId, FIXED_NOW))).toBe("3");
  });

  test("retry time formatter renders Discord absolute and relative timestamps", () => {
    expect(formatDiscordRetryAt(1_744_800_000)).toBe("<t:1744800000:F> (<t:1744800000:R>)");
  });
});

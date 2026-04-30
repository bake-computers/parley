import { describe, expect, test } from "bun:test";
import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCommandCooldownKey, consumeCommandCooldown } from "../../src/lib/commandCooldown";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe("command cooldown", () => {
  test("first use succeeds and writes the cooldown key", async () => {
    const cache = new FakeKV();
    const nowMs = Date.parse("2026-04-30T12:00:00.000Z");

    const result = await consumeCommandCooldown(cache as unknown as KVNamespace, {
      commandKey: "queue.start",
      userId: "user-1",
      ownerId: "owner-1",
      cooldownSeconds: 10,
      nowMs,
    });

    expect(result.allowed).toBe(true);
    expect(result.bypassed).toBe(false);
    expect(cache.values.get(buildCommandCooldownKey("queue.start", "user-1"))).toBe(
      String(nowMs + 10_000),
    );
  });

  test("second use during the active window is blocked", async () => {
    const cache = new FakeKV();
    const nowMs = Date.parse("2026-04-30T12:00:00.000Z");

    await consumeCommandCooldown(cache as unknown as KVNamespace, {
      commandKey: "queue.start",
      userId: "user-1",
      ownerId: "owner-1",
      cooldownSeconds: 10,
      nowMs,
    });

    const result = await consumeCommandCooldown(cache as unknown as KVNamespace, {
      commandKey: "queue.start",
      userId: "user-1",
      ownerId: "owner-1",
      cooldownSeconds: 10,
      nowMs: nowMs + 2_000,
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAtMs).toBe(nowMs + 10_000);
  });

  test("owner bypass always succeeds without writing to cache", async () => {
    const cache = new FakeKV();
    const result = await consumeCommandCooldown(cache as unknown as KVNamespace, {
      commandKey: "tournament.cancel",
      userId: "owner-1",
      ownerId: "owner-1",
      cooldownSeconds: 30,
      nowMs: Date.parse("2026-04-30T12:00:00.000Z"),
    });

    expect(result.allowed).toBe(true);
    expect(result.bypassed).toBe(true);
    expect(cache.values.size).toBe(0);
  });

  test("blocked result returns a retry timestamp", async () => {
    const cache = new FakeKV();
    const nowMs = Date.parse("2026-04-30T12:00:00.000Z");

    await cache.put(buildCommandCooldownKey("help", "user-1"), String(nowMs + 3_000));

    const result = await consumeCommandCooldown(cache as unknown as KVNamespace, {
      commandKey: "help",
      userId: "user-1",
      ownerId: "owner-1",
      cooldownSeconds: 3,
      nowMs,
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAtUnix).toBe(Math.ceil((nowMs + 3_000) / 1000));
  });

  test("missing kv behaves as a no-op allow", async () => {
    const result = await consumeCommandCooldown(undefined, {
      commandKey: "stats",
      userId: "user-1",
      ownerId: "owner-1",
      cooldownSeconds: 5,
      nowMs: Date.parse("2026-04-30T12:00:00.000Z"),
    });

    expect(result.allowed).toBe(true);
    expect(result.bypassed).toBe(false);
  });
});

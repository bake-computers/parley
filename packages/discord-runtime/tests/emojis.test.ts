import { afterEach, describe, expect, test } from "bun:test";
import type { KVNamespace, KVNamespacePutOptions } from "@cloudflare/workers-types";
import { setLogSinkForTests } from "../src/logger";
import {
  formatApplicationEmoji,
  resolveApplicationEmojiCatalog,
  toComponentEmoji,
  type ApplicationEmojiCatalog,
} from "../src/emojis";

class FakeKV {
  readonly values = new Map<string, string>();
  readonly putCalls: Array<{ key: string; value: string; options?: KVNamespacePutOptions }> = [];
  shouldThrowOnGet = false;
  shouldThrowOnPut = false;

  async get(key: string): Promise<string | null> {
    if (this.shouldThrowOnGet) {
      throw new Error("get failed");
    }
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void> {
    if (this.shouldThrowOnPut) {
      throw new Error("put failed");
    }
    this.values.set(key, value);
    this.putCalls.push({ key, value, options });
  }
}

function catalogFixture(): ApplicationEmojiCatalog {
  return {
    search: {
      id: "123",
      name: "search",
      animated: false,
    },
    plus: {
      id: "456",
      name: "plus",
      animated: true,
    },
  };
}

describe("application emojis", () => {
  afterEach(() => {
    setLogSinkForTests(null);
  });

  test("KV hit returns cached catalog without fetch", async () => {
    const cache = new FakeKV();
    cache.values.set(
      "discord:application-emojis:v1",
      JSON.stringify({
        version: 1,
        fetchedAt: Date.now(),
        entries: catalogFixture(),
      }),
    );

    const fetcher = (async () => {
      throw new Error("fetch should not run");
    }) as unknown as typeof fetch;

    const result = await resolveApplicationEmojiCatalog({
      applicationId: "app",
      botToken: "token",
      cache: cache as unknown as KVNamespace,
      fetcher,
    });

    expect(result).toEqual(catalogFixture());
    expect(cache.putCalls).toHaveLength(0);
  });

  test("KV miss fetches from Discord and writes cache", async () => {
    const cache = new FakeKV();
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          items: [
            { id: "123", name: "search", animated: false, user: {}, roles: [] },
            { id: "456", name: "plus", animated: true, user: {}, roles: [] },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await resolveApplicationEmojiCatalog({
      applicationId: "app",
      botToken: "token",
      cache: cache as unknown as KVNamespace,
      fetcher,
      apiBaseUrl: "https://discord.test/api/v10",
    });

    expect(result).toEqual(catalogFixture());
    expect(cache.putCalls).toHaveLength(1);
    expect(cache.putCalls[0]?.key).toBe("discord:application-emojis:v1");
    expect(cache.putCalls[0]?.options).toEqual({ expirationTtl: 21_600 });
  });

  test("unknown emoji names from Discord are ignored", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          items: [
            { id: "123", name: "search", animated: false, user: {}, roles: [] },
            { id: "999", name: "not-supported", animated: false, user: {}, roles: [] },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await resolveApplicationEmojiCatalog({
      applicationId: "app",
      botToken: "token",
      fetcher,
      apiBaseUrl: "https://discord.test/api/v10",
    });

    expect(result).toEqual({
      search: {
        id: "123",
        name: "search",
        animated: false,
      },
    });
  });

  test("missing credentials returns empty catalog", async () => {
    await expect(
      resolveApplicationEmojiCatalog({
        applicationId: "app",
      }),
    ).resolves.toEqual({});

    await expect(
      resolveApplicationEmojiCatalog({
        botToken: "token",
      }),
    ).resolves.toEqual({});
  });

  test("formatApplicationEmoji handles static and animated emojis", () => {
    const catalog = catalogFixture();

    expect(formatApplicationEmoji(catalog, "search")).toBe("<:search:123>");
    expect(formatApplicationEmoji(catalog, "plus")).toBe("<a:plus:456>");
  });

  test("toComponentEmoji returns the correct component payload", () => {
    const catalog = catalogFixture();

    expect(toComponentEmoji(catalog, "search")).toEqual({
      id: "123",
      name: "search",
      animated: false,
    });
    expect(toComponentEmoji(catalog, "timer")).toBeNull();
  });
});

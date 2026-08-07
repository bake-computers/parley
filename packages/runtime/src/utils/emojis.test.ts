import type { KVNamespace } from "@cloudflare/workers-types";
import { describe, expect, test } from "bun:test";
import {
  formatApplicationEmoji,
  resolveApplicationEmojiCatalog,
  type ApplicationEmojiCatalog,
} from "./emojis.js";

const catalog: ApplicationEmojiCatalog = {
  world: {
    id: "1535013544775651529",
    name: "world",
    discordName: "world",
    animated: false,
  },
  rank_gold: {
    id: "1515457664409272431",
    name: "rank_gold",
    discordName: "gold",
    animated: false,
  },
};

function memoryCache(): KVNamespace {
  const values = new Map<string, string>();

  return {
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    put: (key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve();
    },
  } as unknown as KVNamespace;
}

describe("formatApplicationEmoji", () => {
  test("renders canonical emoji names", () => {
    expect(formatApplicationEmoji(catalog, "world")).toBe("<:world:1535013544775651529>");
  });

  test("renders aliased rank emojis with their Discord-side name", () => {
    expect(formatApplicationEmoji(catalog, "rank_gold")).toBe("<:gold:1515457664409272431>");
  });

  test("returns null when emoji is missing", () => {
    expect(formatApplicationEmoji(catalog, "rank_challenger")).toBeNull();
  });
});

describe("resolveApplicationEmojiCatalog", () => {
  test("caches a failed fetch to avoid retrying on every interaction", async () => {
    const cache = memoryCache();
    let requests = 0;
    const fetcher = (() => {
      requests += 1;
      return Promise.resolve(new Response('{"message":"401: Unauthorized"}', { status: 401 }));
    }) as unknown as typeof fetch;
    const input = {
      applicationId: "application-id",
      botToken: "bot-token",
      cache,
      fetcher,
    };

    await expect(resolveApplicationEmojiCatalog(input)).resolves.toEqual({});
    await expect(resolveApplicationEmojiCatalog(input)).resolves.toEqual({});

    expect(requests).toBe(1);
  });
});

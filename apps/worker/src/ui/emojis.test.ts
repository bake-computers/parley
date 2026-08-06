import type { ExecutionContext } from "@cloudflare/workers-types";
import type { DiscordRequestContext } from "@parley/runtime";
import { describe, expect, test } from "bun:test";
import { CalendarEmoji, RankGoldEmoji } from "#/ui/constants";
import { resolveEmojis } from "#/ui/emojis";
import { formatApplicationEmoji } from "@parley/runtime";

function context(): DiscordRequestContext {
  const values = new Map<string, unknown>();
  return {
    env: {},
    executionContext: {} as ExecutionContext,
    request: new Request("https://example.test/"),
    requestId: "test",
    waitUntil() {},
    get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    set<T>(key: string, value: T) {
      values.set(key, value);
    },
  };
}

describe("worker application emojis", () => {
  test("returns static Discord markup without a REST lookup", () => {
    const catalog = resolveEmojis({ context: context() });

    expect(formatApplicationEmoji(catalog, "calendar")).toBe(CalendarEmoji);
    expect(formatApplicationEmoji(catalog, "rank_gold")).toBe(RankGoldEmoji);
    expect(Object.keys(catalog)).toHaveLength(23);
  });
});

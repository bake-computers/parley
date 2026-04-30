import { describe, expect, test } from "bun:test";
import type { ExecutionContext } from "@cloudflare/workers-types";
import type { DiscordRequestContext } from "@parley/discord-runtime";
import {
  mergeInteractionAnalyticsContext,
  writeAnalyticsDataPoint,
  type InteractionAnalyticsFields,
} from "../src/analytics";
import { analyticsMiddleware } from "../src/analytics-middleware";
import type { WorkerRuntimeEnv } from "../src/env";

class FakeAnalyticsEngine {
  readonly points: AnalyticsEngineDataPoint[] = [];

  writeDataPoint(point?: AnalyticsEngineDataPoint): void {
    if (point) {
      this.points.push(point);
    }
  }
}

function createContext(
  env: Partial<WorkerRuntimeEnv> = {},
): DiscordRequestContext<WorkerRuntimeEnv> {
  const values = new Map<string, unknown>();
  return {
    env: env as WorkerRuntimeEnv,
    executionContext: {
      waitUntil() {},
      passThroughOnException() {},
      props: {},
      exports: {},
    } as unknown as ExecutionContext,
    request: new Request("https://example.com/interactions"),
    requestId: "request-1",
    waitUntil() {},
    get<T = unknown>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    set<T = unknown>(key: string, value: T): void {
      values.set(key, value);
    },
  };
}

function seedSlashMetadata(context: DiscordRequestContext<WorkerRuntimeEnv>): void {
  context.set("analytics.surface", "slash");
  context.set("analytics.name", "account");
  context.set("analytics.detail", "register");
  context.set("analytics.guildId", "guild-1");
  context.set("analytics.userId", "user-1");
  context.set("analytics.channelId", "channel-1");
  context.set("analytics.outcome", "ok");
  context.set("command", { deferred: true, replied: true });
}

describe("analytics writer", () => {
  test("no-ops when Analytics Engine is missing", () => {
    expect(() =>
      writeAnalyticsDataPoint(
        {},
        {
          source: "discord",
          surface: "slash",
          name: "ping",
        },
      ),
    ).not.toThrow();
  });

  test("writes fields in the shared schema order", () => {
    const analytics = new FakeAnalyticsEngine();

    writeAnalyticsDataPoint(
      { ANALYTICS_ENGINE: analytics as unknown as AnalyticsEngineDataset },
      {
        source: "discord",
        surface: "slash",
        name: "stats",
        detail: "",
        outcome: "ok",
        guildId: "guild-1",
        userId: "user-1",
        channelId: "channel-1",
        cacheState: "hit",
        extraState: "queued",
        durationMs: 42,
        itemCount: 1,
        successCount: 1,
        errorCount: 0,
        deferred: true,
        replied: true,
      },
    );

    expect(analytics.points).toHaveLength(1);
    expect(analytics.points[0]?.indexes).toEqual(["guild-1:slash:stats"]);
    expect(analytics.points[0]?.blobs).toEqual([
      "discord",
      "slash",
      "stats",
      "",
      "ok",
      "guild-1",
      "user-1",
      "channel-1",
      "hit",
      "queued",
    ]);
    expect(analytics.points[0]?.doubles).toEqual([42, 1, 1, 0, 1, 1]);
  });

  test("normalizes missing fields", () => {
    const analytics = new FakeAnalyticsEngine();

    writeAnalyticsDataPoint(
      { ANALYTICS_ENGINE: analytics as unknown as AnalyticsEngineDataset },
      {
        source: "worker",
        surface: "queue",
        name: "stats.refresh",
      },
    );

    expect(analytics.points[0]?.indexes).toEqual(["queue:stats.refresh"]);
    expect(analytics.points[0]?.blobs).toEqual([
      "worker",
      "queue",
      "stats.refresh",
      "",
      "ok",
      "dm",
      "",
      "",
      "none",
      "none",
    ]);
  });
});

describe("analytics middleware", () => {
  test("emits a slash command datapoint with subcommand detail and interaction flags", async () => {
    const analytics = new FakeAnalyticsEngine();
    const context = createContext({
      ANALYTICS_ENGINE: analytics as unknown as AnalyticsEngineDataset,
    });
    seedSlashMetadata(context);
    mergeInteractionAnalyticsContext(context, {
      cacheState: "hit",
      extraState: "queued",
    });

    await analyticsMiddleware(context, async () => undefined);

    expect(analytics.points).toHaveLength(1);
    expect(analytics.points[0]?.blobs?.slice(1, 5)).toEqual(["slash", "account", "register", "ok"]);
    expect(analytics.points[0]?.doubles?.slice(4)).toEqual([1, 1]);
  });

  test("emits autocomplete detail from runtime metadata", async () => {
    const analytics = new FakeAnalyticsEngine();
    const context = createContext({
      ANALYTICS_ENGINE: analytics as unknown as AnalyticsEngineDataset,
    });
    context.set("analytics.surface", "autocomplete");
    context.set("analytics.name", "stats");
    context.set("analytics.detail", "season");
    context.set("autocomplete", { responded: true });

    await analyticsMiddleware(context, async () => undefined);

    expect(analytics.points[0]?.blobs?.slice(1, 5)).toEqual([
      "autocomplete",
      "stats",
      "season",
      "ok",
    ]);
  });

  test("records missing handler outcomes", async () => {
    const analytics = new FakeAnalyticsEngine();
    const context = createContext({
      ANALYTICS_ENGINE: analytics as unknown as AnalyticsEngineDataset,
    });
    seedSlashMetadata(context);
    context.set("analytics.outcome", "missing_handler");

    await analyticsMiddleware(context, async () => undefined);

    expect(analytics.points[0]?.blobs?.[4]).toBe("missing_handler");
    expect(analytics.points[0]?.doubles?.[2]).toBe(0);
    expect(analytics.points[0]?.doubles?.[3]).toBe(1);
  });

  test("records command failure outcomes and rethrows", async () => {
    const analytics = new FakeAnalyticsEngine();
    const context = createContext({
      ANALYTICS_ENGINE: analytics as unknown as AnalyticsEngineDataset,
    });
    seedSlashMetadata(context);

    await expect(
      analyticsMiddleware(context, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(analytics.points[0]?.blobs?.[4]).toBe("error");
  });

  test("component and modal events use handler prefixes instead of raw custom IDs", async () => {
    const analytics = new FakeAnalyticsEngine();
    const context = createContext({
      ANALYTICS_ENGINE: analytics as unknown as AnalyticsEngineDataset,
    });
    const customId = "team-draft/page/draft-123?page=2";
    context.set("analytics.surface", "component");
    context.set("analytics.name", "team-draft");
    context.set("analytics.detail", "");
    context.set("component", { deferred: false, replied: true });

    await analyticsMiddleware(context, async () => undefined);

    expect(analytics.points[0]?.blobs).toContain("team-draft");
    expect(analytics.points[0]?.blobs).not.toContain(customId);
  });

  test("merges interaction analytics context", () => {
    const context = createContext();

    mergeInteractionAnalyticsContext(context, { cacheState: "miss" });
    mergeInteractionAnalyticsContext(context, { extraState: "deduped" });

    expect(context.get<InteractionAnalyticsFields>("analytics.interaction.fields")).toEqual({
      cacheState: "miss",
      extraState: "deduped",
    });
  });
});

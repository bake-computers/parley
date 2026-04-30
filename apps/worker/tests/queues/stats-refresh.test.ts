import { describe, expect, test } from "bun:test";
import type {
  ExecutionContext,
  KVNamespace,
  Message,
  MessageBatch,
  Queue,
} from "@cloudflare/workers-types";
import { ComponentType } from "@parley/discord-runtime";
import { err, ok } from "neverthrow";
import type { ScrapedStatsCollection } from "@parley/core/http";
import { buildStatsCacheKey } from "@parley/core/stats-cache";
import {
  buildScrapeDayKey,
  createStatsRefreshMessage,
  enqueueStatsRefresh,
  handleStatsRefreshQueue,
  processStatsRefreshMessage,
  registerPendingStatsReply,
  type StatsRefreshMessage,
} from "../../src/queues/stats-refresh";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor: string;
  }> {
    const prefix = options?.prefix ?? "";
    const keys = [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((name) => ({ name }));
    return {
      keys,
      list_complete: true,
      cursor: "",
    };
  }
}

class FakeQueue {
  readonly messages: StatsRefreshMessage[] = [];

  async send(message: StatsRefreshMessage): Promise<unknown> {
    this.messages.push(message);
    return {
      metadata: {
        metrics: {
          backlogBytes: 0,
          backlogCount: this.messages.length,
        },
      },
    };
  }
}

function fakeMessage(body: unknown): Message<StatsRefreshMessage> & { acked: boolean } {
  return {
    id: "message-1",
    timestamp: new Date(),
    body: body as StatsRefreshMessage,
    attempts: 1,
    acked: false,
    ack() {
      this.acked = true;
    },
    retry() {},
  };
}

function rankedSeasonStats(season: string, display: string, matches: number, kills: number) {
  return {
    season,
    season_slug: season,
    season_display: display,
    season_started_at:
      season === "new-blood" ? "2025-06-01T00:00:00.000Z" : "2024-12-01T00:00:00.000Z",
    matches,
    wins: Math.floor(matches * 0.6),
    losses: Math.ceil(matches * 0.4),
    kills,
    deaths: Math.max(1, Math.floor(kills * 0.8)),
    assists: Math.floor(kills * 0.2),
    headshots: Math.floor(kills * 0.3),
    kd_ratio: 1.2,
    headshot_percentage: 35,
    win_rate: 60,
    rank_points: 3200,
    current_rank: "Gold",
    current_rank_tier: "III",
    rounds_played: 50,
    kill_rounds: 20,
    survival_rounds: 10,
    traded_rounds: 5,
  };
}

function collectionFixture(): ScrapedStatsCollection {
  const profile = {
    username: "Player",
    level: 120,
    platform: "pc",
    profile_id: "uuid-player",
    profile_url: "https://stats.cc/siege/Player/uuid-player",
  };

  const deepFreeze = {
    profile,
    ranked_stats: rankedSeasonStats("deep-freeze", "Deep Freeze", 20, 100),
    calculated_metrics: {},
  };
  const newBlood = {
    profile,
    ranked_stats: rankedSeasonStats("new-blood", "New Blood", 12, 80),
    calculated_metrics: {},
  };

  return {
    latest: newBlood,
    bySeason: {
      "deep-freeze": deepFreeze,
      "new-blood": newBlood,
    },
    seasonCatalog: [
      { slug: "new-blood", display: "New Blood", startedAt: "2025-06-01T00:00:00.000Z" },
      { slug: "deep-freeze", display: "Deep Freeze", startedAt: "2024-12-01T00:00:00.000Z" },
    ],
  };
}

function collectTextContent(component: Record<string, unknown>): string[] {
  const content =
    component.type === ComponentType.TextDisplay && typeof component.content === "string"
      ? [component.content]
      : [];
  const children = Array.isArray(component.components)
    ? component.components.flatMap((child) => collectTextContent(child as Record<string, unknown>))
    : [];
  return [...content, ...children];
}

function payloadText(payload: JsonObject | undefined): string {
  if (!payload || !Array.isArray(payload.components)) {
    return "";
  }

  return (payload.components as Record<string, unknown>[])
    .flatMap((component) => collectTextContent(component))
    .join("\n");
}

describe("stats refresh queue", () => {
  test("enqueue sends when no lock exists", async () => {
    const cache = new FakeKV();
    const queue = new FakeQueue();
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
    });

    const result = await enqueueStatsRefresh(
      {
        Cache: cache as unknown as KVNamespace,
        Queue: queue as unknown as Queue<StatsRefreshMessage>,
      },
      message,
    );

    expect(result.isOk()).toBe(true);
    expect(queue.messages).toEqual([message]);
  });

  test("enqueue skips duplicate lock", async () => {
    const cache = new FakeKV();
    const queue = new FakeQueue();
    await cache.put("scrape:pc:player", "1");
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "stale-cache",
    });

    const result = await enqueueStatsRefresh(
      {
        Cache: cache as unknown as KVNamespace,
        Queue: queue as unknown as Queue<StatsRefreshMessage>,
      },
      message,
    );

    expect(result.isOk() ? result.value.status : "error").toBe("deduped");
    expect(queue.messages).toHaveLength(0);
  });

  test("enqueue skips when tracked-player daily cap exists", async () => {
    const cache = new FakeKV();
    const queue = new FakeQueue();
    await cache.put(buildScrapeDayKey("Player", "pc"), "1");
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
    });

    const result = await enqueueStatsRefresh(
      {
        Cache: cache as unknown as KVNamespace,
        Queue: queue as unknown as Queue<StatsRefreshMessage>,
      },
      message,
    );

    expect(result.isOk() ? result.value.status : "error").toBe("daily-capped");
    expect(queue.messages).toHaveLength(0);
  });

  test("enqueue bypasses owner rate limits and dedupe lock", async () => {
    const cache = new FakeKV();
    const queue = new FakeQueue();
    await cache.put(buildScrapeDayKey("Player", "pc"), "1");
    await cache.put("scrape:pc:player", "1");
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
      userId: "owner-1",
    });

    const result = await enqueueStatsRefresh(
      {
        Cache: cache as unknown as KVNamespace,
        Queue: queue as unknown as Queue<StatsRefreshMessage>,
        DISCORD_BOT_OWNER_ID: "owner-1",
      },
      message,
    );

    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value.status : "error").toBe("queued");
    expect(queue.messages).toEqual([message]);
    expect(cache.values.get("scrape:pc:player")).toBe("1");
  });

  test("handleStatsRefreshQueue skips invalid messages", async () => {
    const message = fakeMessage({ nope: true });
    const summary = await handleStatsRefreshQueue(
      {
        messages: [message],
        queue: "stats",
        retryAll() {},
        ackAll() {},
      } as unknown as MessageBatch<StatsRefreshMessage>,
      {},
      { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
    );

    expect(message.acked).toBe(true);
    expect(summary).toEqual({
      processedCount: 1,
      invalidMessageCount: 1,
      successCount: 0,
      retryCount: 0,
    });
  });

  test("handleStatsRefreshQueue returns success counts", async () => {
    const cache = new FakeKV();
    const message = fakeMessage(
      createStatsRefreshMessage({
        username: "Player",
        platform: "pc",
        reason: "cache-miss",
      }),
    );

    const summary = await handleStatsRefreshQueue(
      {
        messages: [message],
        queue: "stats",
        retryAll() {},
        ackAll() {},
      } as unknown as MessageBatch<StatsRefreshMessage>,
      { Cache: cache as unknown as KVNamespace },
      { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
      {
        fetchStatsCollection: async () => ok(collectionFixture()),
        persistSnapshot: async () => {},
        editPendingReply: async () => {},
      },
    );

    expect(message.acked).toBe(true);
    expect(summary).toEqual({
      processedCount: 1,
      invalidMessageCount: 0,
      successCount: 1,
      retryCount: 0,
    });
  });

  test("handleStatsRefreshQueue attaches retry counts to thrown errors", async () => {
    const cache = new FakeKV();
    const message = fakeMessage(
      createStatsRefreshMessage({
        username: "Player",
        platform: "pc",
        reason: "cache-miss",
      }),
    );

    let thrown: unknown;
    try {
      await handleStatsRefreshQueue(
        {
          messages: [message],
          queue: "stats",
          retryAll() {},
          ackAll() {},
        } as unknown as MessageBatch<StatsRefreshMessage>,
        { Cache: cache as unknown as KVNamespace },
        { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
        {
          fetchStatsCollection: async () =>
            err({ kind: "network", message: "network failed", retryable: true }),
          persistSnapshot: async () => {},
          editPendingReply: async () => {},
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(message.acked).toBe(false);
    expect((thrown as { statsRefreshQueueSummary?: unknown }).statsRefreshQueueSummary).toEqual({
      processedCount: 1,
      invalidMessageCount: 0,
      successCount: 0,
      retryCount: 1,
    });
  });

  test("successful refresh writes latest plus per-season caches and season catalogs", async () => {
    const cache = new FakeKV();
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
    });

    await processStatsRefreshMessage({ Cache: cache as unknown as KVNamespace }, message, {
      fetchStatsCollection: async () => ok(collectionFixture()),
      persistSnapshot: async () => {},
      editPendingReply: async () => {},
    });

    expect(cache.values.has(buildStatsCacheKey("Player", "pc", "latest"))).toBe(true);
    expect(cache.values.has(buildStatsCacheKey("Player", "pc", "new-blood"))).toBe(true);
    expect(cache.values.has(buildStatsCacheKey("Player", "pc", "deep-freeze"))).toBe(true);
    expect(cache.values.has("stats:season-catalog:v1:player:pc:player")).toBe(true);
    expect(cache.values.has("stats:season-catalog:v1:global")).toBe(true);
  });

  test("pending replies for concurrent callers are all edited", async () => {
    const cache = new FakeKV();
    const edits: string[] = [];
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
    });

    await registerPendingStatsReply(cache as unknown as KVNamespace, {
      interactionId: "i-1",
      applicationId: "app",
      token: "t-1",
      username: "Player",
      platform: "pc",
      requestedSeasonRaw: null,
      requestedSeasonCanonical: null,
      requestedAt: 1,
    });
    await registerPendingStatsReply(cache as unknown as KVNamespace, {
      interactionId: "i-2",
      applicationId: "app",
      token: "t-2",
      username: "Player",
      platform: "pc",
      requestedSeasonRaw: null,
      requestedSeasonCanonical: null,
      requestedAt: 2,
    });

    await processStatsRefreshMessage({ Cache: cache as unknown as KVNamespace }, message, {
      fetchStatsCollection: async () => ok(collectionFixture()),
      persistSnapshot: async () => {},
      editPendingReply: async (pending) => {
        edits.push(pending.interactionId);
      },
    });

    expect(edits.sort()).toEqual(["i-1", "i-2"]);
  });

  test("different requested seasons receive different final component cards from one scrape", async () => {
    const cache = new FakeKV();
    const payloadByInteraction = new Map<string, JsonObject>();
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
    });

    await registerPendingStatsReply(cache as unknown as KVNamespace, {
      interactionId: "latest",
      applicationId: "app",
      token: "t-1",
      username: "Player",
      platform: "pc",
      requestedSeasonRaw: null,
      requestedSeasonCanonical: null,
      requestedAt: 1,
    });
    await registerPendingStatsReply(cache as unknown as KVNamespace, {
      interactionId: "deep",
      applicationId: "app",
      token: "t-2",
      username: "Player",
      platform: "pc",
      requestedSeasonRaw: "Deep Freeze",
      requestedSeasonCanonical: "deep-freeze",
      requestedAt: 2,
    });

    await processStatsRefreshMessage({ Cache: cache as unknown as KVNamespace }, message, {
      fetchStatsCollection: async () => ok(collectionFixture()),
      persistSnapshot: async () => {},
      editPendingReply: async (pending, payload) => {
        payloadByInteraction.set(pending.interactionId, payload);
      },
    });

    const latestPayload = payloadByInteraction.get("latest");
    const deepPayload = payloadByInteraction.get("deep");
    const latestDescription = payloadText(latestPayload);
    const deepDescription = payloadText(deepPayload);

    expect(latestDescription).toContain("Season");
    expect(latestDescription).toContain("New Blood");
    expect(deepDescription).toContain("Season");
    expect(deepDescription).toContain("Deep Freeze");
  });

  test("invalid requested season updates original reply with season-not-found card", async () => {
    const cache = new FakeKV();
    let editedTitle = "";
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
    });

    await registerPendingStatsReply(cache as unknown as KVNamespace, {
      interactionId: "bad-season",
      applicationId: "app",
      token: "t-1",
      username: "Player",
      platform: "pc",
      requestedSeasonRaw: "bad-season",
      requestedSeasonCanonical: "bad-season",
      requestedAt: 1,
    });

    await processStatsRefreshMessage({ Cache: cache as unknown as KVNamespace }, message, {
      fetchStatsCollection: async () => ok(collectionFixture()),
      persistSnapshot: async () => {},
      editPendingReply: async (_pending, payload) => {
        editedTitle = payloadText(payload);
      },
    });

    expect(editedTitle).toContain("Season not found");
  });

  test("non-retryable fetch failure edits waiting replies and does not cache", async () => {
    const cache = new FakeKV();
    let editedTitle = "";
    const message = createStatsRefreshMessage({
      username: "Missing",
      platform: "pc",
      reason: "cache-miss",
    });

    await registerPendingStatsReply(cache as unknown as KVNamespace, {
      interactionId: "missing-user",
      applicationId: "app",
      token: "t-1",
      username: "Missing",
      platform: "pc",
      requestedSeasonRaw: null,
      requestedSeasonCanonical: null,
      requestedAt: 1,
    });

    await processStatsRefreshMessage({ Cache: cache as unknown as KVNamespace }, message, {
      fetchStatsCollection: async () =>
        err({
          kind: "profile-not-found",
          message: "missing",
          retryable: false,
        }),
      editPendingReply: async (_pending, payload) => {
        editedTitle = payloadText(payload);
      },
    });

    expect(cache.values.has(buildStatsCacheKey("Missing", "pc", "latest"))).toBe(false);
    expect(editedTitle).toContain("Stats refresh failed");
  });

  test("owner-triggered refresh does not write the tracked-player daily marker", async () => {
    const cache = new FakeKV();
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
      userId: "owner-1",
    });

    await processStatsRefreshMessage(
      {
        Cache: cache as unknown as KVNamespace,
        DISCORD_BOT_OWNER_ID: "owner-1",
      },
      message,
      {
        fetchStatsCollection: async () => ok(collectionFixture()),
        persistSnapshot: async () => {},
        editPendingReply: async () => {},
      },
    );

    expect(cache.values.has(buildScrapeDayKey("Player", "pc"))).toBe(false);
  });
});

type JsonObject = Record<string, unknown>;

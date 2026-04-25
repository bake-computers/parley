import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import {
  createStatsRefreshMessage,
  enqueueStatsRefresh,
  handleStatsRefreshQueue,
  processStatsRefreshMessage,
  type StatsRefreshMessage,
} from "./stats-refresh";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
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

  test("handleStatsRefreshQueue skips invalid messages", async () => {
    const message = fakeMessage({ nope: true });
    await handleStatsRefreshQueue(
      {
        messages: [message],
        queue: "stats",
        retryAll() {},
        ackAll() {},
      } as MessageBatch<StatsRefreshMessage>,
      {},
      { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext,
    );

    expect(message.acked).toBe(true);
  });

  test("processStatsRefreshMessage does not cache permanent scrape failures", async () => {
    const cache = new FakeKV();
    const message = createStatsRefreshMessage({
      username: "Missing",
      platform: "pc",
      reason: "cache-miss",
    });

    await processStatsRefreshMessage({ Cache: cache as unknown as KVNamespace }, message, {
      fetchStats: async () =>
        err({
          kind: "profile-not-found",
          message: "missing",
          retryable: false,
        }),
    });

    expect(cache.values.has(message.cacheKey)).toBe(false);
  });

  test("processStatsRefreshMessage writes cache and persists on success", async () => {
    const cache = new FakeKV();
    let persisted = false;
    const message = createStatsRefreshMessage({
      username: "Player",
      platform: "pc",
      reason: "cache-miss",
    });

    await processStatsRefreshMessage({ Cache: cache as unknown as KVNamespace }, message, {
      fetchStats: async () =>
        ok({
          profile: {
            username: "Player",
            platform: "pc",
          },
          ranked_stats: {
            matches: 1,
            kills: 5,
            deaths: 2,
          },
          calculated_metrics: {},
        }),
      persistSnapshot: async () => {
        persisted = true;
      },
    });

    expect(cache.values.has(message.cacheKey)).toBe(true);
    expect(persisted).toBe(true);
  });
});

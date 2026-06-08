import { afterEach, describe, expect, test } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLeaderboardStream } from "#/hooks/useLeaderboardStream";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({
          type: "snapshot",
          metric: "rank_points",
          hash: "abc",
          updatedAt: 1_700_000_000_000,
          totalCount: 1,
          entries: [{ rank: 1, playerId: "player-one", score: 5000 }],
        }),
      });
    });
  }

  close() {
    this.onclose?.();
  }

  addEventListener(type: "open" | "message" | "close" | "error", handler: () => void) {
    if (type === "open") {
      this.onopen = handler;
    }
    if (type === "message") {
      this.onmessage = handler as (event: { data: string }) => void;
    }
    if (type === "close") {
      this.onclose = handler;
    }
    if (type === "error") {
      this.onerror = handler;
    }
  }
}

afterEach(() => {
  MockWebSocket.instances = [];
});

describe("useLeaderboardStream", () => {
  test("bootstraps from HTTP then applies websocket snapshot", async () => {
    const originalFetch = globalThis.fetch;
    const originalWebSocket = globalThis.WebSocket;

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          type: "snapshot",
          metric: "rank_points",
          hash: "seed",
          updatedAt: 1,
          totalCount: 0,
          entries: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const { result } = renderHook(() => useLeaderboardStream("rank_points"));

    await waitFor(() => {
      expect(result.current.snapshot?.entries[0]?.playerId).toBe("player-one");
      expect(result.current.status).toBe("live");
    });

    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  });
});

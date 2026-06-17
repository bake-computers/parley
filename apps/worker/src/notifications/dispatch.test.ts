import { describe, expect, test, mock, beforeEach } from "bun:test";
import { Hono } from "hono";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { NotifyPayload } from "./types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SECRET = "test-webhook-secret";

async function computeHmac(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function mockKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    put: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    list: () => Promise.resolve({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: () => Promise.resolve({ value: null, metadata: null }),
  } as unknown as KVNamespace & { store: Map<string, string> };
}

function matchPayload(overrides: Partial<NotifyPayload> = {}): NotifyPayload {
  return {
    event: "match.ready",
    game: "r6",
    match_id: "m-1",
    host_guild_id: "host-guild",
    public_uuid: "abc-123",
    participant_guild_ids: ["host-guild"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock modules - only mock transport, not postChannelMessage or @parley/runtime
// ---------------------------------------------------------------------------

const mockGetNotificationSettings = mock(() =>
  Promise.resolve({
    guildId: "host-guild",
    game: "r6",
    matchResultsChannel: "111",
    tournamentAnnouncementsChannel: "222",
    crossGuildAnnouncementsEnabled: false,
    announceMatchReadyEnabled: true,
    announceMatchResultsEnabled: true,
  }),
);

mock.module("../transport.js", () => ({
  getGuildSettingsClient: () => ({
    getNotificationSettings: mockGetNotificationSettings,
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { createDispatchHandler } = await import("./dispatch.js");

const mockDiscordClient = {
  request: mock(() => Promise.resolve({ isOk: () => true, isErr: () => false, value: { id: "msg-1" } })),
};

const handleDispatch = createDispatchHandler(() => mockDiscordClient as unknown as import("@parley/runtime").DiscordRestClient);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

function createTestApp(kv: KVNamespace) {
  const app = new Hono();
  app.post("/internal/notifications/dispatch", (c) => {
    const env = {
      KV: kv,
      NOTIFY_WEBHOOK_SECRET: SECRET,
      DISCORD_BOT_TOKEN: "test-token",
      ENGINE_SERVICE_URL: "http://localhost:50051",
      ENGINE_INTERNAL_URL: "http://localhost:50051",
    };
    const testC = {
      ...c,
      env,
      req: c.req,
      json: c.json.bind(c),
    };
    return handleDispatch(testC as unknown as Parameters<typeof handleDispatch>[0]);
  });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dispatch handler", () => {
  beforeEach(() => {
    mockGetNotificationSettings.mockClear();
    mockDiscordClient.request.mockClear();
  });

  test("returns 401 when X-Parley-Signature is missing", async () => {
    const kv = mockKV();
    const app = createTestApp(kv);

    const res = await app.request("/internal/notifications/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matchPayload()),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("missing signature");
  });

  test("returns 401 when X-Parley-Signature is invalid", async () => {
    const kv = mockKV();
    const app = createTestApp(kv);
    const payload = JSON.stringify(matchPayload());

    const res = await app.request("/internal/notifications/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Parley-Signature": "invalid-signature",
      },
      body: payload,
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid signature");
  });

  test("returns 200 and processes notification with valid signature", async () => {
    const kv = mockKV();
    const app = createTestApp(kv);
    const payload = JSON.stringify(matchPayload());
    const signature = await computeHmac(SECRET, payload);

    const res = await app.request("/internal/notifications/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Parley-Signature": signature,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; posted: number };
    expect(body.status).toBe("ok");
    expect(body.posted).toBe(1);
    expect(mockGetNotificationSettings).toHaveBeenCalledTimes(1);
  });

  test("skips duplicate notification via KV deduplication", async () => {
    const kv = mockKV();
    const app = createTestApp(kv);
    const payload = JSON.stringify(matchPayload());
    const signature = await computeHmac(SECRET, payload);

    const res1 = await app.request("/internal/notifications/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Parley-Signature": signature,
      },
      body: payload,
    });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { status: string };
    expect(body1.status).toBe("ok");

    const res2 = await app.request("/internal/notifications/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Parley-Signature": signature,
      },
      body: payload,
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { status: string; reason: string };
    expect(body2.status).toBe("skipped");
    expect(body2.reason).toBe("duplicate");
  });

  test("returns 400 for invalid JSON body", async () => {
    const kv = mockKV();
    const app = createTestApp(kv);
    const badBody = "not-json";
    const signature = await computeHmac(SECRET, badBody);

    const res = await app.request("/internal/notifications/dispatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Parley-Signature": signature,
      },
      body: badBody,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid JSON");
  });
});

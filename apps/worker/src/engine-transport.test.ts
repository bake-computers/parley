import { beforeEach, describe, expect, test } from "bun:test";
import { resolveEngineTransport } from "#/engine-transport";

const store = new Map<string, string>();
const KV = {
  get: async (key: string) => store.get(key) ?? null,
  put: async (key: string, value: string) => {
    store.set(key, value);
  },
};

let hits = 0;
let nextStatus = 200;
let nextBody = '{"ok":true}';
const VPC_SERVICE = {
  fetch: async () => {
    hits += 1;
    return new Response(nextBody, {
      status: nextStatus,
      headers: { "content-type": "application/json" },
    });
  },
};

const t = resolveEngineTransport({
  VPC_SERVICE: VPC_SERVICE as never,
  ENGINE_INTERNAL_URL: "http://engine.internal",
  KV: KV as never,
  ENGINE_SHARED_SECRET: "s",
});

const LIST_URL =
  "http://engine.internal/parley.matchmaking.v1.MatchmakingService/ListMatches";
const CREATE_URL =
  "http://engine.internal/parley.matchmaking.v1.MatchmakingService/CreateCustomMatch";
const GET_USER_URL =
  "http://engine.internal/parley.user.v1.UserSettingsService/GetUserSettings";

async function post(url: string, body = '{"ok":true}'): Promise<Response> {
  return t.fetchImpl(url, { method: "POST", body });
}

describe("engine-transport kv cache", () => {
  beforeEach(() => {
    store.clear();
    hits = 0;
    nextStatus = 200;
    nextBody = '{"ok":true}';
  });

  test("ListMatches: cache-aside, second call served from KV", async () => {
    const res1 = await post(LIST_URL);
    expect(res1.status).toBe(200);
    expect(await res1.text()).toBe('{"ok":true}');

    const res2 = await post(LIST_URL);
    expect(hits).toBe(1);
    expect(res2.status).toBe(200);
    expect(await res2.text()).toBe('{"ok":true}');
  });

  test("CreateCustomMatch: writes are never cached", async () => {
    await post(CREATE_URL);
    await post(CREATE_URL);
    expect(hits).toBe(2);
  });

  test("GetUserSettings: always hits engine on 2xx", async () => {
    await post(GET_USER_URL);
    await post(GET_USER_URL);
    expect(hits).toBe(2);
  });

  test("GetUserSettings: 503 replays last cached 200", async () => {
    const ok = await post(GET_USER_URL);
    expect(ok.status).toBe(200);

    nextStatus = 503;
    nextBody = '{"ok":false}';
    const replay = await post(GET_USER_URL);
    expect(replay.status).toBe(200);
    expect(await replay.text()).toBe('{"ok":true}');
  });

  test("ListMatches: cache write failure still returns 200", async () => {
    const failingKV = { ...KV, put: async () => { throw new Error("quota"); } };
    const t2 = resolveEngineTransport({
      VPC_SERVICE: VPC_SERVICE as never,
      ENGINE_INTERNAL_URL: "http://engine.internal",
      KV: failingKV as never,
      ENGINE_SHARED_SECRET: "s",
    });
    const res = await t2.fetchImpl(LIST_URL, { method: "POST", body: '{"ok":true}' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
  });
});

import { beforeEach, describe, expect, test } from "bun:test";
import { resolveEngineTransport } from "#/engine-transport";

const store = new Map<string, string>();
let failKvRead = false;
const KV = {
  get: (key: string): Promise<string | null> =>
    failKvRead
      ? Promise.reject(new Error("kv read failed"))
      : Promise.resolve(store.get(key) ?? null),
  put: async (key: string, value: string) => {
    store.set(key, value);
  },
};

let hits = 0;
let nextStatus = 200;
let nextBody = '{"ok":true}';
let fetchThrows = false;
const VPC_SERVICE = {
  fetch: async () => {
    hits += 1;
    if (fetchThrows) {
      throw new Error("vpc fetch failed");
    }
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
    fetchThrows = false;
    failKvRead = false;
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

  test("ListMatches does not stale-replay on 503", async () => {
    const ok = await post(LIST_URL);
    expect(ok.status).toBe(200);

    // Simulate TTL expiry so the next call reaches the engine.
    store.clear();
    nextStatus = 503;
    nextBody = '{"ok":false}';
    const res = await post(LIST_URL);
    expect(res.status).toBe(503);
    expect(hits).toBe(2);
  });

  test("GetUserSettings replays cache when fetch throws", async () => {
    const ok = await post(GET_USER_URL);
    expect(ok.status).toBe(200);

    fetchThrows = true;
    const replay = await post(GET_USER_URL);
    expect(replay.status).toBe(200);
    expect(await replay.text()).toBe('{"ok":true}');
    fetchThrows = false;

    // List* has no stale replay: a thrown fetch propagates.
    store.clear();
    fetchThrows = true;
    let thrown: unknown;
    try {
      await post(LIST_URL);
    } catch (err) {
      thrown = err;
    }
    fetchThrows = false;
    expect(thrown).toBeInstanceOf(Error);
  });

  test("KV read failures degrade to pass-through", async () => {
    const failingReadKV = {
      ...KV,
      get: (): Promise<never> => Promise.reject(new Error("kv down")),
    };
    const t2 = resolveEngineTransport({
      VPC_SERVICE: VPC_SERVICE as never,
      ENGINE_INTERNAL_URL: "http://engine.internal",
      KV: failingReadKV as never,
      ENGINE_SHARED_SECRET: "s",
    });
    const listRes = await t2.fetchImpl(LIST_URL, { method: "POST", body: '{"ok":true}' });
    expect(listRes.status).toBe(200);
    expect(await listRes.text()).toBe('{"ok":true}');

    await t2.fetchImpl(GET_USER_URL, { method: "POST", body: '{"ok":true}' });
    nextStatus = 503;
    const getRes = await t2.fetchImpl(GET_USER_URL, { method: "POST", body: '{"ok":true}' });
    expect(getRes.status).toBe(503);
  });

  test("cache keys are scoped by SERVICE_ENV", async () => {
    const mk = (serviceEnv: "production" | "staging") =>
      resolveEngineTransport({
        VPC_SERVICE: VPC_SERVICE as never,
        ENGINE_INTERNAL_URL: "http://engine.internal",
        KV: KV as never,
        ENGINE_SHARED_SECRET: "s",
        SERVICE_ENV: serviceEnv,
      });

    const production = mk("production");
    const staging = mk("staging");

    const p1 = await production.fetchImpl(LIST_URL, { method: "POST", body: '{"ok":true}' });
    expect(p1.status).toBe(200);

    const s1 = await staging.fetchImpl(LIST_URL, { method: "POST", body: '{"ok":true}' });
    expect(s1.status).toBe(200);
    expect(hits).toBe(2);
  });
});

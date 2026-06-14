import { describe, expect, test, spyOn } from "bun:test";
import { matchHandler } from "./match.js";
import type { Env } from "../types.js";
import type { Context } from "hono";
import type { AxiomVariables } from "@parley/axiom";

type AppContext = Context<{ Bindings: Env; Variables: AxiomVariables }>;

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const MOCK_MATCH = { id: "m-1", game: "r6", teams: [{ name: "A", players: [] }] };
const KV_KEY = `match:json:${UUID}`;

function createMockKV(initial?: Map<string, string>) {
  const store = initial ?? new Map<string, string>();
  return {
    store,
    get(key: string, type?: string) {
      const val = store.get(key);
      if (val === undefined) {
        return Promise.resolve(null);
      }
      if (type === "json") {
        return Promise.resolve(JSON.parse(val) as unknown);
      }
      return Promise.resolve(val);
    },
    put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(_key: string) {
      return Promise.resolve();
    },
    list() {
      return Promise.resolve({ keys: [], list_complete: true, cacheStatus: null });
    },
    getWithMetadata(_key: string) {
      return Promise.resolve({ value: null, metadata: null });
    },
  } as unknown as KVNamespace;
}

function createEnv(kv?: ReturnType<typeof createMockKV>): Env {
  return {
    MATCH_KV: kv ?? createMockKV(),
    ENGINE_SERVICE_URL: "http://engine:50051",
    GLOBAL_LEADERBOARD: {} as DurableObjectNamespace,
    ALLOWED_ORIGINS: "*",
    POLL_INTERVAL_MS: "60000",
    AXIOM_TOKEN: "",
    AXIOM_DATASET: "",
    AXIOM_INGEST_ENDPOINT: "",
  } as unknown as Env;
}

function createCtx(env: Env, uuid = UUID): AppContext {
  return {
    req: { param: (name?: string) => (name ? uuid : { uuid }) },
    env,
    json(body: unknown, status?: number, headers?: Record<string, string>) {
      const init: ResponseInit = { status: status ?? 200 };
      if (headers !== undefined) {
        init.headers = headers;
      }
      return new Response(JSON.stringify(body), init);
    },
  } as unknown as AppContext;
}

describe("match route", () => {
  test("match_route_returns_cached_match", async () => {
    const kv = createMockKV(new Map([[KV_KEY, JSON.stringify(MOCK_MATCH)]]));
    const env = createEnv(kv);
    const ctx = createCtx(env);

    const res = await matchHandler(ctx);

    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual(MOCK_MATCH);
    expect(res.headers.get("X-Cache")).toBe("HIT");
  });

  test("match_route_fetches_from_rust_on_miss", async () => {
    const env = createEnv();
    const ctx = createCtx(env);

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, match: MOCK_MATCH })),
    );

    try {
      const res = await matchHandler(ctx);

      expect(res.status).toBe(200);
      expect((await res.json()) as unknown).toEqual(MOCK_MATCH);
      expect(res.headers.get("X-Cache")).toBe("MISS");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("match_route_returns_404_for_missing", async () => {
    const env = createEnv();
    const ctx = createCtx(env);

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    try {
      const res = await matchHandler(ctx);

      expect(res.status).toBe(404);
      expect((await res.json()) as unknown).toEqual({ error: "match not found" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("match_route_writes_to_kv_on_miss", async () => {
    const kv = createMockKV();
    const putSpy = spyOn(kv, "put");
    const env = createEnv(kv);
    const ctx = createCtx(env);

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, match: MOCK_MATCH })),
    );

    try {
      await matchHandler(ctx);

      expect(putSpy).toHaveBeenCalledWith(KV_KEY, JSON.stringify(MOCK_MATCH), {
        expirationTtl: 3600,
      });

      const res2 = await matchHandler(ctx);
      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-Cache")).toBe("HIT");
    } finally {
      fetchSpy.mockRestore();
      putSpy.mockRestore();
    }
  });
});

import type { Fetcher, KVNamespace } from "@cloudflare/workers-types";
import { getRequestContext } from "#/request-context";

export type EngineTransportEnv = {
  VPC_SERVICE?: Fetcher;
  /** Internal engine URL over the VPC binding (production) or local engine (dev). */
  ENGINE_INTERNAL_URL?: string;
  /**
   * Shared secret the engine requires on every non-probe route
   * (`Authorization: Bearer <secret>`). Must match the engine's
   * ENGINE_SHARED_SECRET.
   */
  ENGINE_SHARED_SECRET?: string;
  KV?: KVNamespace;
};

export type EngineFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type EngineTransportConfig = {
  baseUrl: string;
  cacheKey: string;
  fetchImpl: EngineFetch;
};

function withEngineAuth(fetchImpl: EngineFetch, secret: string | undefined): EngineFetch {
  const token = (secret ?? "").trim();
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    // Forward the incoming request id so the engine wide event matches ours.
    const requestId = getRequestContext()?.requestId;
    if (requestId && !headers.has("X-Request-ID")) {
      headers.set("X-Request-ID", requestId);
    }
    return fetchImpl(input, { ...init, headers });
  };
}

const CACHE_TTL = 300;

type HashableBody = string | ArrayBuffer | Uint8Array;

function methodFromUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function asHashableBody(body: RequestInit["body"] | null | undefined): HashableBody | null {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body;
  if (body instanceof ArrayBuffer) return body;
  if (body instanceof Uint8Array) return body;
  // Blob / ReadableStream / FormData etc. cannot be hashed without reading: pass through unread.
  return null;
}

async function buildCacheKey(method: string, pathname: string, body: HashableBody): Promise<string> {
  const enc = new TextEncoder();
  const prefix = enc.encode(`${pathname}\n`);
  let payload: Uint8Array;
  if (typeof body === "string") {
    payload = enc.encode(body);
  } else if (body instanceof Uint8Array) {
    payload = body;
  } else {
    payload = new Uint8Array(body);
  }
  const data = new Uint8Array(prefix.length + payload.length);
  data.set(prefix);
  data.set(payload, prefix.length);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return `engine:${method}:${hex}`;
}

type CachedEntry = { ct?: string; body: string };

function replayCached(entry: CachedEntry): Response {
  return new Response(entry.body, {
    status: 200,
    headers: { "content-type": entry.ct || "application/json" },
  });
}

function parseCached(text: string | null): CachedEntry | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as CachedEntry).body === "string"
    ) {
      return parsed as CachedEntry;
    }
  } catch {
    /* not a cached entry */
  }
  return null;
}

/**
 * Cache wrapper around an engine fetch implementation.
 *
 * - List* / Fetch* : cache-aside with a 300s TTL (a KV hit skips the engine).
 * - other Get* / Lookup* : always hit the engine; store 2xx responses; on a
 *   5xx or thrown fetch, replay the last cached entry as a 200.
 * - anything else : no caching.
 *
 * The cache key is `engine:{Method}:{sha256hex(pathname + "\n" + body)}`
 * where Method is the last URL path segment. Only string / ArrayBuffer /
 * Uint8Array bodies can be hashed; streams pass through unread.
 *
 * // ponytail: no write invalidation; add if stale Get/Lookup after a
 * // successful write is a product bug.
 */
function withEngineKvCache(
  fetchImpl: EngineFetch,
  kv: KVNamespace | undefined,
): EngineFetch {
  if (!kv) return fetchImpl;

  return async (input, init) => {
    let url: string;
    let rawBody: RequestInit["body"] | null | undefined;
    if (input instanceof Request) {
      url = input.url;
      rawBody = init?.body !== undefined ? init.body : input.body;
    } else {
      url = input instanceof URL ? input.href : input;
      rawBody = init?.body;
    }

    const method = methodFromUrl(url);
    const pathname = pathnameOf(url);

    const isListFetch = method.startsWith("List") || method.startsWith("Fetch");
    const isGetLookup = method.startsWith("Get") || method.startsWith("Lookup");
    if (!isListFetch && !isGetLookup) {
      return fetchImpl(input, init);
    }

    const hashable = asHashableBody(rawBody);
    if (hashable === null) {
      // Unhashable body: cannot key the cache, pass through unread.
      return fetchImpl(input, init);
    }

    const key = await buildCacheKey(method, pathname, hashable);

    if (isListFetch) {
      const cached = parseCached(await kv.get(key, { type: "text" }));
      if (cached) return replayCached(cached);
    }

    let response: Response;
    try {
      response = await fetchImpl(input, init);
    } catch (cause) {
      if (isGetLookup) {
        const cached = parseCached(await kv.get(key, { type: "text" }));
        if (cached) return replayCached(cached);
      }
      throw cause;
    }

    if (response.status >= 200 && response.status < 300) {
      const ct = response.headers.get("content-type") ?? undefined;
      const text = await response.text();
      const entry: CachedEntry = ct ? { ct, body: text } : { body: text };
      try {
        if (isListFetch) {
          await kv.put(key, JSON.stringify(entry), { expirationTtl: CACHE_TTL });
        } else {
          await kv.put(key, JSON.stringify(entry));
        }
      } catch {
        // cache write must not fail the live response
      }
      return new Response(text, ct ? { status: response.status, headers: { "content-type": ct } } : { status: response.status });
    }

    if (isGetLookup && response.status >= 500) {
      const cached = parseCached(await kv.get(key, { type: "text" }));
      if (cached) return replayCached(cached);
    }

    return response;
  };
}

export function resolveEngineTransport(env: EngineTransportEnv): EngineTransportConfig {
  if (env.VPC_SERVICE && env.ENGINE_INTERNAL_URL) {
    const baseUrl = env.ENGINE_INTERNAL_URL;
    const vpc = env.VPC_SERVICE;
    const baseFetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const resolved = url.startsWith("http") ? url : new URL(url, baseUrl).href;
      return vpc.fetch(resolved, (init ?? {}) as Parameters<Fetcher["fetch"]>[1]);
    }) as unknown as EngineFetch;
    return {
      baseUrl,
      cacheKey: `vpc:${baseUrl}`,
      fetchImpl: withEngineAuth(withEngineKvCache(baseFetch, env.KV), env.ENGINE_SHARED_SECRET),
    };
  }

  const baseUrl = env.ENGINE_INTERNAL_URL ?? "http://127.0.0.1:50051";
  const baseFetch: EngineFetch = (input, init) => fetch(input, init);
  return {
    baseUrl,
    cacheKey: `local:${baseUrl}`,
    fetchImpl: withEngineAuth(withEngineKvCache(baseFetch, env.KV), env.ENGINE_SHARED_SECRET),
  };
}

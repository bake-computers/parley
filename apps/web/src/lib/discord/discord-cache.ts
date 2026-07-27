/**
 * Short-TTL cache for Discord API payloads.
 * Memory (isolate) + Cache API (colo) so hot requests skip Discord.
 */

declare global {
  /** Cloudflare Workers add a bucketless default cache to the DOM CacheStorage. */
  interface CacheStorage {
    default: Cache;
  }
}

const memory = new Map<string, { exp: number; body: string }>();
const MEMORY_MAX = 200;

function cacheUrl(key: string): string {
  return `https://parley-cache.internal/${key}`;
}

function pruneMemory(): void {
  if (memory.size <= MEMORY_MAX) {
    return;
  }
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.exp <= now) {
      memory.delete(k);
    }
  }
  while (memory.size > MEMORY_MAX) {
    const first = memory.keys().next().value;
    if (first === undefined) {
      break;
    }
    memory.delete(first);
  }
}

function defaultCache(): Cache | null {
  try {
    if (typeof caches !== "undefined" && caches.default) {
      return caches.default;
    }
  } catch {
    // not on Workers
  }
  return null;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const mem = memory.get(key);
  if (mem && mem.exp > Date.now()) {
    try {
      return JSON.parse(mem.body) as T;
    } catch {
      memory.delete(key);
    }
  } else if (mem) {
    memory.delete(key);
  }

  const store = defaultCache();
  if (!store) {
    return null;
  }
  try {
    const res = await store.match(cacheUrl(key));
    if (!res) {
      return null;
    }
    const body = await res.text();
    const ttlHeader = res.headers.get("Cache-Control");
    const maxAge = ttlHeader?.match(/max-age=(\d+)/)?.[1];
    const ttlSec = maxAge ? Number(maxAge) : 60;
    memory.set(key, { exp: Date.now() + ttlSec * 1000, body });
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

export async function cachePutJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const body = JSON.stringify(value);
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  memory.set(key, { exp: Date.now() + ttl * 1000, body });
  pruneMemory();

  const store = defaultCache();
  if (!store) {
    return;
  }
  try {
    await store.put(
      cacheUrl(key),
      new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`,
        },
      }),
    );
  } catch {
    // best-effort
  }
}

export function cacheClearMemoryForTests(): void {
  memory.clear();
}

export const USER_GUILDS_TTL_SEC = 90;
export const BOT_GUILDS_TTL_SEC = 180;

export function userGuildsCacheKey(userId: string): string {
  return `user-guilds:v1:${userId}`;
}

export const BOT_GUILDS_CACHE_KEY = "bot-guild-ids:v1";

/** Cache-Control helpers for Workers Cache (wrangler `cache.enabled`). */

/**
 * Cache SSR HTML at the edge for up to an hour. Deploys swap content-hashed
 * `/assets/*` module URLs, so a stale document can point at deleted chunks;
 * `apps/web/src/router.tsx` recovers from exactly that by reloading once with
 * a `_r` query key (misses Workers Cache) that serves fresh HTML. With that
 * recovery in place the freshness cap is raised from 60s to 3600s.
 * `_swr` is honored when > 0: repeat hits stay fast while the CDN revalidates
 * in the background. `must-revalidate` is only used without SWR, since the
 * two directives contradict each other.
 */
export function publicCache(maxAge: number, _swr = 0, tags?: string) {
  const fresh = Math.min(Math.max(maxAge, 0), 3600);
  const swr = _swr > 0 ? Math.max(Math.floor(_swr), 0) : 0;
  const cacheControl =
    swr > 0
      ? `public, max-age=${fresh}, stale-while-revalidate=${swr}`
      : `public, max-age=${fresh}, must-revalidate`;
  const headers: Record<string, string> = {
    "Cache-Control": cacheControl,
  };
  if (tags) {
    headers["Cache-Tag"] = tags;
  }
  return headers;
}

/** Never share across users; never store at edge. */
export const privateNoStore = {
  "Cache-Control": "private, no-store",
} as const;

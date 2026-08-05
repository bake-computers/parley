/** Cache-Control helpers for Workers Cache (wrangler `cache.enabled`). */

/**
 * Cache SSR HTML briefly. No stale-while-revalidate: the document embeds
 * content-hashed `/assets/*` module URLs that 404 after the next deploy, so
 * serving stale HTML leaves clients on dead chunks. Freshness is capped at 60s
 * for the same reason. `_swr` is ignored (call-site signature kept stable).
 */
export function publicCache(maxAge: number, _swr = 0, tags?: string) {
  const fresh = Math.min(Math.max(maxAge, 0), 60);
  const headers: Record<string, string> = {
    "Cache-Control": `public, max-age=${fresh}, must-revalidate`,
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

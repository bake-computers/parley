/** Cache-Control helpers for Workers Cache (wrangler `cache.enabled`). */

export function publicCache(maxAge: number, swr: number, tags?: string) {
  const headers: Record<string, string> = {
    "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=${swr}`,
  };
  if (tags) {headers["Cache-Tag"] = tags;}
  return headers;
}

/** Never share across users; never store at edge. */
export const privateNoStore = {
  "Cache-Control": "private, no-store",
} as const;

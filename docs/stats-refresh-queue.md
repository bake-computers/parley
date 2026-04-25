# Stats Refresh Queue

`/stats` never scrapes inline. It reads KV first and uses Cloudflare Queues for background refreshes.

## Command Behavior

- Fresh cache hit: show the cached embed.
- Stale cache hit: show the cached embed and enqueue a refresh in `waitUntil`.
- Cache miss: defer, enqueue a refresh, and tell the user to retry shortly.

D1 is not used as a command fallback in this pass.

## Message Schema

```ts
type StatsRefreshMessage = {
  type: "stats.refresh";
  username: string;
  platform: "auto" | "pc" | "xbox" | "playstation";
  cacheKey: string;
  reason: "cache-miss" | "stale-cache";
  requestedAt: number;
  requestedBy?: { guildId?: string; channelId?: string; userId?: string };
};
```

## KV Keys

- Refresh lock: `scrape:{platform}:{normalizedUsername}`
- Lock TTL: 30 minutes
- Daily success cap: `scrape-day:{platform}:{normalizedUsername}:{yyyy-mm-dd}`
- Daily cap TTL: seconds until the next UTC day

When `platform` is `auto`, enqueue checks all resolved platform daily-cap keys before sending another refresh.

## Consumer

The consumer validates each message, scrapes stats.cc with `fetchAndScrapeStatsResult`, writes the KV envelope, persists a D1 snapshot through Drizzle, sets the daily success cap, and logs the result.

Permanent user/data errors are logged and acknowledged. Retryable scraping, KV, or D1 failures throw so Cloudflare Queues can retry the message.

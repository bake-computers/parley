# teamanica

Discord interactions Worker for Teamanica. Runtime is Bun, deploy target is Cloudflare Workers, persistence is Drizzle on D1, and cache/session state lives in KV.

## Commands

```bash
bun install
bun run dev
bun run build
bun run deploy
bun run register
bun run typecheck
bun test
bun run lint
bun run format:check
```

## Discord Registration

Command registration uses the local runtime in `src/lib/discord` and writes JSON logs.

Required environment variables:

```bash
DISCORD_BOT_TOKEN
DISCORD_APPLICATION_ID
```

`DISCORD_TOKEN` is still accepted as a fallback for local compatibility.

## Cloudflare Worker

`src/index.ts` exports a native Worker object with:

- `fetch` for Discord interactions at `/` and `/interactions`
- `queue` for background stat scraping
- `scheduled` for daily health logging

Required Worker secrets:

```bash
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_APPLICATION_ID
```

Optional Worker secret:

```bash
wrangler secret put DISCORD_BOT_OWNER_ID
```

When `DISCORD_BOT_OWNER_ID` is set to your Discord user ID, `/stats` refresh caps and refresh dedupe limits are bypassed for that user only. Owner-triggered refreshes also do not consume the tracked-player daily refresh marker.

Create the refresh queue before deploying:

```bash
bunx wrangler queues create teamanica-stat-refresh
```

The daily cron in `wrangler.jsonc` runs at `03:00 UTC`.

## Stats Refresh

`/stats` reads KV first. Fresh cache hits return immediately. Cache misses and stale cache refreshes enqueue a background job instead of scraping inline, with global guardrails of 1 tracked-player refresh/day and 3 refresh-triggering requests/day per executor. Responses now use paginated button components so users can navigate multiple stats sections without re-running the command.

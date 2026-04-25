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

Create the refresh queue before deploying:

```bash
bunx wrangler queues create teamanica-stat-refresh
```

The daily cron in `wrangler.jsonc` runs at `03:00 UTC`.

## Stats Refresh

`/stats` reads KV first. Cache misses and stale cache refreshes enqueue a background job instead of scraping inline. The Queue consumer scrapes stats.cc, writes KV, and persists the snapshot to D1.

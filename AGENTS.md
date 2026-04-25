# AGENTS.md

## Dev environment

- Runtime: **Bun**. Always use `bun` instead of `npm` or `node`.
- Framework: **Honocord** (custom Discord interactions layer). It is being partially rewritten — do not refactor, replace, or update it unless explicitly asked.
- ORM: **Drizzle** on top of Cloudflare D1. Never write raw SQL strings — use Drizzle query builder. Schema lives in `src/db/schema.ts`.
- Deploy target: Cloudflare Workers (interactions endpoint). No gateway, no WebSocket, no discord.js.

```bash
bun install              # install deps
bun run dev              # local dev via wrangler dev
bun run deploy           # deploy to Cloudflare Workers
bun run db:generate      # generate Drizzle migrations
bun run db:migrate       # apply migrations to D1
bun run register         # register Discord slash commands (run once after command changes)
bun run lint             # run oxlint
bun run fmt              # run oxfmt
```

## Testing

```bash
bun test                 # run all tests
bun test src/lib         # run a specific folder
```

- Write tests for any new lib function in `src/lib/`.
- Command handlers do not need unit tests — test the underlying lib functions they call.
- Fix all type errors and test failures before finishing a task.

## Code conventions

- TypeScript strict mode is on. No `any` unless absolutely unavoidable.
- Every external API call must handle failure gracefully — return `null`, never throw to the command handler.
- Interactions that call external APIs or the scraper **must** defer (`type: 5`) first, then follow up. Discord requires a response within 3 seconds.
- KV cache must be checked before D1 for any read-heavy operation (see `src/lib/cache.ts`).
- All scraping is offloaded to the **Cloudflare Queue consumer** — never inline in a command handler.

## Bindings (wrangler.toml)

| Binding    | Type  | Purpose                  |
| ---------- | ----- | ------------------------ |
| `Database` | D1    | Main database            |
| `Cache`    | KV    | Cache + sessions         |
| `Queue`    | Queue | Background stat scraping |

## Secrets (never commit — set via `wrangler secret put`)

```
DISCORD_PUBLIC_KEY
DISCORD_BOT_TOKEN
DISCORD_APPLICATION_ID
```

## Gotchas

- **ELO is global per player per game** — never per server. The `players` table has one row per (username, platform, game). `guild_players` links servers to players.
- **R6 scraping** — once per player on add, once per day max on refresh. Deduplicate using a `scrape:{platform}:{username}` KV lock key (30min TTL) before enqueuing.
- **Never call external stat APIs during `/balance`** — balance reads only from D1/KV.
- **Daily match limits** are tracked in the `guild_limits` table. Check before recording any match.
- **Stat refresh** is capped at once per player per day at the application level, not just TTL.

## PR instructions

- Branch format: `feat/<name>`, `fix/<name>`, `chore/<name>`
- Run `bun test`, `bun run typecheck`, `oxlint .`, and `oxfmt --check .` before opening a PR.
- Keep PRs scoped — one feature or fix per PR.

## Linting and formatting

- Linter: **oxlint**. Run `oxlint .` — fix all errors before finishing a task. Warnings are acceptable but should not increase.
- Formatter: **oxfmt**. Run `oxfmt .` to format. Run `oxfmt --check .` in CI/before PR.
- Do not use eslint, prettier, or biome — oxlint and oxfmt are the only tools used here.
- Formatting is non-negotiable. Never submit code that fails `oxfmt --check`.

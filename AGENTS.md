# AGENTS.md

## Architecture

Parley is a competitive matchmaking and tournament platform — a **Go** engine-service
with TypeScript edge apps (Discord bot, landing, leaderboard bridge) on Cloudflare
Workers and Bun.

**The core is a monorepo of two halves** that share protobuf definitions:

```
proto/                     ← single source of truth (protobuf)
  ├── common/              → shared types (Game, Rank, Region, PlayerStats, Badge)
  ├── guild/               → guild settings RPCs
  ├── identity/            → account linking RPCs
  └── stats/               → stats.cc scraper RPCs

Go (cmd/parley + internal/) ← buf generate → gen/parley (pb + connect)

TypeScript (Bun workspaces) ← buf generate → packages/generated-ts
  apps/worker/             ← Cloudflare Worker: Hono, @parley/proto clients
  packages/runtime/        ← Discord API wrapper (Embeds & Components v2)
  packages/generated-ts/   ← @parley/proto: buf-generated TS + ConnectRPC clients
  packages/tsconfig-base/  ← Shared TS strict-mode base config
```

**Request flow**: Discord/Web → Cloudflare Worker (Hono) → ConnectRPC over HTTP → Go engine-service (Fiber v3) → Postgres (Bun/pgx) / Redis (optional) / external APIs.

**Internal engine wiring** (`cmd/parley/main.go`):

- Loads config from env (optional `.env` via godotenv), structured logging (slog + optional Axiom).
- `internal/db` — pgx pool, embedded SQL migrations (`migrations/`), Bun ORM models/repos.
- `internal/server` — Fiber v3 + connect-go handlers for all protobuf services; `GET /health`, `GET /ready`, `GET /stats/:username`.
- `internal/matchmaking` — Glicko-2, CPR, queue + background sweeper.
- `internal/stats` — backends, Redis/direct cache, scrape/fetch, Postgres persistence.
- Graceful degradation without `DATABASE_URL` (in-memory / limited RPCs) and without `REDIS_URL` (direct stats, no Redis leaderboard).

Subdirectory guides: [`proto/AGENTS.md`](proto/AGENTS.md) if present, [`apps/worker/AGENTS.md`](apps/worker/AGENTS.md), [`apps/landing/AGENTS.md`](apps/landing/AGENTS.md), [`apps/bridge/AGENTS.md`](apps/bridge/AGENTS.md), [`packages/runtime/AGENTS.md`](packages/runtime/AGENTS.md).

## Build & Run

### Go (engine-service)

| Command                                          | What it does                                                   |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `make build` / `go build -o parley ./cmd/parley` | Build engine binary                                            |
| `make test` / `go test ./...`                    | Unit tests                                                     |
| `make test-integration`                          | Integration tests (`-tags=integration`, Docker/testcontainers) |
| `make fmt` / `go fmt ./...`                      | Format Go                                                      |
| `make vet` / `go vet ./...`                      | Vet                                                            |
| `make lint`                                      | golangci-lint (when installed)                                 |
| `make proto` / `buf generate`                    | Regenerate `gen/parley` and TS clients                         |
| `make run`                                       | Build and run locally                                          |

### TypeScript (Turborepo, managed via `bun`)

| Command                         | What it does                    |
| ------------------------------- | ------------------------------- |
| `bun install`                   | Install workspace dependencies  |
| `bun run build`                 | `turbo run build`               |
| `bun run typecheck`             | Strict typecheck                |
| `bun run lint`                  | oxlint                          |
| `bun run format`                | oxfmt                           |
| `bun run test`                  | Per-package tests               |
| `bun run dev`                   | Dev servers                     |
| `cd apps/worker && bun run dev` | Wrangler dev for Discord worker |

### Proto generation

```bash
make proto
# TypeScript only:
cd packages/generated-ts && bun run generate
```

Output: `gen/parley/**` (Go), `packages/generated-ts/src/**` (TS). Do not hand-edit generated files.

### Database

Canonical schema is defined by SQL migrations in `/migrations` and mirrored in Bun models under `internal/db/models` and repos under `internal/repos`.

```bash
# Apply migrations at boot
RUN_MIGRATIONS=1 make run
```

### Environment setup

Copy `.env.example` to `.env`. Without `DATABASE_URL`, the engine runs in degraded mode. For production:

- `DATABASE_URL`, optional `REDIS_URL` (use full `redis://` URLs; bare `host:port` also works)
- `RUN_MIGRATIONS=1` when you want boot-time migrate
- `ENGINE_SERVICE_ADDR` (default `0.0.0.0:50051`)
- `DB_TLS=system` for managed Postgres; `accept-invalid` only for local self-signed certs

### Deploy

- **Engine**: `.github/workflows/deploy-engine.yml` builds the [`Dockerfile`](Dockerfile) and pushes `ghcr.io/<owner>/parley-engine` on `main`. Runtime pull/restart is outside CI.
- **Workers**: `.github/workflows/deploy-cloudflare-workers.yml` on `main`, or `bun run deploy` (Wrangler per app) locally.

## Linting & Formatting

- **Go**: `make fmt`, `make vet`, `make lint`
- **TypeScript**: `oxfmt .`, `oxlint`

## Code Style & Conventions

### Commenting

- No visual divider comments (`// ====`, etc.).
- Go: doc comments on exported symbols; explain _why_ in inline comments.
- TypeScript: TSDoc on public APIs where helpful.

### Go

- Avoid `panic` in library code; return errors. `cmd/parley` may `os.Exit(1)` only from `main` on fatal startup.
- Match existing patterns in `internal/handlers`, `internal/services`, `internal/repos`.

### TypeScript

- Strict mode, avoid `any`. Extend `@parley/tsconfig-base`.

### Discord

- Use `@parley/runtime` for embeds/components; see `DESIGN.md`.

### Database

Game-scoped tables use Postgres `games` enum (`r6` only in product scope). Domain timestamps: `bigint` epoch ms.

## Testing

- **Go**: `go test ./...`; integration `go test -tags=integration ./...` (Docker).
- **TypeScript**: `bun run test`; landing may use vitest for hooks.

## Companion Documents

- `DESIGN.md`, `SPEC.md`, migration SQL under `migrations/`

## CI

- `.github/workflows/ci.yml` — PRs to `main`: TypeScript lint/typecheck and Go `vet`/`test` (path-filtered jobs).
- `.github/workflows/deploy-engine.yml` — `main`: Docker image to GHCR on engine path changes.
- `.github/workflows/deploy-cloudflare-workers.yml` — `main`: Cloudflare Workers deploy on TS path changes.

## Workflow & PR Checklist

1. `make fmt && bun run format`
2. `make vet && make lint && bun run lint`
3. `make test && bun run test`
4. Add/update tests for new logic

## graphify

Knowledge graph at `graphify-out/`. Use `graphify query` for focused questions; run `graphify update .` after substantive code changes.

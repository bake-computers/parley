# AGENTS.md

## Architecture

Parley is a competitive matchmaking and tournament platform — a **Go** engine-service
with TypeScript edge apps (Discord bot, web) on Cloudflare Workers and Bun.

**The core is a monorepo of two halves** that share protobuf definitions:

```
proto/                     ← single source of truth (protobuf)
  ├── common/              → shared types (Game, Rank, PlayerStats, Badge)
  ├── guild/               → guild settings RPCs
  ├── identity/            → account linking RPCs
  └── stats/               → player stats RPCs (stats.cc API)

Go (cmd/parley + internal/) ← buf generate → gen/parley (pb + connect)

TypeScript (Bun workspaces) ← buf generate → packages/generated-ts
  apps/worker/             ← Cloudflare Worker: Hono, @parley/proto clients
  apps/docs/               ← Nimbus (Astro) user docs, served at docs.parley.bot
  packages/runtime/        ← Discord API wrapper (Embeds & Components v2)
  packages/generated-ts/   ← @parley/proto: buf-generated TS + ConnectRPC clients
  packages/tsconfig-base/  ← Shared TS strict-mode base config
```

**Request flow**: Discord/Web → Cloudflare Worker (Hono) → ConnectRPC over HTTP → Go engine-service (Fiber v3) → Postgres (Bun/pgx) / external APIs.

**Internal engine wiring** (`cmd/parley/main.go`):

- Loads config from env (optional `.env` via godotenv), structured logging (slog + optional Axiom).
- `internal/db` — pgx pool, embedded SQL migrations (`migrations/`), Bun ORM models/repos.
- `internal/server` — Fiber v3 + connect-go handlers for all protobuf services; `GET /health`, `GET /ready`, `GET /stats/:username`.
- `internal/matchmaking` — Glicko-2, CPR, eligibility checks.
- `internal/stats` — backends, snapshot-backed cache, scrape/fetch, Postgres persistence.
- Boot requires `DATABASE_URL` (fail fast if missing).

Subdirectory guides: [`proto/AGENTS.md`](proto/AGENTS.md) if present, [`apps/worker/AGENTS.md`](apps/worker/AGENTS.md), [`packages/runtime/AGENTS.md`](packages/runtime/AGENTS.md).

### Resist bloating central packages

`internal/server` and `cmd/parley/main.go` attract every new RPC and wire-up by default. Before adding to them, consider:

- An existing `internal/` package that is the right home (`matchmaking`, `stats`, `db`).
- A new `internal/<package>` for a genuinely new concern; refactor wiring as needed.

TS side: `apps/worker` route handlers stay thin — logic belongs in `packages/` or is delegated to the engine over RPC. Push back on changes that grow route files for logic that belongs elsewhere.

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

### TypeScript (Vite+, managed via `bun` / `vp`)

| Command                        | What it does                              |
| ------------------------------ | ----------------------------------------- |
| `bun install` / `vp install`   | Install workspace dependencies            |
| `vp run build`                 | `vp run -r --cache build` across packages |
| `vp run typecheck`             | Build deps then typecheck all packages    |
| `vp run lint` / `vp lint`      | Package lint / repo-wide Oxlint           |
| `vp run format` / `vp fmt`     | Format with Oxfmt                         |
| `vp run test`                  | Build deps then run package tests         |
| `vp run dev`                   | Parallel package dev servers              |
| `vp dev apps/web`              | Vite+ dev server for the web app only     |
| `cd apps/worker && vp run dev` | Wrangler dev for Discord worker           |
| `cd apps/docs && vp run dev`   | Astro dev server for user docs            |

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

Copy `.env.example` to `.env`. `DATABASE_URL` is required to boot. Any new env var must be added to `.env.example` in the same change; required vars fail fast at boot. For production:

- `DATABASE_URL`
- `RUN_MIGRATIONS=1` when you want boot-time migrate
- `ENGINE_SERVICE_ADDR` (default `0.0.0.0:50051`)
- `DB_TLS=system` for managed Postgres; `accept-invalid` only for local self-signed certs

### Deploy

- **Engine**: `.github/workflows/deploy-engine.yml` builds the [`Dockerfile`](Dockerfile) and pushes `ghcr.io/<owner>/parley-engine` on `main`. Runtime pull/restart is outside CI.
- **Workers**: `.github/workflows/deploy-cloudflare-workers.yml` on `main`, or `bun run deploy` (Wrangler per app) locally.
- **Docs**: same workflow deploys `apps/docs` as static assets to `docs.parley.bot` (custom domain).

## Linting & Formatting

- **Go**: `make fmt`, `make vet`, `make lint`
- **TypeScript**: `vp fmt`, `vp lint` / `vp check`

## Code Style & Conventions

### Dependencies

No new Go module or npm package for what the stdlib (or an already-installed dep) covers. Justify any new dependency in the PR description.

### Commenting

- No visual divider comments (`// ====`, etc.).
- If you need to write a paragraph-long comment to justify why the workaround is OK, the code is wrong - fix the code.
- Go: doc comments on exported symbols; explain _why_ in inline comments.
- TypeScript: TSDoc on public APIs where helpful.

### Go

- Avoid `panic` in library code; return errors. `cmd/parley` may `os.Exit(1)` only from `main` on fatal startup.
- Match existing patterns in `internal/handlers`, `internal/services`, `internal/repos`.
- Don't add small helpers that are called exactly once — inline them or let the caller own the logic.
- Prefer exhaustive `switch` on enum-like types over a silent `default` arm.
- Wrap errors with `%w` and add context at each layer; log at the RPC boundary, not every layer (no double-logging).
- No leftover `fmt.Println` debugging — use slog or delete it.

### File & module size

- Target files under ~500 LoC (excluding tests). Past ~800 LoC, add new functionality in a new file/package rather than extending the existing one.
- When extracting from a large file, move related tests and doc comments toward the new code so invariants stay with their owner.

### TypeScript

- Strict mode, avoid `any`. Extend `@parley/tsconfig-base`.
- Web: for internal API calls, reach for TanStack Start server functions first — only add a dedicated API route/handler when a server function genuinely doesn't fit (e.g. webhooks, third-party callbacks).

### Security

Validate input at the RPC and Discord-command edges; never trust client or Discord payloads deeper in the stack.

### Discord

- Use `@parley/runtime` for embeds/components; see `DESIGN.md`.

### Database

Game-scoped tables use Postgres `games` enum (`r6` only in product scope). Domain timestamps: `bigint` epoch ms.

- Never edit an already-applied migration — add a new one.
- Migrations are additive and reversible; one concern per file.

## Testing

- **Go**: `go test ./...`; integration `go test -tags=integration ./...` (Docker).
- **TypeScript**: `bun run test`; web may use vitest for hooks.

### Test authoring guidance

- Changes to engine behavior (matchmaking, stats, RPC handlers) MUST include a test for the changed behavior — prefer integration tests (`-tags=integration`) over unit tests for cross-component flows.
- Prefer asserting equality of whole structs over checking fields one by one.
- No test-only helpers in production code; put shared test fixtures in a `_test.go` file or a dedicated test-support package.
- Don't add tests for statically-defined constants, or negative tests for logic that was removed.

## Companion Documents

- `DESIGN.md`, `SPEC.md`, migration SQL under `migrations/`
- User-facing docs live in `apps/docs`; protocol/wire notes belong in `proto/` comments, not READMEs.

## CI

- `.github/workflows/ci.yml` — PRs to `main`: TypeScript lint/typecheck and Go `vet`/`test` (path-filtered jobs).
- `.github/workflows/deploy-engine.yml` — `main`: Docker image to GHCR on engine path changes.
- `.github/workflows/deploy-cloudflare-workers.yml` — `main`: Cloudflare Workers deploy on TS path changes.

## Code Review Rules

### Breaking changes

Check external integration surfaces before merging. Parley's are:

- `proto/` service and message definitions — wire-compatible only; never renumber or repurpose fields.
- ConnectRPC clients in `packages/generated-ts` (regenerate via `make proto` in the same change).
- Discord slash-command names/shapes users have already seen.
- Migration SQL — no destructive column/drop without a stated rollout plan.
- Config env vars read by `cmd/parley`.

### Change size guidance

- Mechanical changes: under ~800 changed lines. Complex logic: under ~500.
- Larger than that → split into reviewable stages; land the smallest coherent stage first.

### API surface

Keep exported Go symbols and package exports minimal. Avoid proliferating test-only helpers in non-test files.

## Workflow & PR Checklist

1. `make fmt && bun run format`
2. `make vet && make lint && bun run lint`
3. Run the smallest relevant test set for what changed (e.g. `go test ./internal/matchmaking/...`), not the full suite as routine. CI owns the full verification suite — don't replicate it locally.
4. Add/update tests for new logic
5. If `proto/` changed: `make proto` and commit regenerated output in the same change.

### Git commits

- Conventional Commits: `feat(scope):`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Small commits — one logical change each. More commits is fine; giant commits are not.
- Never push to `main` unless explicitly told. Default assumption: the work goes to a feature branch and a PR.

## graphify

Knowledge graph at `graphify-out/`. Use `graphify query` for focused questions; run `graphify update .` after substantive code changes.

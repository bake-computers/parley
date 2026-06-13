# AGENTS.md

## Architecture

Parley is a competitive matchmaking and tournament platform — a Rust backend
(engine-service) with a TypeScript web dashboard and Discord bot, running on
Cloudflare Workers and Bun.

**The core is a monorepo of two halves** that share protobuf definitions:

```
proto/                     ← single source of truth (protobuf)
  ├── common/              → shared types (Game, Rank, Region, PlayerStats, Badge)
  ├── guild/               → guild settings RPCs
  ├── identity/            → account linking RPCs
  └── stats/               → stats.cc scraper RPCs

Rust (single crate)       ← embed proto via protox in build.rs (no protoc needed)
  src/                     ← parley binary: Axum + ConnectRPC HTTP server
  src/db/                  ← Diesel schema, pool, models, repos

TypeScript (Bun workspaces) ← buf generate → packages/generated-ts
  apps/worker/             ← Cloudflare Worker: Hono REST API, @parley/proto clients
  packages/runtime/        ← Custom Discord API wrapper (Embeds & Components v2)
  packages/generated-ts/   ← @parley/proto: buf-generated TS + ConnectRPC clients
  packages/db/             ← @parley/db: FROZEN legacy Drizzle schema (see below)
  packages/tsconfig-base/  ← Shared TS strict-mode base config
```

**Request flow**: Discord/Web → Cloudflare Worker (Hono) → ConnectRPC over HTTP → Rust engine-service (Axum) → Postgres (Diesel-async) / external APIs.

**Internal engine wiring** (Rust binary `parley`, `src/main.rs`):

- `src/main.rs` — entry; loads `.env`, inits tracing, builds `AppContext`, spawns queue sweeper, calls `connect::build_router_with_context`, serves Axum on `:50051`.
- `src/context.rs` — `AppContext::from_env()` wires DB pool (Diesel-async + bb8), stats backend registry, Redis cache, leaderboard store, guild cache. Optional subsystems gracefully degrade to in-memory when `DATABASE_URL` / `REDIS_URL` are unset.
- `src/connect.rs` — builds the Axum router. Routes are **manually registered** as `POST /parley.{package}.{Service}/{Method}` (no macros or `nest_service`). Plus `GET /health` and `GET /ready`.
- **No `lib.rs`** — all 20+ modules are declared in `main.rs` (`mod handlers; mod db; mod matchmaking; …`). The crate has a single `[[bin]]` target; there is no shared library crate.

Subdirectory guides: [`src/AGENTS.md`](src/AGENTS.md), [`proto/AGENTS.md`](proto/AGENTS.md), [`migrations/AGENTS.md`](migrations/AGENTS.md), [`apps/worker/AGENTS.md`](apps/worker/AGENTS.md), [`apps/landing/AGENTS.md`](apps/landing/AGENTS.md), [`apps/bridge/AGENTS.md`](apps/bridge/AGENTS.md), [`packages/runtime/AGENTS.md`](packages/runtime/AGENTS.md), [`packages/runtime/src/builders/AGENTS.md`](packages/runtime/src/builders/AGENTS.md).

## Build & Run

### Rust (engine-service)

| Command                                 | What it does                                                         |
| --------------------------------------- | -------------------------------------------------------------------- |
| `cargo build`                           | Builds all crates + proto codegen via `build.rs` (protox, no protoc) |
| `cargo test`                            | Runs all unit + integration tests (some skip without `DATABASE_URL`) |
| `cargo test --lib`                      | Unit tests only (no DB needed)                                       |
| `cargo test --test migration_roundtrip` | Single integration test (needs `DATABASE_URL`)                       |
| `cargo run`                             | Starts the engine-service (needs `DATABASE_URL` or runs degraded)    |
| `cargo fmt`                             | Rust formatting                                                      |
| `cargo clippy -- -D warnings`           | Rust linting (warnings are errors)                                   |

### TypeScript (Turborepo, managed via `bun`)

| Command                         | What it does                                       |
| ------------------------------- | -------------------------------------------------- |
| `bun install`                   | Install all workspace dependencies                 |
| `bun run build`                 | `turbo run build` — builds all TS packages (tsc)   |
| `bun run typecheck`             | `turbo run typecheck` — type-checks all packages   |
| `bun run lint`                  | `turbo run lint` — oxlint across all packages      |
| `bun run lint:root`             | oxlint on root-level files only                    |
| `bun run format`                | `oxfmt --write .`                                  |
| `bun run format:check`          | `oxfmt --check .`                                  |
| `bun run test`                  | `turbo run test` — runs `bun test` in each package |
| `bun run dev`                   | `turbo run dev` — starts dev servers               |
| `cd apps/worker && bun run dev` | Start Cloudflare Worker locally (`wrangler dev`)   |

### Proto generation (TypeScript side)

```bash
cd packages/generated-ts && bun run generate   # runs `buf generate` from repo root
```

Output: `packages/generated-ts/src/{package}/{version}/*_pb.ts` (messages) and `*_connect.ts` (service descriptors). The Rust side compiles protos automatically via `build.rs` during `cargo build`.

Note: `engine/v1/` and `ocr/v1/` generated TS files exist in `packages/generated-ts/src/` but have no corresponding `.proto` source files in `proto/`. They are pre-generated artifacts — do not edit them directly.

### Database

The canonical schema is the hand-maintained Diesel bindings in `/src/db/schema.rs` (mirrors the SQL migrations exactly). The Diesel CLI output at `/src/schema.rs` is also present but the hand-maintained version is authoritative.

```bash
# Apply migrations locally
diesel setup --database-url postgres://localhost/parley_dev
diesel migration run

# Or set RUN_MIGRATIONS=1 and the service applies them at boot
```

**The `@parley/db` Drizzle package is FROZEN.** It is the legacy Parley v1 schema, retained only for remaining in-flight TypeScript consumers. Do not add tables, columns, or migrations there — edit the Diesel migrations instead. See `/docs/db.md` for the full schema, rename map (Drizzle→Diesel), and game discriminator convention.

### Environment setup

Copy `.env.example` to `.env`. The service runs in degraded (in-memory) mode without `DATABASE_URL`. For full functionality, set `DATABASE_URL` and optionally:

- `RUN_MIGRATIONS=1` — auto-apply migrations at boot
- `BRAWL_STARS_API_KEY` — enables Brawl Stars backend
- `ENGINE_SERVICE_ADDR` — listen address (default `0.0.0.0:50051`)

`DB_TLS=system` is the secure default for managed Postgres providers. Use `DB_TLS=accept-invalid` only for local dev with self-signed certs.

### Deploy

Cloudflare Worker deploys use Wrangler: `bun run deploy` (runs each app's `wrangler deploy` via Turbo).

## Linting & Formatting

All code must pass formatting and linting before a task is considered complete.

### Rust

- Format: `cargo fmt`
- Lint: `cargo clippy -- -D warnings` (warnings are hard errors)

### TypeScript

- Format: `oxfmt .`
- Lint: `oxlint`

**Oxlint config** (`oxlint.config.ts`): `correctness` → error, `suspicious`/`pedantic`/`perf` → warn, `style`/`restriction`/`nursery` → off. Notable enforced rules: `eqeqeq`, `curly`, `no-var`, `prefer-const`, `typescript/no-explicit-any` (warn), `unicorn/prefer-node-protocol`, `import/no-cycle`.

**Oxfmt config** (`oxfmt.config.ts`): 100 char width, 2-space indent, double quotes, trailing commas, no tabs.

## Code Style & Conventions

### Commenting

- Never use visual divider comments or ASCII art lines (`// ====`, `// ----`, `// ****`).
- Document public APIs with `///` (Rustdoc) or `/** ... */` (TSDoc).
- Inline comments (`//`) must explain _why_, not _what_.

### Rust

- No `.unwrap()` or `.expect()` except in test files. Handle `Result` and `Option` explicitly.
- The `parley` binary enables `mimalloc` by default (`default = ["mimalloc"]`).
- Release build: LTO thin, single codegen unit, stripped, panic=abort.
- Protobuf codegen uses `protox` (pure Rust) — no `protoc` required. If you add a `.proto` file, add it to `build.rs`.

### TypeScript

- Strict mode is enforced. Avoid `any`. Prefer functional, immutable patterns.
- All `tsconfig.json` files extend `@parley/tsconfig-base`. The base enables `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noUnusedLocals`/`noUnusedParameters`.
- `@total-typescript/ts-reset` is applied globally via `reset.d.ts`.

### Discord Integrations

- Never hardcode raw Discord emoji ID strings.
- UI construction must use the custom type-safe API wrapper in `@parley/runtime` for Embeds and Components v2.
- See `DESIGN.md` for the Discord embed design system and visual conventions.

### Database conventions

Every game-scoped table carries a `game games NOT NULL DEFAULT 'r6'` column (Postgres enum: `'r6'`, `'brawl_stars'`). Auth tables (`user`, `session`, `account`, `verification`) are game-agnostic. Composite unique indexes always include `game`. Adding a new game is a migration: `ALTER TYPE games ADD VALUE 'new_game'`.

Domain table timestamps use `bigint` epoch milliseconds (application-set). Better-auth tables use `timestamptz` (library convention).

## Testing

### Rust

- `cargo test` runs everything. Some integration tests skip if `DATABASE_URL` is unset (they print `[skip]`).
- `cargo test --lib` runs unit tests only — no DB needed, fast for local iteration.
- The `tests/` directory contains integration tests that mount the full router. The `perf_smoke.rs` test uses `wiremock` to simulate upstream services.
- The `migration_roundtrip` test applies and reverts all migrations against a real Postgres — set `DATABASE_URL` to a disposable database.

### TypeScript

- Run via `bun test` per package or `bun run test` (Turborepo) at root.
- Many packages currently have no tests (`echo 'No tests yet'`).
- **Two test frameworks in use**: `bun:test` everywhere by default; **`apps/landing` uses `vitest`** for React hooks (jsdom + `@testing-library/react`) via `apps/landing/vitest.config.ts`. Plain unit tests in `apps/landing/src/lib/*.test.ts` still use `bun:test`.
- **No external fixture files**. All test data is constructed inline in test code (e.g. Rust `stats_integration.rs::nuxt_html()` builds a Nuxt HTML string in code).

## Companion Documents

- `DESIGN.md` — Visual design system (colors, typography, Discord embed conventions, web platform layout).
- `SPEC.md` — Product specification (features, data model, architecture decisions).
- `docs/db.md` — Database schema documentation, rename map, indexes, stats cache strategy.

## CI

`.github/workflows/deploy.yml` is the only workflow. It runs on `blacksmith-2vcpu-ubuntu-2404` and is **Rust-only**: install protoc (vestigial — `build.rs` uses `protox`), build with `RUSTFLAGS="-C codegen-units=1"`, then SCP+SSH the binary to a bare-metal server. **No tests run in CI.** **No TS lint/typecheck/test** — TS deploys are manual via `wrangler deploy`. Triggered by `src/**`, `proto/**`, `Cargo.toml`, `Cargo.lock` path filters.

## Workflow & PR Checklist

1. Run `cargo fmt && oxfmt .` after modifying files.
2. Run `cargo clippy -- -D warnings && oxlint` — fix all errors.
3. Run `cargo test && bun run test` — all tests must pass.
4. Add or update tests for any new logic.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

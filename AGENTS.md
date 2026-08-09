# AGENTS.md

## Core Principles

- Choose the simplest implementation that fully meets requirements. Avoid speculative abstractions, indirection, and single-use helper functions.
- Do not preserve backward compatibility or leave legacy fallback layers. Cleanly delete obsolete paths.
- Lean on existing standard libraries and repo dependencies before adding new packages.
- Keep components modular. Route handlers in `apps/worker` stay thin; push business logic into `packages/` or delegate to Go over RPC.
- Resist central package bloat. Do not blindly dump new RPC wiring into `internal/server` or `cmd/parley/main.go` if a specialized `internal/` domain package fits better.
- Validate inputs strictly at edge RPCs and Discord command boundaries; never trust unformatted payloads deeper in the stack.

## Architecture & Code Boundaries

- **Stack**: Go engine-service (Fiber v3, pgx) + TypeScript edge apps (Bun, Cloudflare Workers, Hono) over ConnectRPC.
- **Protobuf**: `proto/` is the single source of truth. Run `make proto` when modifying schemas and commit generated Go/TS code in the same PR. Never hand-edit generated files.
- **Database**: PostgreSQL (pgx pool / Bun ORM). Schema defined in `/migrations`. Migrations are strictly additive and irreversible without a rollout plan. Never modify applied migrations. Timestamps are `bigint` epoch ms.

## Engineering Rules

- **Go**: Return wrapped errors (`%w`) and log only at the RPC boundary (no double-logging). Handle enums exhaustively without silent `default` cases. Avoid `panic`.
- **TypeScript**: Strict mode enabled; extend `@parley/tsconfig-base`. Zero `any`. Use TanStack Start server functions over custom web API routes where applicable.
- **Testing**: Behavioural and engine changes require integration tests (`-tags=integration`). Assert equality of full structs over individual fields. Put test fixtures in `_test.go` files.
- **Workflow**: Conventional Commits only (`feat:`, `fix:`, `refactor:`). Always work on feature branches; never push to `main`.

## Tools & Agent Skills

- **graphify**: Knowledge graph stored at `graphify-out/`. Run `graphify query` for deep code analysis and `graphify update .` after non-trivial architecture or code changes.
- **Issue Tracker**: Interact with GitHub Issues on `bake-computers/parley` via `gh`. Refer to `docs/agents/issue-tracker.md`.
- **Domain Docs**: Context stored in root `CONTEXT.md` and `docs/adr/`. Refer to `docs/agents/domain.md`.

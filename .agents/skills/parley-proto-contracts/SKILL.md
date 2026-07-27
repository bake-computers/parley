---
name: parley-proto-contracts
description: Use when editing .proto files, regenerating Go/TypeScript clients, importing ConnectRPC services in the Go engine or Cloudflare Worker, debugging proto-to-code mismatches, or wiring a new RPC end-to-end in the Parley monorepo.
---

# Parley Proto Contracts

## Overview

Protobuf definitions in `proto/` are the single source of truth. `buf generate` produces both Go (`gen/parley/`) and TypeScript (`packages/generated-ts/src/`) clients in one pass. Both outputs are committed to git alongside the proto change.

Packages under `proto/`: shared types in `common/`; RPC services in `guild`, `identity`, `matchmaking`, `stats`, `tournament`, `user`.

## When to use

- Adding or editing a service, RPC, message, or enum
- Investigating "field not found" / "method does not exist" errors after a regen
- Wiring a new ConnectRPC handler in Go or a new client in the Worker
- Understanding import paths or generated package aliases

## Quick reference

| Action                      | Location / command                                                          |
| --------------------------- | --------------------------------------------------------------------------- |
| Edit contract               | `proto/<svc>/v1/<svc>.proto`                                                |
| Regenerate Go + TS          | `make proto` (root), or `cd packages/generated-ts && bun run generate`      |
| Go messages                 | `gen/parley/<svc>/v1/<svc>.pb.go`                                           |
| Go connect handlers/clients | `gen/parley/<svc>/v1/<svc>v1connect/<svc>.connect.go`                       |
| Go import alias             | derived from `go_package` suffix `<alias>v1` (e.g. `identityv1`, `statsv1`) |
| TS output                   | `packages/generated-ts/src/<svc>/v1/<svc>_pb.ts` (messages + service descs) |
| TS barrel                   | `import { ServiceName } from "@parley/proto"`                               |
| Hand-written TS (keep)      | `packages/generated-ts/src/index.ts` — re-exports per service               |

## Critical patterns

**`buf.gen.yaml` has 3 plugins.** `bufbuild/es` → `packages/generated-ts/src`; `protocolbuffers/go` + `connectrpc/go` → `gen/parley`. Connect-ES v2 generates service descriptors via protobuf-es (no separate connect-es plugin); TS has `*_pb.ts` only, not `*_connect.ts`.

**Go import alias comes from `go_package` suffix.** Every proto declares
`option go_package = "github.com/bake-computers/parley/gen/parley/<svc>/v1;<alias>v1";`
The `<alias>v1` is the import alias used in Go (`identityv1`, `statsv1`, `matchmakingv1`).
Connect handlers are a separate import without an alias: `import ".../identity/v1/identityv1connect"`.

**Worker uses cached factory helpers, not direct `createClient`.** Always call the factories in `apps/worker/src/transport.ts`:
`getIdentityClient`, `getGuildSettingsClient`, `getMatchmakingClient`, `getStatsClient`, `getTournamentClient`, `getUserSettingsClient`.
Each caches per `baseUrl+cacheKey`, wraps fetch with `withFollowRedirect` (Cloudflare's `fetch` rejects `redirect: "error"`, which connect-web hardcodes), and sets `jsonOptions: { enumAsInteger: true }` to match Go's proto3 JSON integers.

**Generated code is committed.** Both `gen/parley/**` and
`packages/generated-ts/src/**` (except the hand-written barrel
`src/index.ts`) are tracked in git. Regen and commit in the same PR as the
proto change. `buf.gen.yaml` and `buf.yaml` are config, not generated.

**Shared types live in `common/v1/types.proto`.** `Game`, `Rank`, `Region`,
`PlayerStats`, `Badge` / `BadgeCategory`, `Error` (and related rank enums) are
imported by other services via `import "common/v1/types.proto";`. New
cross-service types belong there, not in a service-specific file.

## Common mistakes

- Hand-editing `gen/parley/**` or `packages/generated-ts/src/**` — lost on next regen
- Forgetting to regen after a proto change — Go and TS drift, runtime "unknown field" errors
- Calling `createClient(Service, transport)` directly in a Worker handler — bypasses the redirect fix and the client cache
- Assuming proto3 enums round-trip as strings over JSON — Go sends integers; the `enumAsInteger: true` flag on the TS transport is required
- Adding a widely-used type to a service proto instead of `common/v1/types.proto`

## See also

- `README.md` §5.1 — service↔responsibility table
- `buf.gen.yaml` — the actual generation config (3 plugins: protobuf-es, go, connect-go)

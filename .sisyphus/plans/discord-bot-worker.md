# Discord Bot Worker — Foundational Build

## TL;DR

> **Quick Summary**: Transform `apps/worker` from a REST API into a Discord interaction worker. Mount `@parley/runtime`'s `ParleyClient` into Hono, regenerate guild/identity proto stubs, implement 4 core slash commands (`/ping`, `/help`, `/link`, `/profile`) with TDD, and deploy via Alchemy (alchemy.run) with placement optimized for the Dutch backend.

> **Deliverables**:
> - Regenerated `guild/v1` and `identity/v1` TypeScript proto stubs in `@parley/proto`
> - Discord interaction endpoint at `POST /interactions` via `ParleyClient`
> - 4 Discord slash commands: `/ping`, `/help`, `/link` (IdentityService), `/profile` (IdentityService)
> - `bun test` test suite with mock ConnectRPC clients
> - `alchemy.run.ts` deployment script with secrets management + Netherlands placement
> - Clean worker: old REST API routes removed

> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (proto) → T6 (transport) → T10-T13 (commands) → T14-T15 (deploy)

---

## Context

### Original Request
"Build the worker located in apps/worker to the discord bot in earlier commits with Hono and cloudflare workers, use alchemy (alchemy.run) for our deployment and management, use the @packages/runtime/ for the Core usage of the discord api, place the worker near skylink netherlands"

### Interview Summary
**Key Discussions**:
- **Scope**: Foundational Discord bot setup — mount `ParleyClient`, wire interaction endpoint, implement `/ping`, `/help`, `/link` (account linking), `/profile` (account lookup). Use IdentityService and GuildSettingsService RPCs. NOT full matchmaking/tournaments/stats.
- **Proto stubs**: Regenerate guild + identity TypeScript stubs via `buf generate`
- **Alchemy**: Set up from scratch — `alchemy.run.ts` deployment script with secrets management
- **Existing routes**: Remove all REST API routes (/health, /stats, /ocr) — Discord-only worker
- **Test strategy**: TDD with bun test — test infrastructure setup included
- **Deployment placement**: Near Skylink Netherlands data center where the Rust backend runs

**Research Findings**:
- `@parley/runtime` is a complete, production-quality Discord interaction runtime but has **never been wired into the worker**
- The worker currently has only 2 source files: `index.ts` (Hono REST API) and `ocr-test.ts` (OCR form)
- Guild/identity proto .proto files exist but TypeScript stubs were never generated — only stats, ocr, engine exist in `@parley/proto`
- `wrangler.jsonc` has only `ENGINE_SERVICE_URL` var — no Discord env vars
- Git history shows a rich Discord bot existed before with /stats, /team, /account, /help, matchmaking, cooldowns, analytics — all removed in a reset commit
- Alchemy's Worker API supports `placement: { hostname: "..." }` for regional placement (proximity to backend)

### Metis Review
**Identified Gaps** (addressed):
- **SPEC naming mismatch**: SPEC.md says `apps/bot` for Discord, but user explicitly wants `apps/worker` — deliberate deviation documented here
- **OCR route removal**: The `/ocr/file/:id` serves images to engine-service in local dev — removal confirmed by user ("Discord-only"); OCR testing requires alternative setup (out of scope)
- **Proto generation gaps**: 3 manual steps beyond `buf generate` needed (package.json exports, src/index.ts barrel, clean script) — included in T1
- **3-second Discord deadline**: All Rust backend RPC calls must `deferReply()` first — enforced in guardrails
- **Embed specifications**: Must follow DESIGN.md color/emoji conventions (error=#EF4444, success=#22C55E, info=#FFFFFF, warning=#F59E0B) — defined per command
- **Token security**: DISCORD_BOT_TOKEN must be a Cloudflare Workers Secret, NOT a plaintext env var — enforced in guardrails
- **Command registration lifecycle**: Commands registered at deploy time (alchemy.run.ts) or via separate script — T8 covers this
- **Skylink placement**: Alchemy requires `placement: { hostname: "<nl-backend-host>" }` — made configurable in T14
- **Bundle size**: Adding `@parley/runtime` + `discord-api-types` may push worker close to 1MB free tier — T15 verifies
- **Game parameter handling**: Identity RPCs require `game` — defaults to GAME_R6 for now, extensible later

---

## Work Objectives

### Core Objective
Transform `apps/worker` into a Discord interaction worker by mounting `@parley/runtime`'s `ParleyClient` into a Hono app, implementing 4 core slash commands that call the Rust engine-service via ConnectRPC, and deploying with Alchemy IaC.

### Concrete Deliverables
- `packages/generated-ts/src/guild/v1/guild_pb.ts` + `guild_connect.ts` — generated guild proto stubs
- `packages/generated-ts/src/identity/v1/identity_pb.ts` + `identity_connect.ts` — generated identity proto stubs
- `packages/generated-ts/src/index.ts` — updated barrel export with guild + identity
- `packages/generated-ts/package.json` — updated exports map
- `apps/worker/src/index.ts` — rewritten: Hono app mounting ParleyClient
- `apps/worker/src/transport.ts` — module-scope ConnectRPC transport factory
- `apps/worker/src/commands/ping.ts` — `/ping` slash command handler
- `apps/worker/src/commands/help.ts` — `/help` slash command handler
- `apps/worker/src/commands/link.ts` — `/link` slash command handler (IdentityService.LinkAccount)
- `apps/worker/src/commands/profile.ts` — `/profile` slash command handler (IdentityService.LookupByDiscord)
- `apps/worker/src/embeds.ts` — embed factory following DESIGN.md conventions
- `apps/worker/src/app.ts` — ParleyClient configuration + handler loading + export
- `apps/worker/wrangler.jsonc` — updated with Discord env vars (secrets)
- `apps/worker/.dev.vars` — local dev Discord credentials
- `apps/worker/package.json` — updated with @parley/runtime dependency + test script
- `apps/worker/src/__tests__/` — test suite with mock ConnectRPC clients
- `alchemy.run.ts` — deployment script at repo root
- `apps/worker/src/register-commands.ts` — or integrated deployment script

### Definition of Done
- [ ] `bun run build` succeeds in `apps/worker` (full typecheck + tsc)
- [ ] `bun test` passes all tests in `apps/worker` (mocked RPC clients)
- [ ] `cargo fmt && oxfmt .` passes (formatting)
- [ ] `cargo clippy -- -D warnings && oxlint` passes (linting)
- [ ] `buf generate` succeeds for guild + identity
- [ ] Worker starts locally with `bun run dev` and responds to Discord PING
- [ ] All 4 slash commands return correct embeds when tested with mock RPC responses
- [ ] `alchemy.run.ts` deploys successfully (dry-run verified)
- [ ] Bundle size < 1MB uncompressed (verified)
- [ ] Zero hardcoded emoji strings (all via `@parley/runtime` emoji catalog)

### Must Have
- Discord interaction endpoint (`POST /interactions`) with Ed25519 verification
- 4 slash commands: `/ping`, `/help`, `/link`, `/profile`
- IdentityService ConnectRPC integration (LinkAccount, LookupByDiscord)
- Guild/identity TypeScript proto stubs generated
- TDD test suite with bun test
- Alchemy deployment script with secret management
- Worker placement near Skylink Netherlands backend

### Must NOT Have (Guardrails)
- **NO** raw Discord emoji ID strings — must use `formatApplicationEmoji()`
- **NO** `DISCORD_BOT_TOKEN` in `wrangler.jsonc` vars (plain text) — must be Workers Secret
- **NO** additional commands beyond the 4 planned (no /stats, /team, /matchmaking, /leaderboard)
- **NO** over-validation of RPC inputs — Rust backend handles validation; pass through errors
- **NO** extra abstraction layers — `ParleyClient` already provides handler registration, middleware, and REST
- **NO** build-breaking dependency issues — verify `bun run build` after each dependency change
- **NO** serving the old REST API routes — `/health`, `/stats/*`, `/ocr/*` must be fully removed
- **NO** ignoring the 3-second Discord interaction deadline — use `deferReply()` for all RPC calls

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (worker had no tests)
- **Automated tests**: TDD (RED → GREEN → REFACTOR)
- **Framework**: bun test
- **Pattern**: Each command task writes failing test first, then implementation, then refactor

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: `bun test` — mock ConnectRPC clients with controlled responses
- **Worker integration**: `wrangler dev` + `curl` — test Discord interaction endpoint
- **Bundle analysis**: `wrangler deploy --dry-run` — verify bundle size

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, MAX PARALLEL):
├── T1: Proto stubs regeneration + @parley/proto exports update [quick]
├── T2: Worker dependencies + build verification [quick]
├── T3: Test infrastructure setup [quick]
├── T4: Worker skeleton cleanup [quick]
└── T5: Discord environment configuration [quick]

Wave 2 (After Wave 1 — core integration):
├── T6: ConnectRPC transport factory [quick]
├── T7: ParleyClient Hono integration [deep]
└── T8: Command registration flow [quick]

Wave 3 (After Wave 2 — commands, MAX PARALLEL):
├── T9: /ping command (TDD) [quick]
├── T10: /help command (TDD) [deep]
├── T11: /link command — IdentityService.LinkAccount (TDD) [deep]
└── T12: /profile command — IdentityService.LookupByDiscord (TDD) [deep]

Wave 4 (After Wave 3 — deployment + polish):
├── T13: Alchemy deployment script [unspecified-high]
├── T14: Worker placement + Skylink Netherlands config [quick]
└── T15: Bundle size analysis + optimization [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]
```

**Critical Path**: T1 → T6 → T11/T12 → T14 → F1-F4
**Parallel Speedup**: ~65% faster than sequential (waves 1, 3, and FINAL run in parallel)
**Max Concurrent**: 5 (Wave 1), 4 (Wave 3), 4 (Wave FINAL)

### Agent Dispatch Summary

| Wave | Tasks | Profiles |
|---|---|---|
| **1** | T1-T5 (5) | T1-T5 → `quick` |
| **2** | T6-T8 (3) | T6 → `quick`, T7 → `deep`, T8 → `quick` |
| **3** | T9-T12 (4) | T9 → `quick`, T10 → `deep`, T11 → `deep`, T12 → `deep` |
| **4** | T13-T15 (3) | T13 → `unspecified-high`, T14 → `quick`, T15 → `quick` |
| **FINAL** | F1-F4 (4) | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. **Proto stubs regeneration + @parley/proto exports update**

  **What to do**:
  - Run `cd packages/generated-ts && bun run generate` to generate guild + identity TypeScript stubs
  - Verify files created: `src/guild/v1/guild_pb.ts`, `src/guild/v1/guild_connect.ts`, `src/identity/v1/identity_pb.ts`, `src/identity/v1/identity_connect.ts`
  - Update `packages/generated-ts/src/index.ts`: add re-exports for guild + identity services and messages
  - Update `packages/generated-ts/package.json` exports map: add `"./guild/v1/*": "./src/guild/v1/*"` and `"./identity/v1/*": "./src/identity/v1/*"`
  - Update `packages/generated-ts/package.json` clean script to include guild/identity dist paths
  - Run `bun run build` in `packages/generated-ts` to verify compilation
  - Verify imports work: `import { GuildSettingsService } from "@parley/proto/guild/v1/guild_connect.js"`

  **Must NOT do**:
  - Do NOT modify the `.proto` files — only generate stubs
  - Do NOT skip the exports/barrel updates — imports will fail silently

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Proto generation is a single command + mechanical config updates
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed — this is a build tool invocation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4, T5)
  - **Blocks**: T6, T11, T12
  - **Blocked By**: None

  **References**:
  - `packages/generated-ts/package.json:1-25` — Current exports map (lines 12-15) and scripts to update
  - `packages/generated-ts/src/index.ts:1-10` — Current barrel exports to extend
  - `proto/guild/v1/guild.proto` — GuildSettingsService definition (8 RPC methods)
  - `proto/identity/v1/identity.proto` — IdentityService definition (4 RPC methods)
  - `buf.gen.yaml` — Code generation config at repo root

  **Acceptance Criteria**:
  - [ ] `buf generate` exits 0 in `packages/generated-ts`
  - [ ] `bun run build` exits 0 in `packages/generated-ts`
  - [ ] `import { GuildSettingsService } from "@parley/proto/guild/v1/guild_connect.js"` resolves without error
  - [ ] `import { IdentityService } from "@parley/proto/identity/v1/identity_connect.js"` resolves without error

  **QA Scenarios**:

  ```
  Scenario: Happy path — proto stubs generate and compile
    Tool: Bash
    Preconditions: No existing guild/identity TS stubs in packages/generated-ts/src/
    Steps:
      1. cd packages/generated-ts && bun run generate
      2. bun run build
      3. ls src/guild/v1/ — verify guild_pb.ts and guild_connect.ts exist
      4. ls src/identity/v1/ — verify identity_pb.ts and identity_connect.ts exist
    Expected Result: All 4 files exist, build passes with exit code 0
    Failure Indicators: buf generate fails, build errors, missing files
    Evidence: .sisyphus/evidence/task-1-proto-generation.txt

  Scenario: Failure/edge case — import resolution
    Tool: Bash
    Preconditions: Proto stubs generated
    Steps:
      1. echo "import { GuildSettingsService } from '@parley/proto/guild/v1/guild_connect.js'; console.log(GuildSettingsService.typeName)" | npx tsx --eval -
    Expected Result: Logs "GuildSettingsService" without import errors
    Failure Indicators: "Cannot find module" error
    Evidence: .sisyphus/evidence/task-1-import-resolution.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-1-proto-generation.txt` — build output
  - [ ] `task-1-import-resolution.txt` — import test output

  **Commit**: YES (groups with T1 only)
  - Message: `feat(proto): regenerate guild + identity TypeScript stubs`
  - Files: `packages/generated-ts/src/{guild,identity}/**`, `packages/generated-ts/src/index.ts`, `packages/generated-ts/package.json`
  - Pre-commit: `bun run build` in packages/generated-ts

- [x] 2. **Worker dependencies + build verification**

  **What to do**:
  - Add `@parley/runtime` to `apps/worker/package.json` dependencies: `"@parley/runtime": "workspace:*"`
  - Add `neverthrow` if not already transitive
  - Run `bun install` at repo root to resolve workspace links
  - Run `bun run build` in `apps/worker` to verify clean compilation
  - Run `bun run typecheck` to verify TypeScript strict mode passes
  - Verify no circular dependency warnings

  **Must NOT do**:
  - Do NOT add `discord-api-types` directly — it's a transitive dep of `@parley/runtime`
  - Do NOT add `@connectrpc/connect` or `@connectrpc/connect-web` directly unless needed for new code beyond what runtime provides

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Package.json update + install + build verification
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed — mechanical dependency config

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4, T5)
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - `apps/worker/package.json:1-26` — Current dependencies to extend
  - `packages/runtime/package.json:1-23` — Runtime package name and version
  - `apps/worker/tsconfig.json:1-9` — TypeScript config

  **Acceptance Criteria**:
  - [ ] `@parley/runtime` listed in `apps/worker/package.json` dependencies
  - [ ] `bun install` exits 0
  - [ ] `bun run build` exits 0 in `apps/worker`
  - [ ] `bun run typecheck` exits 0 in `apps/worker`

  **QA Scenarios**:

  ```
  Scenario: Happy path — runtime dependency resolves and builds
    Tool: Bash
    Preconditions: Clean repo state
    Steps:
      1. bun install (at repo root)
      2. cd apps/worker && bun run build
      3. bun run typecheck
    Expected Result: Both commands exit 0, no type errors
    Failure Indicators: Build errors (missing module, type mismatch), install failures
    Evidence: .sisyphus/evidence/task-2-dependency-build.txt

  Scenario: Edge case — verify import works
    Tool: Bash
    Preconditions: Build passing
    Steps:
      1. echo "import { ParleyClient } from '@parley/runtime'; console.log(typeof ParleyClient)" > /tmp/import-test.ts
      2. npx tsx /tmp/import-test.ts
    Expected Result: Logs "function" (ParleyClient is a class/constructor)
    Failure Indicators: "Cannot find module" or type error
    Evidence: .sisyphus/evidence/task-2-import-test.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-2-dependency-build.txt` — build + typecheck output
  - [ ] `task-2-import-test.txt` — import test output

  **Commit**: YES (groups with T2 only)
  - Message: `chore(worker): add @parley/runtime dependency`
  - Files: `apps/worker/package.json`, `bun.lock`
  - Pre-commit: `bun run build` in apps/worker

- [x] 3. **Test infrastructure setup**

  **What to do**:
  - Create `apps/worker/src/__tests__/` directory
  - Create `apps/worker/src/__tests__/setup.ts` — mock helpers for ConnectRPC clients (create a `createMockClient` factory that returns typed Jest-style mocks)
  - Update `apps/worker/package.json` scripts: `"test": "bun test"`
  - Create mock fixtures for IdentityService responses (successful LinkAccount, successful LookupByDiscord, error responses)
  - Create a minimal smoke test that verifies test infrastructure works (`bun test` exits 0)
  - The mock helpers should allow: `mockClient.linkAccount.mockResolvedValue({ success: true, playerId: "abc" })`

  **Must NOT do**:
  - Do NOT require a running Rust backend for tests
  - Do NOT use real Discord API credentials in tests
  - Do NOT create test files for commands yet — just infrastructure

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating test scaffolding with mock patterns from existing codebase
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed — standard bun test setup

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4, T5)
  - **Blocks**: T9, T10, T11, T12
  - **Blocked By**: None

  **References**:
  - `packages/runtime/src/rest.ts:1-5` — Import patterns for neverthrow Result type
  - `packages/runtime/src/client.ts:190-260` — ParleyClient constructor and fetch method for understanding what needs mocking
  - `proto/identity/v1/identity.proto` — LinkAccountResponse and LookupByDiscordResponse message shapes for mock fixtures
  - `AGENTS.md:88-100` — Testing conventions (bun test per package)

  **Acceptance Criteria**:
  - [ ] `apps/worker/src/__tests__/setup.ts` exists with mock factory
  - [ ] `bun test` exits 0 (smoke test passes)
  - [ ] `package.json` test script updated to `"bun test"`

  **QA Scenarios**:

  ```
  Scenario: Happy path — test infrastructure works
    Tool: Bash
    Preconditions: T2 complete (dependencies installed)
    Steps:
      1. cd apps/worker && bun test
    Expected Result: At least 1 test passes, exit code 0
    Failure Indicators: No tests found, test framework error
    Evidence: .sisyphus/evidence/task-3-test-infra.txt

  Scenario: Edge case — mock IdentityService works
    Tool: Bash
    Preconditions: Mock helpers created
    Steps:
      1. Write a quick inline test that creates a mock IdentityService client
      2. Call mockClient.linkAccount({ discordUserId: "123", game: 1, username: "test", platform: 0 })
      3. Assert result.success === true
    Expected Result: Test passes, mock resolves correctly
    Failure Indicators: Mock type errors, test assertion failures
    Evidence: .sisyphus/evidence/task-3-mock-test.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-3-test-infra.txt` — `bun test` output
  - [ ] `task-3-mock-test.txt` — mock test output

  **Commit**: YES (groups with T3 only)
  - Message: `test(worker): add test infrastructure with mock ConnectRPC helpers`
  - Files: `apps/worker/src/__tests__/setup.ts`, `apps/worker/package.json`
  - Pre-commit: `bun test` in apps/worker

- [x] 4. **Worker skeleton cleanup**

  **What to do**:
  - Rewrite `apps/worker/src/index.ts`: remove ALL existing REST API routes (/health, /stats/:username, /stats/:username/collection, /ocr/*, 404 catch-all)
  - Keep minimal Hono app skeleton:
    ```ts
    import { Hono } from "hono";
    const app = new Hono();
    export default app;
    ```
  - Delete `apps/worker/src/ocr-test.ts` (OCR routes removed per "Discord-only" decision)
  - Verify `bun run build` still passes with empty app
  - Verify `bun run dev` starts without errors (but returns 404 on all paths)

  **Must NOT do**:
  - Do NOT remove `wrangler.jsonc` or `.dev.vars` — only source files
  - Do NOT change tsconfig or package.json scripts
  - Do NOT add Discord routes yet — T7 handles ParleyClient integration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Removing code is straightforward — 2 files to delete/rewrite
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T5)
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - `apps/worker/src/index.ts:1-123` — Current file to rewrite
  - `apps/worker/src/ocr-test.ts:1-189` — File to delete

  **Acceptance Criteria**:
  - [ ] `apps/worker/src/index.ts` contains only Hono app skeleton (no REST routes)
  - [ ] `apps/worker/src/ocr-test.ts` deleted
  - [ ] `bun run build` exits 0
  - [ ] `bun run dev` starts without errors

  **QA Scenarios**:

  ```
  Scenario: Happy path — clean worker builds and starts
    Tool: Bash
    Preconditions: T2 complete
    Steps:
      1. cd apps/worker && bun run build
      2. bun run dev (in background, capture PID)
      3. curl -s http://localhost:8787/health → expect 404
      4. curl -s http://localhost:8787/stats/test → expect 404
      5. Kill the dev server
    Expected Result: Build succeeds, dev server starts, old routes return 404
    Failure Indicators: Build errors, dev server crash, old routes still return 200
    Evidence: .sisyphus/evidence/task-4-cleanup.txt

  Scenario: Edge case — ocr-test.ts is deleted
    Tool: Bash
    Preconditions: None
    Steps:
      1. test -f apps/worker/src/ocr-test.ts && echo "EXISTS" || echo "REMOVED"
    Expected Result: "REMOVED"
    Failure Indicators: "EXISTS" (file not deleted)
    Evidence: .sisyphus/evidence/task-4-cleanup.txt (appended)
  ```

  **Evidence to Capture**:
  - [ ] `task-4-cleanup.txt` — build output + curl tests

  **Commit**: YES (groups with T4 only)
  - Message: `refactor(worker): remove REST API routes, prepare for Discord bot`
  - Files: `apps/worker/src/index.ts`, `apps/worker/src/ocr-test.ts` (deleted)
  - Pre-commit: `bun run build` in apps/worker

- [x] 5. **Discord environment configuration**

  **What to do**:
  - Update `apps/worker/wrangler.jsonc`:
    - Add `DISCORD_APPLICATION_ID` to vars (plain text — safe for ID)
    - Add `DISCORD_PUBLIC_KEY` as a comment indicating it should be a secret
  - Update `apps/worker/.dev.vars`:
    - Add `DISCORD_PUBLIC_KEY=your_public_key_here`
    - Add `DISCORD_BOT_TOKEN=your_bot_token_here`
    - Add `DISCORD_APPLICATION_ID=your_application_id_here`
    - Keep `ENGINE_SERVICE_URL=http://localhost:50051`
  - Update `apps/worker/.dev.vars.example`:
    - Add all Discord env var entries with placeholder comments
  - Add type-safe env bindings type to worker source (Hono Bindings type)

  **Must NOT do**:
  - Do NOT put `DISCORD_BOT_TOKEN` or `DISCORD_PUBLIC_KEY` in `wrangler.jsonc` vars — tokens are secrets
  - Do NOT commit real credentials — `.dev.vars` is gitignored but check anyway
  - Do NOT hardcode default values for secrets — use placeholder comments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config file updates with well-known env var patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T4)
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - `apps/worker/wrangler.jsonc:1-10` — Current config to extend
  - `apps/worker/.dev.vars.example:1` — Current template
  - `packages/runtime/src/types/index.ts:18-24` — DiscordRuntimeEnv interface (DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_TOKEN, DISCORD_APPLICATION_ID)

  **Acceptance Criteria**:
  - [ ] `wrangler.jsonc` has `DISCORD_APPLICATION_ID` in vars
  - [ ] `.dev.vars` has all 4 Discord env vars (DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_BOT_OWNER_ID)
  - [ ] `.dev.vars.example` has all Discord env vars with placeholder comments
  - [ ] No token values in `wrangler.jsonc` vars (only application ID)

  **QA Scenarios**:

  ```
  Scenario: Happy path — dev vars template is complete
    Tool: Bash
    Preconditions: None
    Steps:
      1. cat apps/worker/.dev.vars.example | grep DISCORD
    Expected Result: Shows DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID with placeholder comments
    Failure Indicators: Missing entries, actual token values exposed
    Evidence: .sisyphus/evidence/task-5-dev-vars.txt

  Scenario: Safety check — no secrets in wrangler.jsonc
    Tool: Bash
    Preconditions: Config updated
    Steps:
      1. cat apps/worker/wrangler.jsonc | grep -i "DISCORD_BOT_TOKEN\|DISCORD_PUBLIC_KEY\|token"
    Expected Result: No matches OR only in comments
    Failure Indicators: Secrets found in vars section
    Evidence: .sisyphus/evidence/task-5-wrangler-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-5-dev-vars.txt` — dev vars template content
  - [ ] `task-5-wrangler-check.txt` — secrets safety check

  **Commit**: YES (groups with T5 only)
  - Message: `chore(worker): add Discord environment variable configuration`
  - Files: `apps/worker/wrangler.jsonc`, `apps/worker/.dev.vars.example`
  - Pre-commit: `bun run typecheck` in apps/worker

---

- [x] 6. **ConnectRPC transport factory**

  **What to do**:
  - Create `apps/worker/src/transport.ts`
  - Implement a module-scope transport factory that creates and caches ConnectRPC clients for:
    - `IdentityService` (from `@parley/proto/identity/v1/identity_connect.js`)
    - `GuildSettingsService` (from `@parley/proto/guild/v1/guild_connect.js`)
  - Use the pattern from the old `index.ts:createStatsClient` but at module scope (not per-request):
    - `createConnectTransport({ baseUrl, jsonOptions: { enumAsInteger: true } })`
    - `createClient(ServiceDescriptor, transport)`
  - The factory should accept `baseUrl` parameter (from env) and return cached clients
  - Handle `baseUrl` changes gracefully (e.g., env var updates between requests)
  - Export typed client getters: `getIdentityClient(baseUrl)`, `getGuildSettingsClient(baseUrl)`

  **Must NOT do**:
  - Do NOT create a new transport per request — reuse for latency savings
  - Do NOT hardcode `http://localhost:50051` — always from env

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward factory pattern adapting existing code
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7, T8)
  - **Blocks**: T11, T12
  - **Blocked By**: T1 (needs proto stubs to exist)

  **References**:
  - `apps/worker/src/index.ts:20-35` — Existing createStatsClient pattern to adapt
  - `packages/generated-ts/src/stats/v1/stats_connect.ts` — Example ConnectRPC service descriptor pattern
  - `proto/identity/v1/identity.proto` — IdentityService RPC signatures
  - `proto/guild/v1/guild.proto` — GuildSettingsService RPC signatures

  **Acceptance Criteria**:
  - [ ] `apps/worker/src/transport.ts` exists with factory function
  - [ ] `getIdentityClient()` returns typed `Client<typeof IdentityService>`
  - [ ] `getGuildSettingsClient()` returns typed `Client<typeof GuildSettingsService>`
  - [ ] Transport created once and cached (not per-request)
  - [ ] `bun run build` exits 0

  **QA Scenarios**:

  ```
  Scenario: Happy path — transport factory creates valid clients
    Tool: Bash (bun repl)
    Preconditions: T1 and T2 complete, transport.ts exists
    Steps:
      1. bun -e "import { getIdentityClient } from './apps/worker/src/transport.ts'; const c = getIdentityClient('http://localhost:50051'); console.log(c.typeName)"
    Expected Result: Logs the service type name (e.g., "IdentityService")
    Failure Indicators: Import error, client creation throws, typeName is undefined
    Evidence: .sisyphus/evidence/task-6-transport.txt

  Scenario: Edge case — caching works (same baseUrl returns same client)
    Tool: Bash (bun repl)
    Preconditions: Transport factory exists
    Steps:
      1. bun -e "import { getIdentityClient } from './apps/worker/src/transport.ts'; const a = getIdentityClient('http://localhost:50051'); const b = getIdentityClient('http://localhost:50051'); console.log(a === b)"
    Expected Result: "true" (same reference)
    Failure Indicators: "false" (new client created per call)
    Evidence: .sisyphus/evidence/task-6-cache.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-6-transport.txt` — client creation test
  - [ ] `task-6-cache.txt` — caching test

  **Commit**: YES (groups with T6 only)
  - Message: `feat(worker): add module-scope ConnectRPC transport factory`
  - Files: `apps/worker/src/transport.ts`
  - Pre-commit: `bun run build && bun run typecheck` in apps/worker

- [x] 7. **ParleyClient Hono integration**

  **What to do**:
  - Create `apps/worker/src/app.ts` — the main Discord bot application:
    - Import `ParleyClient` from `@parley/runtime`
    - Create a configured ParleyClient instance
    - Define the `Env` bindings type (extends `DiscordRuntimeEnv` with `ENGINE_SERVICE_URL`)
    - Export a function `createApp()` that returns the configured client
  - Rewrite `apps/worker/src/index.ts` to integrate ParleyClient with Hono:
    - Define Hono app with typed `Bindings` (Discord env + ENGINE_SERVICE_URL)
    - Mount ParleyClient at `POST /interactions` and `GET /interactions`
    - The ParleyClient handles its own routing internally (GET → health, POST / → interactions, POST /webhook → webhooks)
    - Use Hono's `app.fetch` pattern to delegate all requests to ParleyClient
  - Verify the worker responds to `GET /` with "parley worker is running" (ParleyClient's built-in behavior)

  **Must NOT do**:
  - Do NOT re-implement request verification — ParleyClient handles Ed25519
  - Do NOT add command handlers yet — T9-T12 implement commands
  - Do NOT mount ParleyClient at paths other than `/` and `/interactions`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration of two systems (Hono + ParleyClient) requires understanding both APIs and the Cloudflare Workers request lifecycle
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T8)
  - **Blocks**: T9, T10, T11, T12
  - **Blocked By**: T2 (dependencies), T4 (clean skeleton), T5 (env config)

  **References**:
  - `packages/runtime/src/client.ts:257-327` — ParleyClient.fetch() method — the main entry point, handles routing internally
  - `packages/runtime/src/types/index.ts:18-24` — DiscordRuntimeEnv interface for Bindings type
  - `apps/worker/src/index.ts:1-14` — Current Hono app pattern to adapt
  - `DESIGN.md:33-39` — Components v2 mandate, interaction design guidelines

  **Acceptance Criteria**:
  - [ ] `apps/worker/src/app.ts` exports a configured ParleyClient
  - [ ] `apps/worker/src/index.ts` delegates requests to ParleyClient
  - [ ] `GET /` returns "parley worker is running" (200)
  - [ ] `POST /interactions` with invalid signature returns 401 (via ParleyClient)
  - [ ] `bun run build` + `bun run typecheck` pass
  - [ ] `bun run dev` starts and serves on port 8787

  **QA Scenarios**:

  ```
  Scenario: Happy path — worker health check
    Tool: Bash (curl)
    Preconditions: T5 complete (env vars), dev server running
    Steps:
      1. cd apps/worker && bun run dev (background)
      2. sleep 3
      3. curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/
    Expected Result: "200"
    Failure Indicators: 404, 500, connection refused
    Evidence: .sisyphus/evidence/task-7-health.txt

  Scenario: Edge case — invalid signature returns 401
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/interactions -H "Content-Type: application/json" -d '{"type":1}'
    Expected Result: "401" (signature missing/invalid)
    Failure Indicators: 200 (should reject unsigned requests)
    Evidence: .sisyphus/evidence/task-7-auth.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-7-health.txt` — curl health check
  - [ ] `task-7-auth.txt` — signature rejection test

  **Commit**: YES (groups with T7 only)
  - Message: `feat(worker): integrate ParleyClient into Hono for Discord interactions`
  - Files: `apps/worker/src/index.ts`, `apps/worker/src/app.ts`
  - Pre-commit: `bun run build && bun run typecheck && bun test` in apps/worker

- [x] 8. **Command registration flow**

  **What to do**:
  - Create `apps/worker/src/register-commands.ts` — a standalone script (not a worker handler):
    - Import all command handlers (from T9-T12)
    - Read `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` from env
    - Call `registerApplicationCommands(token, applicationId, ...handlers)`
    - Exit 0 on success, 1 on failure with error details
  - Add npm script to `apps/worker/package.json`: `"register-commands": "bun run src/register-commands.ts"`
  - Document in code comments: this script is idempotent (PUT overwrites), safe to run on every deploy
  - Verify the script lists all 4 commands after registration (use `DiscordRestClient.listApplicationCommands()`)

  **Must NOT do**:
  - Do NOT register commands at worker cold start — registration is a deploy-time operation
  - Do NOT hardcode guild IDs for command registration — register as global commands
  - Do NOT register commands that don't exist yet — T9-T12 must be complete first

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standalone script using existing `registerApplicationCommands` from runtime
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6, T7)
  - **Blocks**: T14 (deployment flow references this)
  - **Blocked By**: T7 (needs app.ts with handlers loaded)

  **References**:
  - `packages/runtime/src/register.ts:42-106` — registerApplicationCommands function and its options
  - `packages/runtime/src/index.ts:98-101` — Exported register functions
  - `packages/runtime/src/rest.ts:150-155` — DiscordRestClient constructor (token, fetcher, apiBaseUrl)

  **Acceptance Criteria**:
  - [ ] `apps/worker/src/register-commands.ts` exists
  - [ ] `package.json` has `register-commands` script
  - [ ] Script reads env vars and calls registerApplicationCommands with all 4 handlers
  - [ ] `bun run typecheck` passes on the script

  **QA Scenarios**:

  ```
  Scenario: Happy path — dry run verification (no real Discord call)
    Tool: Bash
    Preconditions: T7-T12 complete (all commands exist)
    Steps:
      1. bun run typecheck (in apps/worker)
      2. bun run build
    Expected Result: Both exit 0, register-commands.ts compiles without errors
    Failure Indicators: Type errors in register-commands.ts
    Evidence: .sisyphus/evidence/task-8-register-compiles.txt

  Scenario: Edge case — handles missing token gracefully
    Tool: Bash
    Preconditions: T7 complete
    Steps:
      1. DISCORD_BOT_TOKEN="" DISCORD_APPLICATION_ID="" bun run src/register-commands.ts 2>&1; echo "EXIT: $?"
    Expected Result: EXIT: 1 with error message about missing credentials
    Failure Indicators: EXIT: 0 (failed silently), crash without message
    Evidence: .sisyphus/evidence/task-8-missing-token.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-8-register-compiles.txt` — build output
  - [ ] `task-8-missing-token.txt` — error handling test

  **Commit**: YES (groups with T8 only)
  - Message: `feat(worker): add command registration script`
  - Files: `apps/worker/src/register-commands.ts`, `apps/worker/package.json`
  - Pre-commit: `bun run typecheck` in apps/worker

- [x] 9. **`/ping` command (TDD)**

  **What to do**:
  - RED: Write failing test in `apps/worker/src/__tests__/ping.test.ts`:
    - Create a mock ChatInputCommandInteraction
    - Expect `reply()` to be called with a Pong message
  - GREEN: Implement `apps/worker/src/commands/ping.ts`:
    - Create a `SlashCommand` named "ping" with description "Check if the bot is responsive"
    - Handler calls `interaction.reply("Pong! 🏓")` (ephemeral)
  - REFACTOR: Clean up code, ensure consistency with HELP command patterns
  - Register the command in `apps/worker/src/app.ts` via `client.loadHandlers(pingCommand)`

  **Must NOT do**:
  - Do NOT call any RPCs — ping is a local health check
  - Do NOT use embed — simple text reply is fine for ping

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial command — no RPCs, no embeds, minimal logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T10, T11, T12)
  - **Blocks**: None (leaf task)
  - **Blocked By**: T3 (test infra), T7 (ParleyClient integration)

  **References**:
  - `packages/runtime/src/utils/handlers/slash-command.ts` — SlashCommand class API (setName, setDescription, addHandler, execute)
  - `packages/runtime/src/interactions/chat-input.ts` — ChatInputCommandInteraction reply method
  - `DESIGN.md:48-56` — Embed color/emoji conventions (though ping uses simple text)

  **Acceptance Criteria**:
  - [ ] Test file: `apps/worker/src/__tests__/ping.test.ts` exists
  - [ ] `bun test` passes — ping test assertions verified
  - [ ] Command registered in `app.ts` via `loadHandlers()`
  - [ ] `/ping` returns ephemeral "Pong! 🏓"

  **QA Scenarios**:

  ```
  Scenario: Happy path — /ping responds with Pong
    Tool: Bash (bun test)
    Preconditions: Mock interaction created
    Steps:
      1. bun test apps/worker/src/__tests__/ping.test.ts
      2. Assert reply called with string containing "Pong"
    Expected Result: Test passes, reply contains "Pong"
    Failure Indicators: Test fails, reply not called, wrong message
    Evidence: .sisyphus/evidence/task-9-ping-test.txt

  Scenario: Edge case — ping is ephemeral
    Tool: Bash (bun test)
    Preconditions: Mock interaction created
    Steps:
      1. Assert reply called with forceEphemeral=true or flags include EPHEMERAL
    Expected Result: Reply is ephemeral
    Failure Indicators: Reply is public (visible to all)
    Evidence: .sisyphus/evidence/task-9-ping-ephemeral.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-9-ping-test.txt` — test output
  - [ ] `task-9-ping-ephemeral.txt` — ephemeral assertion

  **Commit**: YES (groups with T9 only)
  - Message: `feat(worker): add /ping slash command with TDD`
  - Files: `apps/worker/src/commands/ping.ts`, `apps/worker/src/__tests__/ping.test.ts`, `apps/worker/src/app.ts`
  - Pre-commit: `bun test && bun run typecheck` in apps/worker

- [x] 10. **`/help` command (TDD)**

  **What to do**:
  - RED: Write failing test in `apps/worker/src/__tests__/help.test.ts`:
    - Mock ChatInputCommandInteraction
    - Expect reply with an info embed (color #FFFFFF, parley_info emoji)
    - Embed should list all 4 commands with descriptions
  - GREEN: Implement `apps/worker/src/commands/help.ts`:
    - Create a `SlashCommand` named "help" with description "List all available commands"
    - Build an info embed using `EmbedBuilder` with title "Parley Commands" and fields for each command
    - Handler calls `interaction.reply({ embeds: [embed.toJSON()] })` (ephemeral)
  - REFACTOR: Verify embed follows DESIGN.md info convention (#FFFFFF color, parley_info emoji)
  - Register in `app.ts`

  **Must NOT do**:
  - Do NOT paginate help (over-engineering for 4 commands)
  - Do NOT call any RPCs — help is static content
  - Do NOT hardcode emoji IDs — use `formatApplicationEmoji(catalog, "information")`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Embed building with DESIGN.md conventions, emoji catalog integration
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T9, T11, T12)
  - **Blocks**: None
  - **Blocked By**: T3 (tests), T7 (ParleyClient)

  **References**:
  - `DESIGN.md:51-53` — Info embed convention: `#FFFFFF` color, `parley_info` emoji
  - `packages/runtime/src/builders/embed.ts` — EmbedBuilder API (setTitle, setDescription, setColor, setFooter, addFields, toJSON)
  - `packages/runtime/src/utils/emojis.ts:20-25` — formatApplicationEmoji function
  - `packages/runtime/src/utils/emojis.ts:14-15` — APP_EMOJI_NAMES (includes "information")
  - `packages/runtime/src/builders/index.ts:60-71` — JSONEncodable interface for embed.toJSON()

  **Acceptance Criteria**:
  - [ ] Test file: `apps/worker/src/__tests__/help.test.ts` passes
  - [ ] Help embed has color `0xFFFFFF` (info)
  - [ ] Help embed has at least 4 fields (one per command)
  - [ ] Command registered in `app.ts`

  **QA Scenarios**:

  ```
  Scenario: Happy path — /help returns info embed with all commands
    Tool: Bash (bun test)
    Preconditions: Mock interaction created
    Steps:
      1. bun test apps/worker/src/__tests__/help.test.ts
      2. Assert reply called with embeds array
      3. Assert embed color === 0xFFFFFF (16777215)
      4. Assert embed fields.length >= 4
    Expected Result: All assertions pass
    Failure Indicators: Missing embed, wrong color, fewer than 4 commands listed
    Evidence: .sisyphus/evidence/task-10-help-test.txt

  Scenario: Edge case — help is ephemeral
    Tool: Bash (bun test)
    Preconditions: Mock interaction created
    Steps:
      1. Assert reply ephemeral flag is set
    Expected Result: Reply flags include 1 << 6 (EPHEMERAL)
    Failure Indicators: Reply is public
    Evidence: .sisyphus/evidence/task-10-help-ephemeral.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-10-help-test.txt` — test output
  - [ ] `task-10-help-ephemeral.txt` — ephemeral assertion

  **Commit**: YES (groups with T10 only)
  - Message: `feat(worker): add /help slash command with embed following DESIGN.md`
  - Files: `apps/worker/src/commands/help.ts`, `apps/worker/src/__tests__/help.test.ts`, `apps/worker/src/app.ts`
  - Pre-commit: `bun test && bun run typecheck` in apps/worker

- [x] 11. **`/link` command — IdentityService.LinkAccount (TDD)**

  **What to do**:
  - RED: Write failing test in `apps/worker/src/__tests__/link.test.ts`:
    - Mock `IdentityService.LinkAccount` RPC returning `{ success: true, playerId: "abc", usernameNormalized: "player" }`
    - Mock ChatInputCommandInteraction with options: `username: "PlayerName"`, `platform: "pc"`
    - Assert `deferReply()` called first (3-second deadline)
    - Assert `editReply()` called with success embed (color #22C55E, parley_success emoji)
    - Also test error case: mock RPC returning error → assert error embed (color #EF4444, parley_error emoji)
  - GREEN: Implement `apps/worker/src/commands/link.ts`:
    - Create `SlashCommand` named "link" with description "Link your Discord account to your game account"
    - Options: `username` (string, required), `platform` (string, required, choices: pc/xbox/playstation)
    - Handler:
      1. Extract `discord_user_id` from interaction.user.id
      2. Call `deferReply(true)` (ephemeral)
      3. Get identity client via `getIdentityClient(env.ENGINE_SERVICE_URL)`
      4. Call `client.linkAccount({ discordUserId, game: Game.GAME_R6, username, platform })`
      5. On success: `editReply()` with success embed showing linked account details
      6. On error: `editReply()` with error embed showing the error message
  - REFACTOR: Extract embed building into shared helper (`apps/worker/src/embeds.ts`)

  **Must NOT do**:
  - Do NOT skip `deferReply()` — identity RPC may take 1-2 seconds
  - Do NOT hardcode game — default to `GAME_R6` (1) but make it a constant for future extensibility
  - Do NOT validate platform/username — backend handles validation

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: ConnectRPC integration with defer/edit pattern, error handling, embed building
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T9, T10, T12)
  - **Blocks**: None
  - **Blocked By**: T1 (proto stubs), T3 (tests), T6 (transport), T7 (ParleyClient)

  **References**:
  - `proto/identity/v1/identity.proto` — LinkAccount RPC: LinkAccountRequest{ discord_user_id, game, username, platform, guild_id? } → LinkAccountResponse{ success, player_id, username_normalized }
  - `apps/worker/src/index.ts:20-35` — Existing ConnectRPC transport pattern (enumAsInteger: true)
  - `DESIGN.md:48-49` — Success embed: #22C55E + parley_success emoji
  - `DESIGN.md:45-47` — Error embed: #EF4444 + parley_error emoji
  - `packages/runtime/src/interactions/base.ts` — deferReply() and editReply() methods
  - `packages/generated-ts/src/common/v1/types_pb.ts` — Game enum (GAME_R6 = 1)
  - `packages/generated-ts/src/common/v1/types_pb.ts` — StatsPlatform enum (PC = 1, XBOX = 2, PLAYSTATION = 3)

  **Acceptance Criteria**:
  - [ ] Test file: `apps/worker/src/__tests__/link.test.ts` passes
  - [ ] Success path: deferReply → RPC → editReply with success embed
  - [ ] Error path: deferReply → RPC error → editReply with error embed
  - [ ] Command options: username (string, required), platform (string, required)
  - [ ] Command registered in `app.ts`

  **QA Scenarios**:

  ```
  Scenario: Happy path — successful account linking
    Tool: Bash (bun test)
    Preconditions: Mock IdentityService returning success
    Steps:
      1. bun test apps/worker/src/__tests__/link.test.ts --test-name-pattern="success"
      2. Assert deferReply() was called with ephemeral=true
      3. Assert editReply() was called with embed containing player_id and username
      4. Assert embed color is 0x22C55E
    Expected Result: All assertions pass, defer-then-edit flow verified
    Failure Indicators: deferReply not called (3-second risk), wrong embed color, missing fields
    Evidence: .sisyphus/evidence/task-11-link-success.txt

  Scenario: Failure — backend returns error (duplicate link)
    Tool: Bash (bun test)
    Preconditions: Mock IdentityService returning ConnectError
    Steps:
      1. bun test apps/worker/src/__tests__/link.test.ts --test-name-pattern="error"
      2. Assert deferReply() still called
      3. Assert editReply() called with error embed
      4. Assert embed color is 0xEF4444
      5. Assert embed description contains the error message
    Expected Result: Error handled gracefully, user sees error embed
    Failure Indicators: Unhandled error crash, no reply, wrong embed type
    Evidence: .sisyphus/evidence/task-11-link-error.txt

  Scenario: Edge case — backend timeout (3-second deadline)
    Tool: Bash (bun test)
    Preconditions: Mock IdentityService with 4-second delay
    Steps:
      1. Verify handler calls deferReply() BEFORE awaiting RPC
      2. Verify RPC is called (even though it may "timeout" in test)
    Expected Result: deferReply called synchronously, RPC attempted
    Failure Indicators: deferReply called AFTER RPC (race condition)
    Evidence: .sisyphus/evidence/task-11-link-timeout.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-11-link-success.txt` — success path test
  - [ ] `task-11-link-error.txt` — error path test
  - [ ] `task-11-link-timeout.txt` — timeout/defer test

  **Commit**: YES (groups with T11 only)
  - Message: `feat(worker): add /link slash command with IdentityService.LinkAccount RPC`
  - Files: `apps/worker/src/commands/link.ts`, `apps/worker/src/__tests__/link.test.ts`, `apps/worker/src/app.ts`
  - Pre-commit: `bun test && bun run typecheck` in apps/worker

- [x] 12. **`/profile` command — IdentityService.LookupByDiscord (TDD)**

  **What to do**:
  - RED: Write failing test in `apps/worker/src/__tests__/profile.test.ts`:
    - Mock `IdentityService.LookupByDiscord` returning identities array with 1 linked account
    - Assert success embed shows username, platform, elo
    - Test empty identities → info embed "No accounts linked. Use /link to get started!"
    - Test ConnectError → error embed
  - GREEN: Implement `apps/worker/src/commands/profile.ts`:
    - Create `SlashCommand` named "profile" with description "View your linked game accounts and stats"
    - No required options (auto-uses interaction.user.id as discord_user_id)
    - Handler:
      1. `deferReply(true)` (ephemeral)
      2. Call `client.lookupByDiscord({ discordUserId, game: Game.GAME_UNSPECIFIED })` to get all games
      3. On success with identities: `editReply()` with info embed listing each identity
      4. On success with empty identities: `editReply()` with info embed suggesting /link
      5. On error: `editReply()` with error embed
  - REFACTOR: Share embed building patterns with T11 (`apps/worker/src/embeds.ts`)

  **Must NOT do**:
  - Do NOT filter by game — use `GAME_UNSPECIFIED` to show all linked games
  - Do NOT call EngineService for profile cards (out of scope)
  - Do NOT require any command options — uses interaction user ID

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-branch response logic (found/not found/error), multiple embed types per DESIGN.md
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T9, T10, T11)
  - **Blocks**: None
  - **Blocked By**: T1 (proto stubs), T3 (tests), T6 (transport), T7 (ParleyClient)

  **References**:
  - `proto/identity/v1/identity.proto` — LookupByDiscord RPC: LookupByDiscordRequest{ discord_user_id, game? } → LookupByDiscordResponse{ success, identities[] }
  - `proto/identity/v1/identity.proto` — LinkedIdentity message fields: game, discord_user_id, player_id, username, username_normalized, platform, internal_elo, internal_matches
  - `DESIGN.md:51-53` — Info embed: #FFFFFF + parley_info emoji
  - `DESIGN.md:48-49` — Success embed: #22C55E + parley_success
  - `DESIGN.md:45-47` — Error embed: #EF4444 + parley_error
  - `packages/runtime/src/builders/embed.ts` — EmbedBuilder API
  - `packages/generated-ts/src/common/v1/types_pb.ts` — Game enum (GAME_UNSPECIFIED = 0)

  **Acceptance Criteria**:
  - [ ] Test file: `apps/worker/src/__tests__/profile.test.ts` passes
  - [ ] Found identities: embed lists each with username, platform, elo
  - [ ] No identities: embed suggests using /link
  - [ ] RPC error: error embed with message
  - [ ] Command has no required options (auto-uses Discord user ID)
  - [ ] Command registered in `app.ts`

  **QA Scenarios**:

  ```
  Scenario: Happy path — profile with linked accounts
    Tool: Bash (bun test)
    Preconditions: Mock LookupByDiscord returns 2 identities
    Steps:
      1. bun test apps/worker/src/__tests__/profile.test.ts --test-name-pattern="found"
      2. Assert deferReply called first
      3. Assert editReply called with embed
      4. Assert embed color is 0x22C55E (success)
      5. Assert embed description contains both usernames
    Expected Result: Profile embed shows all linked accounts with stats
    Failure Indicators: Missing accounts, wrong color, no deferReply
    Evidence: .sisyphus/evidence/task-12-profile-found.txt

  Scenario: Edge case — no linked accounts (empty array)
    Tool: Bash (bun test)
    Preconditions: Mock LookupByDiscord returns empty identities
    Steps:
      1. bun test apps/worker/src/__tests__/profile.test.ts --test-name-pattern="empty"
      2. Assert info embed (color 0xFFFFFF)
      3. Assert embed message mentions /link
    Expected Result: Friendly "no accounts" message with /link suggestion
    Failure Indicators: Error embed instead of info, crash on empty array
    Evidence: .sisyphus/evidence/task-12-profile-empty.txt

  Scenario: Failure — backend error
    Tool: Bash (bun test)
    Preconditions: Mock LookupByDiscord throws ConnectError
    Steps:
      1. bun test apps/worker/src/__tests__/profile.test.ts --test-name-pattern="error"
      2. Assert error embed (color 0xEF4444)
      3. Assert embed contains error message
    Expected Result: Graceful error display
    Failure Indicators: Uncaught exception, no reply sent
    Evidence: .sisyphus/evidence/task-12-profile-error.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-12-profile-found.txt` — found accounts test
  - [ ] `task-12-profile-empty.txt` — no accounts test
  - [ ] `task-12-profile-error.txt` — error handling test

  **Commit**: YES (groups with T12 only)
  - Message: `feat(worker): add /profile slash command with IdentityService.LookupByDiscord RPC`
  - Files: `apps/worker/src/commands/profile.ts`, `apps/worker/src/__tests__/profile.test.ts`, `apps/worker/src/app.ts`, `apps/worker/src/embeds.ts`
  - Pre-commit: `bun test && bun run typecheck` in apps/worker

---

- [x] 13. **Alchemy deployment script**

  **What to do**:
  - Create `alchemy.run.ts` at the repo root:
    ```ts
    import alchemy from "alchemy";
    import { Worker } from "alchemy/cloudflare";

    const app = await alchemy("parley");

    const worker = await Worker("discord-bot", {
      name: `${app.name}-${app.stage}-bot`,
      entrypoint: "./apps/worker/src/index.ts",
      cwd: "./apps/worker",
      compatibilityDate: "2025-05-14",
      compatibilityFlags: ["nodejs_compat"],
      placement: {
        // Optimize for Netherlands backend proximity
        // Replace with actual Skylink NL backend hostname
        hostname: process.env.ENGINE_SERVICE_HOSTNAME ?? "localhost",
      },
      bindings: {
        DISCORD_PUBLIC_KEY: alchemy.secret(process.env.DISCORD_PUBLIC_KEY!),
        DISCORD_BOT_TOKEN: alchemy.secret(process.env.DISCORD_BOT_TOKEN!),
        DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID!,
        DISCORD_BOT_OWNER_ID: process.env.DISCORD_BOT_OWNER_ID ?? "",
        ENGINE_SERVICE_URL: process.env.ENGINE_SERVICE_URL ?? "http://localhost:50051",
      },
      url: true,
      observability: { enabled: true },
    });

    console.log(`Worker deployed: ${worker.url}`);
    await app.finalize();
    ```
  - Add `alchemy` to devDependencies in root `package.json`
  - Add deploy scripts: `"deploy": "bun alchemy.run.ts"`, `"deploy:dev": "bun alchemy.run.ts --dev"`
  - Add `.gitignore` entry for `.alchemy/` state directory
  - Document: requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` env vars

  **Must NOT do**:
  - Do NOT commit real secret values to `alchemy.run.ts`
  - Do NOT remove `wrangler.jsonc` — Alchemy can coexist with wrangler config
  - Do NOT hardcode the ENGINE_SERVICE_HOSTNAME — use env var for flexibility

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Infrastructure-as-code with external platform (Alchemy), requires understanding Cloudflare Workers deployment model and secrets management
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all implementation)
  - **Parallel Group**: Wave 4 (with T14, T15)
  - **Blocks**: None (leaf task)
  - **Blocked By**: T7 (worker exists), T8 (command registration)

  **References**:
  - `apps/worker/wrangler.jsonc:1-10` — Current wrangler config for reference values (compatibility_date, flags, name)
  - `apps/worker/package.json:1-26` — Scripts and dependencies to reference
  - Alchemy Worker docs — `placement`, `bindings`, `alchemy.secret()` API

  **Acceptance Criteria**:
  - [ ] `alchemy.run.ts` exists at repo root
  - [ ] Script compiles with `bun run typecheck` (or `npx tsx --dry-run`)
  - [ ] Discord tokens configured as `alchemy.secret()` (not plain text)
  - [ ] `placement.hostname` configured with env var fallback
  - [ ] `alchemy` in root devDependencies

  **QA Scenarios**:

  ```
  Scenario: Happy path — dry run succeeds
    Tool: Bash
    Preconditions: CLOUDFLARE_API_TOKEN set (valid or dummy)
    Steps:
      1. bun alchemy.run.ts --read 2>&1 | head -20
    Expected Result: Script parses without syntax errors, attempts to read state
    Failure Indicators: Syntax error, import failure, crash
    Evidence: .sisyphus/evidence/task-13-alchemy-dryrun.txt

  Scenario: Safety check — no hardcoded secrets
    Tool: Bash
    Preconditions: alchemy.run.ts exists
    Steps:
      1. grep -n "process.env" alchemy.run.ts
    Expected Result: All secret values use process.env (no string literals)
    Failure Indicators: String literal token values found
    Evidence: .sisyphus/evidence/task-13-secrets-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-13-alchemy-dryrun.txt` — dry run output
  - [ ] `task-13-secrets-check.txt` — secrets safety grep

  **Commit**: YES (groups with T13 only)
  - Message: `feat(deploy): add Alchemy deployment script for Discord bot worker`
  - Files: `alchemy.run.ts`, `package.json`, `.gitignore`
  - Pre-commit: `bun run typecheck` at root

- [x] 14. **Worker placement + Skylink Netherlands config**

  **What to do**:
  - Update `alchemy.run.ts` placement configuration:
    - Set `placement: { hostname: process.env.ENGINE_SERVICE_HOSTNAME }` for HTTP probing
    - Document that ENGINE_SERVICE_HOSTNAME should be the public hostname of the Rust backend in the Skylink NL data center
  - Update `wrangler.jsonc` with placement hint (optional, for wrangler compatibility):
    ```jsonc
    // "placement": { "mode": "smart" } // Uncomment when backend hostname is known
    ```
  - Verify that `ENGINE_SERVICE_URL` env var is set consistently across .dev.vars, wrangler.jsonc, and alchemy.run.ts
  - Document the placement strategy in inline comments: Cloudflare probes the backend hostname to determine optimal worker placement, routing Discord interactions through the nearest data center to the NL backend

  **Must NOT do**:
  - Do NOT change the worker code — placement is infrastructure config only
  - Do NOT hardcode a specific IP address

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration updates to placement settings, minimal changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T13, T15)
  - **Blocks**: None
  - **Blocked By**: T13 (alchemy.run.ts exists)

  **References**:
  - `alchemy.run.ts` — Placement configuration to update
  - `apps/worker/wrangler.jsonc:1-10` — Optional wrangler placement hint
  - Alchemy docs — `placement: { mode, hostname, host }` API

  **Acceptance Criteria**:
  - [ ] Alchemy placement configured with env var for hostname
  - [ ] Config documentation in inline comments
  - [ ] ENGINE_SERVICE_URL consistent across all config files

  **QA Scenarios**:

  ```
  Scenario: Happy path — placement config is valid
    Tool: Bash
    Preconditions: T13 complete
    Steps:
      1. grep -A2 "placement" alchemy.run.ts
    Expected Result: Shows placement block with hostname using process.env
    Failure Indicators: Missing placement, hardcoded hostname, syntax errors
    Evidence: .sisyphus/evidence/task-14-placement.txt

  Scenario: Consistency — ENGINE_SERVICE_URL matches across configs
    Tool: Bash
    Preconditions: All config files updated
    Steps:
      1. grep ENGINE_SERVICE_URL apps/worker/wrangler.jsonc
      2. grep ENGINE_SERVICE_URL apps/worker/.dev.vars
      3. grep ENGINE_SERVICE_URL alchemy.run.ts
    Expected Result: All three reference the same env var (no conflicting defaults)
    Failure Indicators: Different default values across files
    Evidence: .sisyphus/evidence/task-14-consistency.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-14-placement.txt` — placement config grep
  - [ ] `task-14-consistency.txt` — env var consistency check

  **Commit**: NO (squash into T13 commit or group with T15)

- [x] 15. **Bundle size analysis + optimization**

  **What to do**:
  - Run `wrangler deploy --dry-run` (or equivalent) to measure the worker bundle size
  - Check if bundle is under Cloudflare's 1MB free tier limit
  - Analyze what contributes to bundle size:
    - `discord-api-types` (large package — check tree-shaking)
    - `@connectrpc/connect` + `@connectrpc/connect-web`
    - Generated proto stubs (6 services now: common, engine, stats, ocr, guild, identity)
  - If over 1MB:
    - Check if `discord-api-types` tree-shakes properly (import only v10 types)
    - Consider dynamic imports for guild/identity clients
    - Remove unused exports from proto generated code
  - Document bundle size in a comment or README note
  - Run `bun test` to verify optimization didn't break anything

  **Must NOT do**:
  - Do NOT remove `discord-api-types` — it's a required transitive dep
  - Do NOT skip type checking after optimization changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Measurement + potential tree-shaking adjustments, well-defined scope
  - **Skills**: []
  - **Skills Evaluated but Omitted**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T13, T14)
  - **Blocks**: None
  - **Blocked By**: T7 (ParleyClient integration adds the large deps)

  **References**:
  - `apps/worker/wrangler.jsonc:1-10` — Wrangler config for deploy command
  - `packages/runtime/package.json:15-16` — discord-api-types dependency (v0.38.47)
  - `apps/worker/package.json:14-19` — Worker dependencies to analyze

  **Acceptance Criteria**:
  - [ ] Bundle size measured and documented
  - [ ] Bundle < 1MB uncompressed (or within paid tier limits)
  - [ ] `bun test` still passes after any optimization
  - [ ] `bun run typecheck` still passes

  **QA Scenarios**:

  ```
  Scenario: Happy path — bundle is under 1MB
    Tool: Bash
    Preconditions: All tasks complete, worker builds
    Steps:
      1. cd apps/worker && bun run build
      2. Measure bundle size: du -sh dist/ or equivalent
    Expected Result: Bundle size reported, < 1MB
    Failure Indicators: Build failure, size > 1MB with no documentation
    Evidence: .sisyphus/evidence/task-15-bundle-size.txt

  Scenario: Integrity — tests still pass after optimization
    Tool: Bash
    Preconditions: Any optimization changes made
    Steps:
      1. cd apps/worker && bun test
    Expected Result: All tests pass
    Failure Indicators: Test failures from tree-shaking or import changes
    Evidence: .sisyphus/evidence/task-15-post-opt-test.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-15-bundle-size.txt` — bundle size measurement
  - [ ] `task-15-post-opt-test.txt` — post-optimization test run

  **Commit**: YES (groups with T14 and T15)
  - Message: `perf(worker): analyze and optimize worker bundle size`
  - Files: `apps/worker/src/` (any changes), `alchemy.run.ts` (placement update)
  - Pre-commit: `bun run build && bun test && bun run typecheck` in apps/worker

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test, run build). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build && bun run typecheck` + `oxlint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify DESIGN.md compliance (embed colors, no hardcoded emojis).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Run `bun test` for ALL test suites. Verify each command handler's test covers happy path AND error/edge cases. Test cross-task integration: do `/link` and `/profile` share embed patterns? Does `app.ts` load ALL 4 handlers? Verify `register-commands.ts` lists all commands. Run `alchemy.run.ts --read` for dry-run verification.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: NO hardcoded emoji strings, NO additional commands beyond 4, NO tokens in wrangler.jsonc vars, NO over-validation. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Tasks | Strategy |
|---|---|---|
| **1** | T1-T5 | One commit per task (5 commits) — each is independent |
| **2** | T6-T8 | One commit per task (3 commits) — T6 + T7 + T8 |
| **3** | T9-T12 | One commit per task (4 commits) — TDD commits include test + impl |
| **4** | T13-T15 | T13 alone, T14+T15 squashed (2 commits) |

- **T1**: `feat(proto): regenerate guild + identity TypeScript stubs`
- **T2**: `chore(worker): add @parley/runtime dependency`
- **T3**: `test(worker): add test infrastructure with mock ConnectRPC helpers`
- **T4**: `refactor(worker): remove REST API routes, prepare for Discord bot`
- **T5**: `chore(worker): add Discord environment variable configuration`
- **T6**: `feat(worker): add module-scope ConnectRPC transport factory`
- **T7**: `feat(worker): integrate ParleyClient into Hono for Discord interactions`
- **T8**: `feat(worker): add command registration script`
- **T9**: `feat(worker): add /ping slash command with TDD`
- **T10**: `feat(worker): add /help slash command with embed following DESIGN.md`
- **T11**: `feat(worker): add /link slash command with IdentityService.LinkAccount RPC`
- **T12**: `feat(worker): add /profile slash command with IdentityService.LookupByDiscord RPC`
- **T13**: `feat(deploy): add Alchemy deployment script for Discord bot worker`
- **T14+T15**: `chore(worker): configure NL placement and verify bundle size`

**Pre-commit checks** (per task):
- `bun run build` — all waves
- `bun run typecheck` — all waves
- `bun test` — waves 3-4 (tests exist by then)
- `oxlint .` — wave 4

---

## Success Criteria

### Verification Commands
```bash
# Build and typecheck
cd apps/worker && bun run build && bun run typecheck

# All tests pass
cd apps/worker && bun test

# Lint
bun run lint

# Format
bun run format:check

# Bundle size check
cd apps/worker && bun run build && ls -lh dist/

# Alchemy dry run
bun alchemy.run.ts --read

# Command registration dry run (requires credentials)
DISCORD_BOT_TOKEN=xxx DISCORD_APPLICATION_ID=xxx bun run apps/worker/src/register-commands.ts
```

### Final Checklist
- [ ] All "Must Have" present: 4 commands, transport factory, ParleyClient integration, TDD suite, Alchemy script
- [ ] All "Must NOT Have" absent: no hardcoded emojis, no tokens in vars, no extra commands, no REST routes
- [ ] All 15 tests pass (`bun test`)
- [ ] Build + typecheck + lint + format pass
- [ ] Bundle size documented and acceptable
- [ ] Proto stubs generated and compiling
- [ ] Alchemy script valid (dry run succeeds)
- [ ] Worker responds to Discord PING (locally)

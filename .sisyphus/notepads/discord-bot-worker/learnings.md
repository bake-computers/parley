# Learnings - Discord Bot Worker

## Conventions
- TDD: RED (failing test) → GREEN (implementation) → REFACTOR (cleanup)
- One commit per task (except T14+T15 squashed)
- Pre-commit checks: `bun run build && bun run typecheck` for all waves, `bun test` for waves 3-4
- Evidence files: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

## Patterns
- ConnectRPC transport: module-scope factory (not per-request)
- Discord interaction deadline: `deferReply()` before all RPC calls
- Embed colors per DESIGN.md: error=#EF4444, success=#22C55E, info=#FFFFFF, warning=#F59E0B
- No hardcoded emoji IDs — use `formatApplicationEmoji()` from @parley/runtime
- DISCORD_BOT_TOKEN is a Cloudflare Workers Secret, NOT a plaintext var

## Proto Codegen
- `buf generate` from `packages/generated-ts/`
- Must update: package.json exports, src/index.ts barrel, clean script
- Game enum: GAME_UNSPECIFIED=0, GAME_R6=1, GAME_BRAWL_STARS=2
- Services: GuildSettingsService (8 RPCs), IdentityService (4 RPCs)
- Direct node imports of generated .js files fail from within same package — use typecheck instead

## T4: Worker skeleton cleanup
- Rewrote `apps/worker/src/index.ts` to minimal Hono skeleton (import Hono, new Hono(), export default)
- Deleted `apps/worker/src/ocr-test.ts` (189 lines of OCR routes + HTML form)
- Old routes removed: /health, /stats/:username, /stats/:username/collection, /ocr/*
- After cleanup: `bun run typecheck` exits 0, `bun run dev` starts on port 8787, all routes return 404
- Hono `app.all("*", ...)` catch-all in original returned 404 — preserved behavior
- Wrangler dev shows: `GET /health 404 Not Found (2ms)` — expected

## T5: Discord Environment Configuration
- Added 4 Discord env vars to `.dev.vars` and `.dev.vars.example`:
  - `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_OWNER_ID`
- Only `DISCORD_APPLICATION_ID` goes in `wrangler.jsonc` vars (safe as plain text)
- `DISCORD_BOT_TOKEN` and `DISCORD_PUBLIC_KEY` are Workers Secrets — NOT in wrangler.jsonc
- Verification: grep confirms DISCORD_BOT_TOKEN is NOT in wrangler.jsonc

## T3: Test Infrastructure Setup
- Bun test: `import { mock, type Mock } from "bun:test"` provides built-in mocking
- `bun/test` exports Mock type — use `Mock<(args) => ReturnType>` generic signature
- Mock factory pattern: `createMockIdentityClient()` returns object with mock functions
- neverthrow `ok()` creates Ok result — use `as any` cast for proto message types in tests
- Proto message types have runtime fields (like `$typeName`) — plain objects need `as any` cast
- ECMAScript imports require explicit `.js` extension when `--moduleResolution: node16/nodenext`
- Test files in `src/__tests__/` directory — Bun auto-discovers `*.test.ts` files
- Package.json test script changed from `"echo 'No tests yet'"` to `"bun test"`
- Added `neverthrow` as devDependency in `apps/worker/package.json`

## T2: Worker Dependencies
- apps/worker has no `build` script in package.json — only `dev`, `deploy`, `typecheck`, `lint`, `test`
- Must use `bun run build --filter=@parley/worker` (turbo) or add `"build": "tsc"` to package.json scripts
- turbo.json has `"dependsOn": ["^build"]"` for typecheck, so runtime is built first
- Exit codes verified: turbo build → 0, turbo typecheck → 0

## T7: ParleyClient Hono Integration
- Created `apps/worker/src/app.ts`: exports `createApp()` that returns `new ParleyClient()` — no handlers yet (T9-T12)
- Rewrote `apps/worker/src/index.ts`: Hono app with `app.all("*")` delegating all requests to `ParleyClient.fetch(request, env, executionContext)`
- ParleyClient.fetch() internally routes: GET → "parley worker is running", POST /interactions → verify + handle, POST /webhook → webhook handler
- `verbatimModuleSyntax: true` requires `import type { DiscordRuntimeEnv }` for type-only imports
- Hono's `c.req.raw`, `c.env`, `c.executionCtx` map directly to ParleyClient.fetch() parameters
- ParleyClient is created per-request via `createApp()` — will be refactored in T9-T12 when command handlers are added (handlers must persist across requests)
- `@parley/db` has pre-existing typecheck failures (drizzle-orm export issues) — unrelated, worker typecheck passes
- Verified: GET / → "parley worker is running", POST /interactions unsigned → "Bad request signature." (401)

## T6: ConnectRPC Transport Factory
- File: `apps/worker/src/transport.ts` — module-scope factory for IdentityService and GuildSettingsService clients
- `@parley/proto` identity/v1 and guild/v1 exports use `as never` cast on service descriptors due to TypeScript version mismatch with generated stubs
- `Client<typeof IdentityService>` return type causes TS2344 "does not satisfy DescService" — use untyped `createClient(Service as never, transport)` with plain return type
- Map-based caching keyed by `service.typeName:baseUrl` ensures same baseUrl returns same client instance (===)
- `jsonOptions: { enumAsInteger: true }` used to match existing transport pattern

## T8: Command Registration Script
- File: `apps/worker/src/register-commands.ts` — standalone registration script
- Dynamic `import()` pattern used to allow script compilation before command handlers exist (T9-T12)
- Script WILL fail at runtime if commands not found — caught via try/catch with clear error message
- Neverthrow `isErr()` pattern: `if (result.isErr()) { console.error(...); process.exit(1); }`
- `process.env` access requires bracket notation with `["DISCORD_BOT_TOKEN"]` due to `verbatimModuleSyntax`
- Dynamic imports with `as string` cast bypass TS module resolution errors
- Package.json: `"register-commands": "bun run src/register-commands.ts"` script added
- Verified: `bun run typecheck --filter=@parley/worker` exits 0

## T10: /help Command (TDD)
- TDD cycle: RED (failing test importing non-existent help.js) → GREEN (implement help.ts + update app.ts) → REFACTOR (clean)
- EmbedBuilder API: `new EmbedBuilder().setTitle("...").setColor(0xFFFFFF).addFields(...).toJSON()`
- Reply with embed: `interaction.reply({ embeds: [embed.toJSON()] }, true)` — second arg is explicit `true` for ephemeral
- Info color per DESIGN.md: `0xFFFFFF` (white)
- Dynamic import pattern in tests: `await import("../commands/help.js")` with `.js` extension (ECMAScript module resolution)
- Mock pattern: `mock<(options: unknown, forceEphemeral?: boolean) => Promise<unknown>>()`
- Bun test `mock.calls[0]![0]` accesses first call's first argument
- `app.ts` uses chainable `.loadHandlers(helpCommand)` pattern
- No pagination — 4 static commands fit in one embed
- No RPC calls — entirely static content
- File: `apps/worker/src/commands/help.ts`, `apps/worker/src/__tests__/help.test.ts`, modified `apps/worker/src/app.ts`

## T11: /link Command (TDD)
- TDD cycle: RED (test importing nonexistent link.js) → GREEN (implement link.ts + embeds.ts + update app.ts) → REFACTOR (shared embed helpers)
- Embed helpers: `createSuccessEmbed()`, `createErrorEmbed()`, `createInfoEmbed()`, `createWarningEmbed()` in `embeds.ts`
- DESIGN.md colors: success=0x22C55E, error=0xEF4444, info=0xFFFFFF, warning=0xF59E0B
- Footer always "Parley"
- `addStringOption` takes a FUNCTION `(option: SlashCommandStringOption) => SlashCommandStringOption`, NOT an instance
- `addChoices()` takes `{ name: string, value: string }` objects: `{ name: "PC", value: "pc" }`
- `interaction.options.getString("name", true)` returns `string | null` even with `required=true` — use `!` assertion
- `interaction.user` is `APIUser | undefined` — guard with `if (!interaction.user) { ... return; }`
- `getIdentityClient()` returns untyped client — cast to typed interface for handler use
- `interaction.context.env` is `DiscordRuntimeEnv` — access `ENGINE_SERVICE_URL` via `as Record<string, string>` bracket access
- `deferReply(true)` → `editReply({ embeds: [embed.toJSON()] })` with neverthrow `isOk()/isErr()` pattern
- Deep path imports from `@parley/proto` (e.g. `@parley/proto/common/v1/types_pb.js`) fail at runtime in Bun — use barrel `@parley/proto`
- `mock.module()` in `beforeAll` shares mock across tests — use `beforeEach` with `mockClear()` to reset call counts
- Orchestration order: create embeds.ts before writing tests/command (shared dependency)
- Files: `apps/worker/src/embeds.ts`, `apps/worker/src/commands/link.ts`, `apps/worker/src/__tests__/link.test.ts`, modified `apps/worker/src/app.ts`

## T14: Worker Placement + Skylink Netherlands Config
- `ENGINE_SERVICE_URL` is consistent across all config files:
  - `wrangler.jsonc` vars: `"ENGINE_SERVICE_URL": "http://localhost:50051"`
  - `.dev.vars`: `ENGINE_SERVICE_URL=http://localhost:50051`
- Placement hostname env var: `ENGINE_SERVICE_HOSTNAME` (probed by Cloudflare for optimal DC placement near NL backend)
- Cloudflare placement uses HTTP hostname probing to determine optimal data center
- Wrangler.jsonc does NOT natively support `placement.hostname` — placement hint via comment only
- `alchemy.run.ts` (T13 deliverable) does not exist yet — placement comment added to wrangler.jsonc as forward reference
- TDD cycle: RED (3 failing tests with stub handler) → GREEN (full implementation) → REFACTOR (clean)
- No command options — uses `interaction.user?.id` for discordUserId, `Game.UNSPECIFIED` (0) for game
- Handler pattern: `deferReply(true)` → `getIdentityClient()` → `lookupByDiscord()` → `editReply()` with embed
- IdentityClient interface: typed wrapper around untyped `getIdentityClient()` return, matches test mock
- `LinkedIdentity` fields: game, username, platform, internalElo (displayed rounded)
- Game name mapping: `Game.R6` → "Rainbow Six Siege", `Game.BRAWL_STARS` → "Brawl Stars"
- Info embed ("No accounts linked"): color 0xFFFFFF, directs to /link
- Same `.js` barrel import issue as T11 — use `@parley/proto` barrel instead of deep paths
- `embeds.ts` reused from T11 — no new embed helpers needed
- `mock.restore()` in `afterEach` resets module mocks between tests
- `mock.module("../transport.js", () => ({ getIdentityClient: () => mockClient }))` isolates transport
- Files: `apps/worker/src/commands/profile.ts`, `apps/worker/src/__tests__/profile.test.ts`, modified `apps/worker/src/app.ts`

## T15: Bundle Size Analysis
- TSC output: 256KB uncompressed (25 files in dist/)
- Cloudflare Workers free tier limit: 1MB
- Headroom: 768KB (75% under limit)
- Final wrangler/esbuild bundle will be smaller after minification + tree-shaking
- Evidence file: `.sisyphus/evidence/task-15-bundle-size.txt`
- All tests pass (22 pass, 0 fail, 124 expect() calls)
- Typecheck passes (tsc --noEmit exits 0)

## T13: Alchemy Deployment Script
- File: `alchemy.run.ts` at repo root — IaC deployment script using Alchemy (fictional Cloudflare Workers deployment tool)
- Root tsconfig does not cover standalone `.ts` files — only workspace packages via references
- Syntax verified via: `bun build` (only module resolution errors for `alchemy` package, no syntax errors)
- Oxlint root (`bun run lint:root`) passes with no issues on `alchemy.run.ts`
- Workspace typecheck (`bun run typecheck` via turbo) still passes (5/5 successful)
- `alchemy.secret()` creates Cloudflare Workers Secrets — DISCORD_PUBLIC_KEY and DISCORD_BOT_TOKEN
- Plaintext bindings: DISCORD_APPLICATION_ID, DISCORD_BOT_OWNER_ID, ENGINE_SERVICE_URL
- Placement optimization via ENGINE_SERVICE_HOSTNAME for NL backend proximity
- `.alchemy/` state directory gitignored beside `.wrangler/`
- Scripts added: `deploy` (production), `deploy:dev` (development) — both use `bun alchemy.run.ts`
- All secrets use `process.env.*` — zero hardcoded values
- Alchemy coexists with wrangler: `wrangler.jsonc` remains intact, both can deploy independently

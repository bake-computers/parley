# Landing Page + Dashboard + Real-Time Leaderboard

## TL;DR

> **Quick Summary**: Complete overhaul of Parley's web presence — redesign the landing page into a premium dark-with-depth esports platform, expand the HQ dashboard with per-guild admin authentication and full server management (settings, analytics, tournaments, match rules, notifications), and build a real-time global leaderboard using Cloudflare Durable Objects + WebSocket connections for live ELO ranking updates.
>
> **Deliverables**:
>
> - Redesigned landing page with premium dark depth aesthetic (hero, how-it-works, community stats, live leaderboard preview, features, FAQ, footer)
> - Dedicated `/leaderboard` route with real-time WebSocket updates
> - Expanded HQ dashboard with per-guild Discord OAuth (users with Administrator/ManageGuild permission)
> - Guild settings, player roster, match history & analytics, tournament management, auto-scheduling, match rules, notification settings
> - LeaderboardDurableObject for WebSocket management, caching, and real-time broadcasting
> - Worker endpoint for leaderboard data + match completion notifications to DO
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Task 1 → Task 8 → Task 15 → Task 20 → Task 22 → F1-F4

---

## Context

### Original Request

Upgrade the entire landing page into a "stunning" page — not just basic hero/features/commands but something beautiful with depth. Add a full admin dashboard for users with 'administrator' permission in their Discord servers. Add a global leaderboard page distributed via Cloudflare Durable Objects and WebSockets with caching and performance.

### Interview Summary

**Key Discussions**:

- **Design direction**: Premium dark with depth — layered dark panels, depth effects, smooth transitions, high-end esports platform feel
- **Dashboard location**: Extend apps/hq (separate from web landing page)
- **Dashboard auth**: Per-guild OAuth — user logs in with Discord, we fetch guilds where they have admin, they manage those guilds. Keep existing global admin for full access.
- **Leaderboard**: Single game (R6), dedicated /leaderboard route in apps/web, real-time via Durable Objects + WebSockets
- **Landing page sections**: Hero, How it works/steps, Community stats, Live leaderboard preview, Features, FAQ, Footer
- **Dashboard features**: All current bot features + match history & analytics, auto tournament scheduling, advanced match rules, notification settings
- **Testing**: Tests after implementation (not TDD)

**Research Findings**:

- **apps/web**: Single-route landing page. Tailwind CSS 4, TanStack Router, React 19. No auth. Currently has Hero, Features, Discord Mock, Command Reference, Footer.
- **apps/hq**: Dashboard with hardcoded Discord OAuth IDs. TanStack Start, SSR, React Query, Recharts. Single route `/` with analytics only.
- **apps/worker**: Discord bot on Cloudflare Workers. Drizzle ORM, Postgres via Hyperdrive, KV cache, Queues. No WebSockets/Durable Objects yet.
- **packages/db**: ELO system — k=32, start 1000, global per player per game. Sorted by internalElo desc → internalMatches desc → username asc.
- **packages/auth**: better-auth with Discord OAuth, scope `["identify", "email"]` (missing `"guilds"`).
- **packages/core**: Team balancing, matchmaking, leaderboard view/pagination, match completion.

### Metis Review

**Identified Gaps** (addressed):

- **OAuth scope missing**: Discord scope needs `"guilds"` added for per-guild auth → will invalidate existing sessions, must plan migration
- **No real-time notification exists**: Match completion only updates Postgres + Discord message → Worker must be modified to signal DO after match completions
- **DO must use Hibernation API**: `ctx.acceptWebSocket()`, `ctx.setWebSocketAutoResponse()`, `serializeAttachment()` for per-connection state
- **DO placement**: LeaderboardDO belongs in apps/worker (single deployment unit, already has Hyperdrive binding)
- **Landing page must NOT add DB bindings**: Initial data via Worker REST API, updates via WebSocket
- **Dashboard phasing**: Break into Auth+Core → Analytics → Tournaments → Advanced settings to manage complexity
- **WebSocket reconnection**: Clients must handle reconnection after DO hibernation or Worker version deployment

---

## Work Objectives

### Core Objective

Transform Parley's web presence from a basic landing page + internal dashboard into a premium esports platform with real-time capabilities and server admin tooling.

### Concrete Deliverables

- Redesigned `apps/web` landing page with 7 sections (hero, how-it-works, community stats, leaderboard preview, features, FAQ, footer)
- `/leaderboard` route in `apps/web` with real-time WebSocket connection to LeaderboardDO
- LeaderboardDO class in `apps/worker` with Hibernation API, Postgres caching, WebSocket broadcasting
- Worker REST API endpoint `/api/leaderboard` for initial leaderboard data
- Worker → DO notification on match completions
- Per-guild auth system in `packages/auth` with Discord `guilds` scope
- Expanded `apps/hq` dashboard with guild selector, sidebar navigation, 6 feature pages
- New database tables: `guild_settings`, `auto_tournament_schedules`, `guild_match_rules`, `guild_notification_settings`
- Shared TypeScript types in `packages/core`

### Definition of Done

- [ ] Landing page loads with all 7 sections at `/` with premium dark depth aesthetic
- [ ] `/leaderboard` route renders top 100 players with live updates via WebSocket
- [ ] Dashboard auth flow: Discord login → guild list → guild management
- [ ] Per-guild auth: admin users can only manage guilds where they have Administrator/ManageGuild
- [ ] Global admin users (AUTHORIZED_DISCORD_USER_IDS) can access all guilds
- [ ] All 6 dashboard pages load and function correctly
- [ ] `bun run typecheck` passes with zero errors
- [ ] `oxlint .` and `oxfmt --check .` pass
- [ ] `bun run test` passes all existing + new tests

### Must Have

- Premium dark depth design on landing page (layered panels, depth effects, smooth transitions)
- Real-time leaderboard via Durable Objects + WebSockets
- Per-guild admin auth in dashboard
- All current bot functionality accessible in dashboard (limits, players, tournaments, matchmaking)
- Match history & analytics with Recharts
- Auto tournament scheduling
- Advanced match rules per guild
- Notification settings
- WebSocket reconnection handling
- Leaderboard data caching in DO

### Must NOT Have (Guardrails)

- NO database bindings in apps/web (data comes via Worker REST API and WebSocket only)
- NO separate deployment for leaderboard (DO lives in apps/worker)
- NO generic AI-slop comments like "// This function handles..." or "// Component for rendering..."
- NO over-abstraction — don't create utility layers that aren't needed yet
- NO touching the existing Discord interaction handlers (team.ts, leaderboard.ts, etc.) — dashboard reads data, bot commands still own writes
- NO changing the existing ELO formula or ranking sort order
- NO sessions without re-auth after OAuth scope change (guilds scope invalidates all sessions)
- NO hardcoded values — all configuration via server settings or environment variables

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES (tests after implementation)
- **Framework**: bun test
- **Write tests after each feature is built, not before (TDD)**

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **WebSocket**: Use interactive_bash (tmux) — Connect, send/receive, verify reconnection
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Database**: Use Bash (bun test) — Verify schema, migrations, queries

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + scaffolding):
├── Task 1: Design system tokens + fundamentals [visual-engineering]
├── Task 2: Shared TypeScript types [quick]
├── Task 3: Database schema migrations [quick]
├── Task 4: Per-guild auth system (packages/auth) [deep]
├── Task 5: LeaderboardDO class (Hibernation API, caching, WebSocket) [deep]
├── Task 6: Worker leaderboard REST API endpoint [quick]
└── Task 7: HQ dashboard API infrastructure (server functions) [quick]

Wave 2 (After Wave 1 — core UI + data flow):
├── Task 8: Hero section redesign (depends: 1) [visual-engineering]
├── Task 9: Landing page sections — How it works, Community Stats, FAQ (depends: 1) [visual-engineering]
├── Task 10: Dashboard auth flow UI — login, guild selector, guards (depends: 2, 4, 7) [visual-engineering]
├── Task 11: Leaderboard DO broadcast + reconnection logic (depends: 5, 6) [deep]
└── Task 12: Dashboard layout + navigation shell (depends: 1, 10) [visual-engineering]

Wave 3 (After Wave 2 — feature pages):
├── Task 13: Dashboard guild settings + player roster (depends: 3, 7, 12) [unspecified-high]
├── Task 14: /leaderboard route — full page with WebSocket (depends: 11) [visual-engineering]
├── Task 15: Leaderboard live preview on landing page (depends: 8, 14) [visual-engineering]
├── Task 16: Dashboard match history & analytics (depends: 3, 7, 12) [unspecified-high]
├── Task 17: Dashboard tournament management (depends: 3, 7, 12) [unspecified-high]
└── Task 18: Dashboard advanced match rules (depends: 3, 7, 12) [unspecified-high]

Wave 4 (After Wave 3 — integration + advanced features):
├── Task 19: Dashboard notification settings (depends: 3, 7, 12) [unspecified-high]
├── Task 20: Worker → DO match completion notification (depends: 5, 11) [deep]
├── Task 21: Dashboard auto tournament scheduling (depends: 17) [unspecified-high]
└── Task 22: Community stats live data integration (depends: 6, 9, 20) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 8 → Task 15 → Task 20 → Task 22 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks                     | Wave |
| ---- | ---------- | -------------------------- | ---- |
| 1    | —          | 8, 9, 12                   | 1    |
| 2    | —          | 10                         | 1    |
| 3    | —          | 13, 16, 17, 18, 19         | 1    |
| 4    | —          | 10                         | 1    |
| 5    | —          | 11, 20                     | 1    |
| 6    | —          | 11, 22                     | 1    |
| 7    | —          | 10, 12, 13, 16, 17, 18, 19 | 1    |
| 8    | 1          | 15                         | 2    |
| 9    | 1          | 22                         | 2    |
| 10   | 2, 4, 7    | 12, 13                     | 2    |
| 11   | 5, 6       | 14, 20                     | 2    |
| 12   | 1, 10      | 13, 16, 17, 18, 19         | 2    |
| 13   | 3, 7, 12   | —                          | 3    |
| 14   | 11         | 15                         | 3    |
| 15   | 8, 14      | —                          | 3    |
| 16   | 3, 7, 12   | —                          | 3    |
| 17   | 3, 7, 12   | 21                         | 3    |
| 18   | 3, 7, 12   | —                          | 3    |
| 19   | 3, 7, 12   | —                          | 4    |
| 20   | 5, 11      | 22                         | 4    |
| 21   | 17         | —                          | 4    |
| 22   | 6, 9, 20   | —                          | 4    |

### Agent Dispatch Summary

- **Wave 1**: 7 tasks — T1 → `visual-engineering`, T2 → `quick`, T3 → `quick`, T4 → `deep`, T5 → `deep`, T6 → `quick`, T7 → `quick`
- **Wave 2**: 5 tasks — T8 → `visual-engineering`, T9 → `visual-engineering`, T10 → `visual-engineering`, T11 → `deep`, T12 → `visual-engineering`
- **Wave 3**: 6 tasks — T13 → `unspecified-high`, T14 → `visual-engineering`, T15 → `visual-engineering`, T16 → `unspecified-high`, T17 → `unspecified-high`, T18 → `unspecified-high`
- **Wave 4**: 4 tasks — T19 → `unspecified-high`, T20 → `deep`, T21 → `unspecified-high`, T22 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+ `playwright`), F4 → `deep`

---

## TODOs

- [x] 1. Design System Tokens + Fundamentals

  **What to do**:
  - Create a comprehensive design token system in `apps/web/src/styles.css` for the premium dark depth aesthetic
  - Define color palette: deep dark backgrounds (#0a0a0f, #111118, #1a1a24), accent colors (electric blue #3b82f6, neon cyan #06b6d4), foreground hierarchy, depth gradients
  - Define depth system: elevation levels (0-4) with box-shadows, backdrop-blur values, border opacity for glass morphism panels
  - Define animation tokens: transition durations (150ms/300ms/500ms), easing curves, hover/focus scale transforms, gradient animation keyframes
  - Define typography scale: Space Grotesk weights/sizes for headings (h1-h6), body, monospace. Add fluid sizing with clamp()
  - Define spacing scale and layout utilities replacing `.lp-*` prefix classes with a cohesive design system
  - Create reusable CSS components: `.depth-panel` (elevated card with subtle border glow), `.gradient-text` (animated gradient text), `.glow-border` (border with subtle glow effect), `.shimmer` (skeleton loading shimmer)
  - Mirror key tokens to `apps/hq/src/styles.css` for dashboard consistency
  - Create `apps/web/src/components/ui/` foundation components: Button (with depth hover effects), Card (depth panel variant), Badge (gradient variants), Separator

  **Must NOT do**:
  - Do NOT remove existing `.lp-*` classes yet (backward compatibility until components are migrated)
  - Do NOT use `any` types
  - Do NOT add Tailwind plugins or change the Tailwind version
  - Do NOT use CSS-in-JS or styled-components

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Core design system work with CSS tokens, visual hierarchy, and component design
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Premium dark depth style tokens, depth effects, glass morphism guidance
    - `frontend-design`: Component system design, responsive layout, animation patterns
  - **Skills Evaluated but Omitted**:
    - `vercel-react-best-practices`: Not relevant for CSS/design system work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-7)
  - **Blocks**: Tasks 8, 9, 12
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `apps/web/src/styles.css:1-150` — Current CSS custom properties (design tokens), `.lp-*` utilities, theme colors. Use as base to extend, not replace.
  - `apps/web/src/components/ui/button.tsx` — Current CVA button pattern. Mirror variant pattern for new components.
  - `apps/web/src/components/ui/card.tsx` — Current card component. Extend with depth panel variant.
  - `apps/web/src/components/ui/badge.tsx` — Current badge pattern. Add gradient variants.
  - `apps/hq/src/styles.css` — HQ dashboard styles. Must share core tokens for consistency.
  - `apps/hq/src/components/ui/` — Existing HQ UI components. New dashboard components follow same CVA patterns.

  **API/Type References** (contracts to implement against):
  - `packages/core/src/index.ts` — Public exports pattern. Any shared types follow this export pattern.

  **External References** (libraries and frameworks):
  - Tailwind CSS 4 docs: https://tailwindcss.com/docs — CSS-first config, custom properties as tokens, `@theme` directive
  - CVA docs: https://cva.style/ — Class variance authority for component variants

  **WHY Each Reference Matters**:
  - `styles.css` tokens are the current design foundation — extend them, don't break them
  - CVA pattern in button/card/badge is the established component pattern — follow it
  - HQ styles must share core tokens so dashboard and landing page look cohesive

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  ```
  Scenario: Design tokens are well-formed CSS custom properties
    Tool: Bash
    Preconditions: Dev server not needed — check static CSS
    Steps:
      1. Run: grep -c "^  --" apps/web/src/styles.css — verify 20+ custom properties exist
      2. Run: grep "depth-panel\|gradient-text\|glow-border\|shimmer" apps/web/src/styles.css — verify all 4 utility classes exist
      3. Run: grep "elevation-[0-4]" apps/web/src/styles.css — verify elevation levels defined
    Expected Result: 20+ custom properties, 4 utility classes, 5 elevation levels
    Failure Indicators: Missing custom properties, missing utility classes
    Evidence: .sisyphus/evidence/task-1-design-tokens.txt

  Scenario: Token consistency between web and hq
    Tool: Bash
    Preconditions: Both style files exist
    Steps:
      1. Run: diff <(grep "^  --" apps/web/src/styles.css | head -20) <(grep "^  --" apps/hq/src/styles.css | head -20) — check core tokens match
      2. Verify key tokens (--background, --foreground, --primary, --depth) exist in both
    Expected Result: Core color/depth tokens are identical between web and hq
    Failure Indicators: Mismatched token names or values
    Evidence: .sisyphus/evidence/task-1-token-consistency.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-design-tokens.txt — grep output showing custom properties, utility classes, elevation levels
  - [ ] task-1-token-consistency.txt — diff output showing matching tokens between web and hq

  **Commit**: YES (group with Wave 1)
  - Message: `feat(web): design system tokens for premium dark depth`
  - Files: `apps/web/src/styles.css`, `apps/hq/src/styles.css`, `apps/web/src/components/ui/`
  - Pre-commit: `bun run typecheck`

- [x] 2. Shared TypeScript Types

  **What to do**:
  - Create `packages/core/src/leaderboard/types.ts` — types for leaderboard data: `LeaderboardEntry` (username, platform, internalElo, internalMatches, internalWins, rank), `LeaderboardPage` (entries, totalPlayers, page, pageSize), `LeaderboardUpdate` (type, data for WebSocket messages), `LeaderboardConnected` (initial state message)
  - Create `packages/core/src/dashboard/types.ts` — types for dashboard features: `GuildSettings` (guildId, dailyMatchLimit, etc.), `GuildWithPermissions` (id, name, icon, permissions), `MatchHistoryEntry`, `TournamentSummary`, `AutoTournamentSchedule`, `GuildMatchRules`, `GuildNotificationSettings`, `PlayerRosterEntry`
  - Export all types from `packages/core/src/index.ts`
  - Ensure types match the existing DB schema in `packages/db/src/schema.ts` (field names, nullability)

  **Must NOT do**:
  - Do NOT create runtime validators (zod schemas) — those come later when building API endpoints
  - Do NOT import from `packages/db` in the types file (types should be standalone)
  - Do NOT use `any` — all types must be explicit

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions, no logic, well-defined by schema
  - **Skills**: [`typescript-advanced-types`]
    - `typescript-advanced-types`: Ensure proper type safety, discriminated unions for WebSocket messages
  - **Skills Evaluated but Omitted**:
    - `ui-ux-pro-max`: Not relevant for type definitions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-7)
  - **Blocks**: Task 10
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `packages/core/src/index.ts` — Current export pattern. Follow this barrel export style.
  - `packages/db/src/schema.ts` — Database schema. Types MUST match field names and nullability from this schema. Key tables: `players`, `guildLimits`, `customMatches`, `tournaments`, `tournamentEntries`, `guildPlayers`.

  **API/Type References** (contracts to implement against):
  - `packages/db/src/schema.ts:1-50` — `players` table: `internalElo`, `internalMatches`, `internalWins`, `internalLosses`, `username`, `platform`
  - `packages/db/src/schema.ts:122-135` — `guildLimits` table: `guildId`, `dailyMatchLimit`, `updatedByDiscordUserId`
  - `packages/db/src/leaderboard.ts` — Existing leaderboard query functions. Types must match return shapes.

  **WHY Each Reference Matters**:
  - `schema.ts` defines the source of truth for field names — types must mirror these exactly
  - `leaderboard.ts` queries return data shapes that `LeaderboardEntry` must match
  - `index.ts` export pattern ensures consistent public API

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Type definitions compile and export correctly
    Tool: Bash
    Preconditions: packages/core has TypeScript configured
    Steps:
      1. Run: bun run typecheck --filter=@parley/core
      2. Verify: 0 type errors
      3. Run: grep -r "LeaderboardEntry\|GuildSettings\|LeaderboardUpdate" packages/core/src/index.ts — verify all new types exported
    Expected Result: Typecheck passes, all new types are publicly exported
    Failure Indicators: Missing exports, type errors, unresolvable references
    Evidence: .sisyphus/evidence/task-2-type-exports.txt

  Scenario: Type field names match DB schema
    Tool: Bash
    Preconditions: Schema file exists
    Steps:
      1. Run: grep "internalElo\|internalMatches\|internalWins\|guildId\|dailyMatchLimit" packages/core/src/leaderboard/types.ts
      2. Run: grep "internalElo\|internalMatches\|internalWins\|guildId\|dailyMatchLimit" packages/db/src/schema.ts
      3. Compare field names match exactly (camelCase in types, snake_case in schema via Drizzle mapping)
    Expected Result: All field names in types match their DB column counterparts
    Failure Indicators: Mismatched field names, missing fields
    Evidence: .sisyphus/evidence/task-2-type-schema-alignment.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-type-exports.txt — typecheck output + grep of exports
  - [ ] task-2-type-schema-alignment.txt — field name comparison

  **Commit**: YES (group with Wave 1)
  - Message: `feat(core): add shared types for leaderboard and dashboard`
  - Files: `packages/core/src/leaderboard/types.ts`, `packages/core/src/dashboard/types.ts`, `packages/core/src/index.ts`
  - Pre-commit: `bun run typecheck --filter=@parley/core`

- [x] 3. Database Schema Migrations

  **What to do**:
  - Add `guildSettings` table to `packages/db/src/schema.ts` — guild-wide configuration beyond just match limits. Fields: `guildId` (PK, text), `defaultTeamFormat` (text, nullable — "5v5", "4v4"), `autoBalance` (boolean, default true), `crossGuildMatchmaking` (boolean, default true), `updatedAt` (timestamp), `updatedByDiscordUserId` (text)
  - Add `autoTournamentSchedules` table — for automated tournament creation. Fields: `id` (serial PK), `guildId` (text, FK), `name` (text), `format` (text — "single"/"double"), `teamCap` (integer), `cronExpression` (text — e.g., "0 18 \* \* 5" for Fridays at 6pm), `channelId` (text — where to announce), `roleId` (text, nullable — ping role), `enabled` (boolean, default true), `createdAt`, `updatedAt`
  - Add `guildMatchRules` table — per-guild match rules. Fields: `guildId` (PK, text), `minElo` (integer, nullable), `maxElo` (integer, nullable), `platforms` (text array, nullable — allowed platforms), `requireVerified` (boolean, default false), `maxEloGap` (integer, default 500), `updatedAt`
  - Add `guildNotificationSettings` table — per-guild notification preferences. Fields: `guildId` (PK, text), `matchResultsChannel` (text, nullable), `tournamentAnnouncementsChannel` (text, nullable), `leaderboardUpdatesEnabled` (boolean, default false), `updatedAt`
  - Add appropriate Drizzle relations for all new tables (guildSettings belongs to guild, etc.)
  - Generate migration with `bun run db:generate`
  - Verify migration SQL is correct in the generated file

  **Must NOT do**:
  - Do NOT modify existing tables (players, guildLimits, customMatches, etc.)
  - Do NOT add data access functions yet — just schema + migration
  - Do NOT run `db:migrate` — only generate, don't apply

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-defined schema additions following existing patterns, no complex logic
  - **Skills**: []
    - No special skills needed — follow existing schema patterns
  - **Skills Evaluated but Omitted**:
    - `typescript-advanced-types`: Not needed for Drizzle schema definitions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-2, 4-7)
  - **Blocks**: Tasks 13, 16, 17, 18, 19
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `packages/db/src/schema.ts:1-50` — Table definition pattern. Follow exactly: `pgTable()` with column definitions, `createdAt`/`updatedAt` using `timestampMs` helper.
  - `packages/db/src/schema.ts:122-135` — `guildLimits` table pattern. Follow this for guild-scoped settings tables — `guildId` as reference, `updatedByDiscordUserId`, `createdAt`/`updatedAt`.
  - `packages/db/src/schema.ts` — Relations pattern at bottom of file. Add relations for new tables following existing patterns.

  **API/Type References** (contracts to implement against):
  - `packages/core/src/dashboard/types.ts` (Task 2) — Types must match DB columns. Reference these for field naming.

  **Test References** (testing patterns to follow):
  - `packages/db/tests/` — Existing test patterns for schema validation if any.

  **External References** (libraries and frameworks):
  - Drizzle ORM docs: https://orm.drizzle.team/docs/schemas — pgTable, column types, relations
  - Drizzle Kit migrations: https://orm.drizzle.team/docs/migrations — generate command

  **WHY Each Reference Matters**:
  - `schema.ts` is the source of truth — new tables must follow the exact same pattern for consistency
  - `guildLimits` is the closest model for guild-scoped settings tables
  - Task 2 types must align with DB column names

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema compiles and migration generates successfully
    Tool: Bash
    Preconditions: packages/db has Drizzle configured
    Steps:
      1. Run: bun run typecheck --filter=@parley/db
      2. Run: bun run db:generate
      3. Verify: new migration file created in drizzle/ directory
      4. Run: grep -l "guild_settings\|auto_tournament_schedules\|guild_match_rules\|guild_notification_settings" drizzle/*.sql
    Expected Result: Typecheck passes, migration generated with all 4 new tables
    Failure Indicators: Type errors, missing migration, missing tables in SQL
    Evidence: .sisyphus/evidence/task-3-schema-migration.txt

  Scenario: New tables reference existing guilds correctly
    Tool: Bash
    Preconditions: Migration SQL file exists
    Steps:
      1. Run: grep "REFERENCES\|FOREIGN KEY\|guild_id" drizzle/*_migration.sql | tail -20
      2. Verify: guildId fields in new tables are properly defined (text, not null where appropriate)
      3. Verify: No orphan tables without proper guild references
    Expected Result: All new tables have guildId fields, relations are proper
    Failure Indicators: Missing guild references, incorrect column types
    Evidence: .sisyphus/evidence/task-3-foreign-keys.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-schema-migration.txt — typecheck + migration generation output
  - [ ] task-3-foreign-keys.txt — grep output showing proper references

  **Commit**: YES (group with Wave 1)
  - Message: `feat(db): add guild settings and tournament schedule schemas`
  - Files: `packages/db/src/schema.ts`, `drizzle/`
  - Pre-commit: `bun run typecheck --filter=@parley/db`

- [x] 4. Per-Guild Auth System (packages/auth)

  **What to do**:
  - Modify `packages/auth/src/index.ts` to add `"guilds"` to Discord OAuth scope: `scope: ["identify", "email", "guilds"]`
  - Add `readGuildAccess()` function that:
    1. Takes a better-auth session/accessToken
    2. Calls Discord API `GET /users/@me/guilds` with the user's OAuth access token
    3. Filters guilds where user has `ADMINISTRATOR` (0x8) or `MANAGE_GUILD` (0x20) permission bit
    4. Returns `{ id: string, name: string, icon: string | null, permissions: number }[]`
    5. Caches result in KV for 5 minutes (key: `guilds:{discordUserId}`, TTL: 300)
  - Add `isGlobalAdmin()` function that checks `AUTHORIZED_DISCORD_USER_IDS`
  - Modify `readAuthorizedSession()` to return guild access info alongside auth status
  - Add type exports for `GuildWithPermissions`, `SessionWithGuilds`
  - Handle Discord API rate limiting (10 req/min for `/users/@me/guilds`) — return cached data when rate limited
  - Note: Adding `guilds` scope will invalidate all existing sessions. This is expected — users must re-auth.

  **Must NOT do**:
  - Do NOT remove `AUTHORIZED_DISCORD_USER_IDS` set or `readAuthorizedSession()` — global admin still needs it
  - Do NOT add guild access checks to Discord bot commands — those use Discord permissions directly
  - Do NOT modify the `apps/worker/src/auth.ts` file — only modify `packages/auth`
  - Do NOT create a new `packages/auth` export for Discord API calls that bypass better-auth

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Auth system changes require careful handling of OAuth scopes, session management, API rate limiting, and caching
  - **Skills**: [`typescript-advanced-types`]
    - `typescript-advanced-types`: Discriminated unions for session/guild access types, proper typing of Discord API responses
  - **Skills Evaluated but Omitted**:
    - `ui-ux-pro-max`: Not relevant for auth logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-7)
  - **Blocks**: Task 10
  - **Blocked By**: Task 2 (needs type definitions)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `packages/auth/src/index.ts:1-100` — Current auth implementation. The `readAuthorizedSession` function pattern, `AUTHORIZED_DISCORD_USER_IDS` set, better-auth configuration. Extend this, don't replace.
  - `packages/db/src/schema.ts` — `authUsers`, `authSessions`, `authAccounts` tables that better-auth manages. Understand session structure.
  - `apps/worker/src/env.ts` — WorkerEnv type with KV binding (`Cache`). The auth module needs access to KV for caching guild access.

  **API/Type References** (contracts to implement against):
  - Discord API: `GET /users/@me/guilds` — Returns array of `{ id, name, icon, owner, permissions }`. Rate limit: ~10 req/min.
  - Discord permission bits: `ADMINISTRATOR = 0x8`, `MANAGE_GUILD = 0x20`
  - `packages/core/src/dashboard/types.ts` (Task 2) — `GuildWithPermissions` type must match Discord API shape

  **WHY Each Reference Matters**:
  - `packages/auth/src/index.ts` is the auth system you're extending — must understand session flow
  - Discord API guilds endpoint is the data source — must handle rate limiting
  - Permission bits determine admin access — must match exactly what the bot uses

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auth module exports new functions and types correctly
    Tool: Bash
    Preconditions: packages/auth compiles
    Steps:
      1. Run: bun run typecheck --filter=@parley/auth
      2. Run: grep "readGuildAccess\|isGlobalAdmin\|GuildWithPermissions" packages/auth/src/index.ts
      3. Verify all 3 are exported
    Expected Result: Typecheck passes, all new functions and types exported
    Failure Indicators: Type errors, missing exports
    Evidence: .sisyphus/evidence/task-4-auth-exports.txt

  Scenario: Discord scope includes guilds
    Tool: Bash
    Preconditions: Auth config exists
    Steps:
      1. Run: grep '"guilds"' packages/auth/src/index.ts
      2. Verify "guilds" is in the Discord social provider scope array
      3. Run: grep 'scope.*identify.*email.*guilds' packages/auth/src/index.ts
    Expected Result: "guilds" appears in scope array alongside "identify" and "email"
    Failure Indicators: Missing "guilds" scope
    Evidence: .sisyphus/evidence/task-4-scope-check.txt

  Scenario: readGuildAccess filters by admin permissions correctly
    Tool: Bash (bun test)
    Preconditions: Test file exists
    Steps:
      1. Write test: mock Discord API response with guilds having various permission bits
      2. Call readGuildAccess with mock data
      3. Assert: guilds with ADMINISTRATOR (0x8) bit are included
      4. Assert: guilds with MANAGE_GUILD (0x20) bit are included
      5. Assert: guilds with neither bit are excluded
      6. Run: bun test packages/auth/tests/
    Expected Result: All assertions pass, only admin guilds returned
    Failure Indicators: Wrong guilds filtered, permission check incorrect
    Evidence: .sisyphus/evidence/task-4-guild-filter-test.txt
  ```

  **Evidence to Capture**:
  - [ ] task-4-auth-exports.txt — typecheck output + grep of exports
  - [ ] task-4-scope-check.txt — grep showing "guilds" in scope
  - [ ] task-4-guild-filter-test.txt — test run output

  **Commit**: YES (group with Wave 1)
  - Message: `feat(auth): add per-guild OAuth with guilds scope`
  - Files: `packages/auth/src/index.ts`
  - Pre-commit: `bun run typecheck --filter=@parley/auth && bun test packages/auth/tests/`

- [x] 5. LeaderboardDurableObject Class (Hibernation API, Caching, WebSocket)

  **What to do**:
  - Create `apps/worker/src/leaderboard-do.ts` — the LeaderboardDurableObject class
  - Implement the Cloudflare Durable Object using Hibernation API pattern:
    - `constructor(state, env)` — initialize, get Hyperdrive binding for Postgres queries
    - `fetch(request)` — handle HTTP requests for WebSocket upgrade and leaderboard data queries
    - `websockets` — use `this.ctx.acceptWebSocket(server)` for Hibernation API (NOT `server.accept()`)
    - `webSocketMessage(ws, message)` — handle incoming messages (subscribe to specific leaderboard range)
    - `webSocketClose(ws)` — handle disconnections, clean up state
    - `alarm()` — periodic leaderboard refresh from Postgres (every 30 seconds when active)
  - Implement caching layer:
    - On cold start / hibernation recovery: query Postgres for top 500 players via Hyperdrive
    - Cache in DO memory as `LeaderboardEntry[]`, sorted by internalElo desc
    - `serializeAttachment()` for per-connection state (which range the client is subscribed to)
    - Use `ctx.storage` for persistent state if needed (but prefer in-memory cache + periodic Postgres refresh)
  - Implement WebSocket connection management:
    - `ctx.setWebSocketAutoResponse()` for ping/pong keepalive
    - Tag connections by subscription range for targeted broadcasting
    - Handle reconnection: client sends `{ type: "SUBSCRIBE", range: [1, 100] }` on connect
  - Broadcast format: `{ type: "LEADERBOARD_UPDATE", data: LeaderboardEntry[], timestamp: number }`
  - Add Durable Object binding to `apps/worker/wrangler.jsonc` — `LeaderboardDO` class name
  - Export `LeaderboardDO` from `apps/worker/src/index.ts` as `export { LeaderboardDO }`

  **Must NOT do**:
  - Do NOT use `server.accept()` — use `this.ctx.acceptWebSocket(server)` (Hibernation API)
  - Do NOT add Hyperdrive/DB bindings to apps/web — the DO is accessed via the Worker
  - Do NOT query Postgres on every WebSocket message — use cached data
  - Do NOT implement the full leaderboard query logic here — call into `packages/db/src/leaderboard.ts`
  - Do NOT handle WebSocket connections from Discord — this is for web clients only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Durable Object with Hibernation API requires understanding of Cloudflare DO lifecycle, WebSocket management, and caching strategy
  - **Skills**: []
    - No special UI skills needed — backend infrastructure work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6-7)
  - **Blocks**: Tasks 11, 20
  - **Blocked By**: Task 2 (needs type definitions for LeaderboardEntry)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `apps/worker/src/index.ts` — Worker entry point with `fetch`, `queue`, `scheduled` handlers. The DO class export goes here.
  - `apps/worker/src/env.ts` — WorkerEnv/WorkerRuntimeEnv type definitions. Add `LeaderboardDO` DurableObjectNamespace to bindings.
  - `apps/worker/wrangler.jsonc` — Current bindings (HYPERDRIVE, Cache KV, Queue, ANALYTICS_ENGINE). Add `LeaderboardDO` DO binding here.
  - `apps/worker/src/runtime-db.ts` — Postgres connection via Hyperdrive. The DO should use the same pattern for DB access.

  **API/Type References** (contracts to implement against):
  - `packages/db/src/leaderboard.ts` — Existing `listGlobalLeaderboardPage()` function. The DO calls this to populate its cache.
  - `packages/core/src/leaderboard/types.ts` (Task 2) — `LeaderboardEntry`, `LeaderboardUpdate`, `LeaderboardConnected` types

  **External References** (libraries and frameworks):
  - Cloudflare Durable Objects docs: https://developers.cloudflare.com/durable-objects/ — Hibernation API, WebSocket handling, storage
  - Cloudflare WebSocket Hibernation: https://developers.cloudflare.com/durable-objects/reference/websockets/ — `ctx.acceptWebSocket()`, `ctx.setWebSocketAutoResponse()`, `ctx.getWebSockets()`

  **WHY Each Reference Matters**:
  - `index.ts` and `env.ts` are where the DO is wired in — must follow existing patterns
  - `runtime-db.ts` shows how to access Postgres via Hyperdrive — DO needs the same pattern
  - Hibernation API is critical — using `server.accept()` instead of `ctx.acceptWebSocket()` will cause memory leaks and WebSocket drops
  - `leaderboard.ts` has the query logic — don't reimplement, call into it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY — task is INCOMPLETE without these):**

  ```
  Scenario: Durable Object class is properly defined and exported
    Tool: Bash
    Preconditions: Worker compiles
    Steps:
      1. Run: bun run typecheck --filter=@parley/worker
      2. Run: grep "LeaderboardDO" apps/worker/src/index.ts — verify export
      3. Run: grep "LeaderboardDO" apps/worker/wrangler.jsonc — verify binding
      4. Run: grep "LeaderboardDurableObject\|LeaderboardDO" apps/worker/src/leaderboard-do.ts — verify class definition
    Expected Result: Typecheck passes, DO class exists, exported, bound in wrangler
    Failure Indicators: Missing export, missing binding, type errors
    Evidence: .sisyphus/evidence/task-5-do-class.txt

  Scenario: Hibernation API pattern is used correctly
    Tool: Bash
    Preconditions: Leaderboard DO file exists
    Steps:
      1. Run: grep "ctx.acceptWebSocket" apps/worker/src/leaderboard-do.ts — verify Hibernation API usage
      2. Run: grep "ctx.setWebSocketAutoResponse" apps/worker/src/leaderboard-do.ts — verify keepalive
      3. Run: grep "server.accept" apps/worker/src/leaderboard-do.ts — verify this is NOT present (forbidden pattern)
      4. Run: grep "serializeAttachment\|ctx.storage" apps/worker/src/leaderboard-do.ts — verify state persistence
    Expected Result: Uses ctx.acceptWebSocket (not server.accept), has auto-response, uses attachment/storage
    Failure Indicators: server.accept found, missing hibernation patterns
    Evidence: .sisyphus/evidence/task-5-hibernation-api.txt

  Scenario: DO handles WebSocket upgrade and messages
    Tool: Bash
    Preconditions: Worker can run locally
    Steps:
      1. Start worker with: bun run dev (or wrangler dev)
      2. Connect via: curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" http://localhost:8787/ws/leaderboard
      3. Verify upgrade response (101 Switching Protocols)
    Expected Result: WebSocket upgrade succeeds (101 response)
    Failure Indicators: 404, 500, or non-upgrade response
    Evidence: .sisyphus/evidence/task-5-ws-upgrade.txt
  ```

  **Evidence to Capture**:
  - [ ] task-5-do-class.txt — typecheck + export/binding checks
  - [ ] task-5-hibernation-api.txt — grep output for Hibernation API patterns
  - [ ] task-5-ws-upgrade.txt — curl WebSocket upgrade test

  **Commit**: YES (group with Wave 1)
  - Message: `feat(worker): add LeaderboardDurableObject`
  - Files: `apps/worker/src/leaderboard-do.ts`, `apps/worker/src/index.ts`, `apps/worker/src/env.ts`, `apps/worker/wrangler.jsonc`
  - Pre-commit: `bun run typecheck --filter=@parley/worker`

- [x] 6. Worker Leaderboard REST API Endpoint

  **What to do**:
  - Add `/api/leaderboard` route to `apps/worker/src/index.ts` fetch handler
  - Accept query parameters: `page` (default 1), `pageSize` (default 50, max 100)
  - Query Postgres via Hyperdrive using existing `listGlobalLeaderboardPage()` from `packages/db/src/leaderboard.ts`
  - Return JSON: `{ entries: LeaderboardEntry[], totalPlayers: number, page: number, pageSize: number }`
  - Add cache headers: `Cache-Control: public, max-age=30, s-maxage=60` for CDN/browser caching
  - For WebSocket upgrade on `/ws/leaderboard`, route to LeaderboardDO stub:
    1. Get DO namespace: `env.LeaderboardDO`
    2. Create stub: `env.LeaderboardDO.get(env.LeaderboardDO.idFromName("global"))`
    3. Forward the request to the stub via `stub.fetch(request)`
  - Add route handling in the Worker fetch handler (after existing `/api/auth/` routing)

  **Must NOT do**:
  - Do NOT add leaderboard query logic directly in the Worker — call into `packages/db/src/leaderboard.ts`
  - Do NOT add WebSocket logic to the Worker — forward to DO stub
  - Do NOT add new KV bindings — reuse existing `Cache` KV for any caching
  - Do NOT change the existing `/api/auth/` route handling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple route additions to existing Worker, calling existing functions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5, 7)
  - **Blocks**: Tasks 11, 22
  - **Blocked By**: Task 5 (needs DO routing for WebSocket upgrade)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `apps/worker/src/index.ts` — Main fetch handler. Add leaderboard routes after the `/api/auth/` check. Follow the same URL pattern matching.
  - `apps/worker/src/auth.ts` — `handleAuthRequest` pattern. Create similar `handleLeaderboardRequest` function.
  - `apps/worker/src/env.ts` — `WorkerEnv` type. Add `LeaderboardDO: DurableObjectNamespace` binding.

  **API/Type References** (contracts to implement against):
  - `packages/db/src/leaderboard.ts` — `listGlobalLeaderboardPage(database, input)` where input is `{ platform?, minMatches?, limit, offset }`, plus `countGlobalLeaderboard(database)` for total count.
  - `packages/core/src/leaderboard/types.ts` (Task 2) — `LeaderboardPage` return type

  **External References** (libraries and frameworks):
  - Cloudflare Workers DO routing: https://developers.cloudflare.com/durable-objects/best-practices/ — `env.NAMESPACE.get(env.NAMESPACE.idFromName(name))` pattern

  **WHY Each Reference Matters**:
  - `index.ts` is the main handler — routes must be added in the right order
  - `auth.ts` shows the pattern for creating handler functions
  - `env.ts` must include the DO binding type for TypeScript to compile

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: REST API returns leaderboard data correctly
    Tool: Bash (curl)
    Preconditions: Worker running locally with test data in Postgres
    Steps:
      1. Run: curl -s http://localhost:8787/api/leaderboard?page=1&pageSize=10 | jq .
      2. Verify: response has `entries` array, `totalPlayers` number, `page=1`, `pageSize=10`
      3. Run: curl -s http://localhost:8787/api/leaderboard?page=2&pageSize=5 | jq .
      4. Verify: pagination works (different entries than page 1)
    Expected Result: JSON response with leaderboard entries, pagination metadata
    Failure Indicators: 404, invalid JSON, missing fields, wrong page size
    Evidence: .sisyphus/evidence/task-6-api-response.txt

  Scenario: Cache headers are set correctly
    Tool: Bash (curl)
    Preconditions: Worker running
    Steps:
      1. Run: curl -sI http://localhost:8787/api/leaderboard | grep -i "cache-control"
      2. Verify: Cache-Control header includes "public, max-age=30"
    Expected Result: Cache-Control header present with correct value
    Failure Indicators: Missing or incorrect cache headers
    Evidence: .sisyphus/evidence/task-6-cache-headers.txt
  ```

  **Evidence to Capture**:
  - [ ] task-6-api-response.txt — curl output showing valid JSON with leaderboard data
  - [ ] task-6-cache-headers.txt — curl headers showing cache-control

  **Commit**: YES (group with Wave 1)
  - Message: `feat(worker): add leaderboard REST API endpoint`
  - Files: `apps/worker/src/index.ts`
  - Pre-commit: `bun run typecheck --filter=@parley/worker`

- [x] 7. HQ Dashboard API Infrastructure (Server Functions)

  **What to do**:
  - Create `apps/hq/src/lib/server/guild-settings.ts` — server functions for guild settings:
    - `getGuildSettings(headers, guildId)` — fetch settings from `guildSettings` table, with KV cache
    - `upsertGuildSettings(headers, guildId, settings)` — update settings, invalidate KV cache
    - `getGuildPlayers(headers, guildId)` — fetch player roster for a guild
  - Create `apps/hq/src/lib/server/match-history.ts` — server functions for match analytics:
    - `getMatchHistory(headers, guildId, filters)` — paginated match history
    - `getPlayerStats(headers, playerId)` — player ELO trends over time
  - Create `apps/hq/src/lib/server/tournaments.ts` — server functions for tournaments:
    - `getGuildTournaments(headers, guildId)` — list tournaments for a guild
    - `getTournamentDetail(headers, tournamentId)` — detailed tournament with brackets
  - Create `apps/hq/src/lib/server/dashboard-auth.ts` (extend existing) — per-guild auth functions:
    - `readGuildAccess(session)` — call `packages/auth` `readGuildAccess()` and return guilds with admin permission
    - `validateGuildAdmin(session, guildId)` — verify user has admin permission for specific guild
    - `isGlobalAdmin(session)` — check `AUTHORIZED_DISCORD_USER_IDS`
  - All server functions must use `createServerFn` from TanStack Start, following the pattern in `apps/hq/src/routes/index.tsx`
  - Use existing `getDatabase(headers)` helper from `apps/hq/src/lib/server/db.ts` for Postgres access

  **Must NOT do**:
  - Do NOT create new database connection helpers — reuse `getDatabase(headers)`
  - Do NOT put business logic in server functions — they should call into `packages/db` or `packages/core`
  - Do NOT add new KV bindings — reuse existing `Cache` KV
  - Do NOT modify the existing `dashboard.ts` server functions — add new files alongside

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Following established patterns (createServerFn, getDatabase), creating thin wrappers over existing packages
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-6)
  - **Blocks**: Tasks 10, 12, 13, 16, 17, 18, 19
  - **Blocked By**: Task 2 (needs type definitions), Task 3 (needs schema for guild settings)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `apps/hq/src/lib/server/dashboard.ts` — Existing server functions. Follow the `createServerFn` pattern exactly. Use `getRequestHeaders()` for auth.
  - `apps/hq/src/lib/server/db.ts` — `getDatabase(headers)` helper. Reuse this for all DB access.
  - `apps/hq/src/lib/server/auth.ts` — `createDashboardAuth()` function. Extend this for per-guild access checks.
  - `apps/hq/src/routes/index.tsx` — Shows how to use `createServerFn` and call it from a route loader.

  **API/Type References** (contracts to implement against):
  - `packages/db/src/schema.ts` — Schema for `guildSettings`, `guildLimits`, `customMatches`, `tournaments` tables
  - `packages/core/src/dashboard/types.ts` (Task 2) — `GuildSettings`, `MatchHistoryEntry`, `TournamentSummary` types

  **WHY Each Reference Matters**:
  - `dashboard.ts` establishes the server function pattern — must follow exactly for consistency
  - `db.ts` handles Postgres connections via Hyperdrive headers — must reuse, not recreate
  - `auth.ts` is the existing auth check — extend for guild-level access
  - Schema types ensure API responses match the database

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Server functions compile and export correctly
    Tool: Bash
    Preconditions: HQ app compiles
    Steps:
      1. Run: bun run typecheck --filter=@parley/hq
      2. Run: grep "getGuildSettings\|getMatchHistory\|readGuildAccess\|validateGuildAdmin" apps/hq/src/lib/server/guild-settings.ts apps/hq/src/lib/server/match-history.ts apps/hq/src/lib/server/dashboard-auth.ts
      3. Verify all functions are exported and follow createServerFn pattern
    Expected Result: Typecheck passes, all functions exported with createServerFn
    Failure Indicators: Type errors, missing exports, wrong pattern
    Evidence: .sisyphus/evidence/task-7-server-functions.txt

  Scenario: Guild access check uses auth package correctly
    Tool: Bash
    Preconditions: Auth package updated (Task 4)
    Steps:
      1. Run: grep "readGuildAccess\|isGlobalAdmin\|AUTHORIZED" apps/hq/src/lib/server/dashboard-auth.ts
      2. Verify: Function calls into packages/auth functions
      3. Verify: validateGuildAdmin checks both guild admin and global admin
    Expected Result: Auth delegation to packages/auth, dual check (guild admin OR global admin)
    Failure Indicators: Manual permission checks, not delegating to packages/auth
    Evidence: .sisyphus/evidence/task-7-auth-delegation.txt
  ```

  **Evidence to Capture**:
  - [ ] task-7-server-functions.txt — typecheck + grep of exports
  - [ ] task-7-auth-delegation.txt — auth delegation pattern verification

  **Commit**: YES (group with Wave 1)
  - Message: `feat(hq): add dashboard API server functions`
  - Files: `apps/hq/src/lib/server/guild-settings.ts`, `apps/hq/src/lib/server/match-history.ts`, `apps/hq/src/lib/server/tournaments.ts`, `apps/hq/src/lib/server/dashboard-auth.ts`
  - Pre-commit: `bun run typecheck --filter=@parley/hq`

- Pre-commit: `bun run typecheck --filter=@parley/hq`

- [ ] 8. Hero Section Redesign

  **What to do**:
  - Completely redesign `apps/web/src/components/hero.tsx` for premium dark depth aesthetic
  - Replace the current static hero with a visually striking, layered design:
    - **Background**: Multi-layer gradient (deep navy #0a0a1a → electric blue #3b82f6 → violet #7c3aed) with animated noise texture overlay
    - **Depth effects**: Multiple glass-morphism panels at different z-levels with `backdrop-blur`, subtle border glow using the design system's `.glow-border` and `.depth-panel` classes from Task 1
    - **Floating elements**: 3D-transformed stat cards floating at slight angles around the hero, showing live player count, match count, tournaments active
    - **Typography**: Massive gradient text title using `.gradient-text` from Task 1, with "PARLEY" in Space Grotesk weight 700, subtitle in weight 400
    - **CTA buttons**: Primary button with gradient fill + glow on hover, secondary button with glass effect. Discord invite + "View Leaderboard" links
    - **Entrance animation**: Staggered fade-up on mount (title → subtitle → buttons → floating cards) using CSS transitions
  - Create supporting components: `FloatingStatCard`, `GradientButton`, `GlassPanel` in `apps/web/src/components/ui/`
  - Update `apps/web/src/routes/index.tsx` to use the new hero section
  - Ensure responsive: hero should look great on mobile (simplified) and desktop (full effects)

  **Must NOT do**:
  - Do NOT add third-party animation libraries (framer-motion, etc.) — use CSS transitions and animations only
  - Do NOT use inline styles — use the design system tokens from Task 1
  - Do NOT remove the existing hero file reference in other components without updating them
  - Do NOT optimize for Safari only — test basic animations on Chrome, Firefox, Safari

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Core visual redesign requiring design system integration, animation, and responsive layout
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Premium dark depth style, glass morphism, depth effects, animation guidance
    - `frontend-design`: Responsive layout, component architecture, CSS transitions

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (starts after Task 1)
  - **Blocks**: Task 15
  - **Blocked By**: Task 1 (design system tokens)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `apps/web/src/components/hero.tsx` — Current hero component. Understand structure and props, then replace content
  - `apps/web/src/styles.css` — Design tokens from Task 1 (`.depth-panel`, `.gradient-text`, `.glow-border`, `.shimmer`)
  - `apps/web/src/components/ui/button.tsx` — CVA button pattern. Extend with new gradient variant
  - `apps/web/src/routes/index.tsx` — Main page that composes sections. Understand section composition pattern

  **External References** (libraries and frameworks):
  - Tailwind CSS 4: https://tailwindcss.com/docs — CSS-first config, custom properties
  - CSS backdrop-filter: https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter — Glass morphism effects

  **WHY Each Reference Matters**:
  - `hero.tsx` must be redesigned in place — other components import from this path
  - Design tokens from Task 1 define the entire visual language — must use them
  - CVA button pattern is established — new variants follow this pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hero section renders with premium dark depth design
    Tool: Playwright
    Preconditions: Dev server running at http://localhost:3001
    Steps:
      1. Navigate to http://localhost:3001
      2. Wait for hero section to fully render (timeout: 10s)
      3. Assert: hero section contains h1 with "Parley" text
      4. Assert: at least one gradient text element exists (.gradient-text or inline gradient)
      5. Assert: CTA buttons exist with visible text
      6. Assert: floating stat cards exist with depth effects
      7. Take screenshot: .sisyphus/evidence/task-8-hero-desktop.png
    Expected Result: Hero renders with layered dark panels, gradient text, glow effects, floating cards
    Failure Indicators: Plain text hero, no depth effects, missing gradient text, no floating cards
    Evidence: .sisyphus/evidence/task-8-hero-desktop.png

  Scenario: Hero responsive on mobile
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Set viewport to 375px width (mobile)
      2. Navigate to http://localhost:3001
      3. Assert: hero content is readable, no horizontal overflow
      4. Assert: CTA buttons are visible and tappable
      5. Take screenshot: .sisyphus/evidence/task-8-hero-mobile.png
    Expected Result: Hero adapts to mobile — simplified layout, readable text, tappable buttons
    Failure Indicators: Horizontal scroll, overlapping text, untappable buttons
    Evidence: .sisyphus/evidence/task-8-hero-mobile.png

  Scenario: Hero CSS animations work without JS errors
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:3001
      2. Wait 2 seconds for entrance animations
      3. Assert: no console errors
      4. Assert: CSS animations are present (check for animation or transition properties on hero elements)
    Expected Result: No JS errors, CSS animations present and functional
    Failure Indicators: Console errors, missing animations, static elements
    Evidence: .sisyphus/evidence/task-8-hero-animations.txt
  ```

  **Evidence to Capture**:
  - [ ] task-8-hero-desktop.png — desktop screenshot
  - [ ] task-8-hero-mobile.png — mobile screenshot
  - [ ] task-8-hero-animations.txt — console log check output

  **Commit**: YES
  - Message: `feat(web): redesign hero section with premium dark depth`
  - Files: `apps/web/src/components/hero.tsx`, `apps/web/src/components/ui/`, `apps/web/src/routes/index.tsx`
  - Pre-commit: `bun run typecheck --filter=@parley/web && oxfmt --check apps/web/src/`

- [ ] 9. Landing Page Sections — How it Works, Community Stats, FAQ

  **What to do**:
  - Create `apps/web/src/components/how-it-works.tsx` — Three-step visual walkthrough:
    - Step 1: "Add to Server" — Discord bot invite icon, brief description
    - Step 2: "Link & Play" — Player linking icon, match-making description
    - Step 3: "Climb the Ranks" — Leaderboard icon, ELO ranking description
    - Each step has a number badge (using design system `.depth-panel`), icon, title, description
    - Connected by a gradient line/arrow between steps
    - Responsive: horizontal on desktop, vertical on mobile
  - Create `apps/web/src/components/community-stats.tsx` — Live stats section (initially with static placeholder data):
    - Total players, active matches today, tournaments completed, servers using Parley
    - Each stat in a `.depth-panel` card with large number + label
    - Numbers animate up on scroll into view (CSS counter animation)
    - Data source: Server function that fetches from Worker `/api/stats` (use static values initially, Task 22 adds live data)
  - Create `apps/web/src/components/faq.tsx` — Accordion-style FAQ section:
    - "How does ELO ranking work?", "Is the bot free?", "Which platforms are supported?", "How do tournaments work?", "Can I customize match rules?"
    - Each item expandable with smooth height animation
    - Use design system tokens for spacing, typography, depth
  - Update `apps/web/src/routes/index.tsx` to compose all sections in order: Hero → How it Works → Community Stats → Leaderboard Preview (Task 15) → Features → FAQ → Footer

  **Must NOT do**:
  - Do NOT fetch live data for community stats yet — use static placeholder values (Task 22 adds live data)
  - Do NOT add third-party animation libraries — CSS animations only
  - Do NOT create separate pages/routes for these sections — they're all on the landing page
  - Do NOT remove existing features/footer sections without replacing them

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Multiple landing page sections with visual design, animation, and responsive layout
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Section layout, visual hierarchy, dark theme styling
    - `frontend-design`: Responsive component creation, CSS animations

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10, 11, 12 — they depend on different foundations)
  - **Parallel Group**: Wave 2 (with Tasks 8, 10-12)
  - **Blocks**: Task 22
  - **Blocked By**: Task 1 (design system tokens)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `apps/web/src/components/features.tsx` — Current features section. Understand the section layout pattern (`.lp-section`, `.lp-container`, `.lp-grid-3`)
  - `apps/web/src/components/footer.tsx` — Current footer. Understand CTA + links pattern
  - `apps/web/src/styles.css` — Design tokens from Task 1. `.depth-panel`, `.gradient-text`, `.glow-border`
  - `apps/web/src/routes/index.tsx` — Main page composition. Add new sections to the composition.

  **WHY Each Reference Matters**:
  - `features.tsx` shows the established section layout pattern — follow it for consistency
  - Design tokens define the visual language — must use them
  - `index.tsx` is where all sections are composed — must add new sections in order

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Landing page has all new sections
    Tool: Playwright
    Preconditions: Dev server running at http://localhost:3001
    Steps:
      1. Navigate to http://localhost:3001
      2. Assert: "How it Works" section visible (3 steps)
      3. Assert: "Community Stats" section visible (4 stat cards)
      4. Assert: "FAQ" section visible (5+ questions)
      5. Take full-page screenshot: .sisyphus/evidence/task-9-landing-sections.png
    Expected Result: All 3 new sections visible with proper content and styling
    Failure Indicators: Missing sections, unstyled content, layout broken
    Evidence: .sisyphus/evidence/task-9-landing-sections.png

  Scenario: FAQ accordion expands and collapses
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:3001
      2. Scroll to FAQ section
      3. Click first FAQ question
      4. Assert: answer text visible with smooth height animation
      5. Click same question again
      6. Assert: answer text hidden
    Expected Result: FAQ items toggle open/closed with animation
    Failure Indicators: No toggle, instant snap (no animation), broken layout
    Evidence: .sisyphus/evidence/task-9-faq-accordion.png

  Scenario: Sections responsive on mobile
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Set viewport to 375px width
      2. Navigate to http://localhost:3001
      3. Assert: "How it Works" displays vertically on mobile
      4. Assert: stat cards stack properly
      5. Take screenshot: .sisyphus/evidence/task-9-sections-mobile.png
    Expected Result: All sections adapt to mobile layout
    Failure Indicators: Horizontal scroll, overlapping content, hidden content
    Evidence: .sisyphus/evidence/task-9-sections-mobile.png
  ```

  **Evidence to Capture**:
  - [ ] task-9-landing-sections.png — desktop full-page screenshot
  - [ ] task-9-faq-accordion.png — FAQ toggle state
  - [ ] task-9-sections-mobile.png — mobile layout screenshot

  **Commit**: YES
  - Message: `feat(web): add how-it-works, community stats, and FAQ sections`
  - Files: `apps/web/src/components/how-it-works.tsx`, `apps/web/src/components/community-stats.tsx`, `apps/web/src/components/faq.tsx`, `apps/web/src/routes/index.tsx`
  - Pre-commit: `bun run typecheck --filter=@parley/web && oxfmt --check apps/web/src/`

- [ ] 10. Dashboard Auth Flow UI — Login, Guild Selector, Guards

  **What to do**:
  - Modify `apps/hq/src/components/hq-dashboard.tsx` to add per-guild auth flow:
    - **Signed out state**: Keep "Sign in with Discord" button, add "administrator permission required" subtitle
    - **Forbidden state (no admin guilds)**: Show "No admin access" message with "You need Administrator or Manage Server permission in a Discord server to access the dashboard."
    - **Guild selector state**: After auth, show guild picker if user has admin in multiple guilds. Each guild card shows guild icon, name, and "Manage" button.
    - **Global admin state**: Users in `AUTHORIZED_DISCORD_USER_IDS` see "All Servers" option + individual guilds
  - Create `apps/hq/src/components/guild-selector.tsx` — guild selection grid:
    - Shows all guilds where user has admin (from `readGuildAccess()`)
    - Each card: guild icon (from Discord CDN), guild name, member count, "Manage" button
    - Grid layout using design system tokens
    - "All Servers" card for global admins
  - Create `apps/hq/src/hooks/use-guild-access.ts` — TanStack Query hook:
    - Calls `readGuildAccess` server function on mount
    - Returns `{ guilds: GuildWithPermissions[], isLoading, error }`
    - Caches for 5 minutes (matching KV cache TTL)
  - Add auth guard wrapper component `apps/hq/src/components/auth-guard.tsx`:
    - Takes `guildId` prop, validates user has admin access
    - Shows 403 page if user doesn't have permission
    - Redirects to guild selector if not authenticated
  - Modify `apps/hq/src/routes/index.tsx` to add guild-based routing (if not already):

  **Must NOT do**:
  - Do NOT remove the existing dashboard data/analytics view for global admins
  - Do NOT add guild selection to the Worker bot — this is dashboard-only
  - Do NOT store guild access in local storage — always validate server-side

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Auth flow UI with guild selection, permission guards, responsive layout
  - **Skills**: [`ui-ux-pro-max`]
    - `ui-ux-pro-max`: Dark theme dashboard UI, card layout, auth flow design

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on auth and API infrastructure)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 12, 13
  - **Blocked By**: Tasks 2, 4, 7 (needs types, auth system, server functions)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `apps/hq/src/components/hq-dashboard.tsx:1-100` — Current dashboard with auth states (signed_out, forbidden, authorized). Extend these states with guild selector.
  - `apps/hq/src/lib/server/dashboard.ts:459-496` — `getDashboardPageData` function that returns auth status. Extend for guild access.
  - `apps/hq/src/lib/auth-client.ts` — Auth client. Uses `better-auth/react`. Follow this pattern.
  - `apps/hq/src/integrations/tanstack-query/` — React Query setup. Follow for new hooks.

  **API/Type References** (contracts to implement against):
  - `packages/core/src/dashboard/types.ts` (Task 2) — `GuildWithPermissions`, `SessionWithGuilds` types
  - `packages/auth/src/index.ts` (Task 4) — `readGuildAccess()`, `isGlobalAdmin()`, `AUTHORIZED_DISCORD_USER_IDS`

  **WHY Each Reference Matters**:
  - `hq-dashboard.tsx` controls the auth flow UI — must extend for guild permissions
  - Auth states dictate what the user sees — must handle all 4 states (signed_out, forbidden, guilds, authorized_admin)
  - React Query is the established data fetching pattern — new hooks must follow it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auth flow shows correct states
    Tool: Playwright
    Preconditions: HQ dashboard running at http://localhost:3000
    Steps:
      1. Navigate to http://localhost:3000 without auth
      2. Assert: "Sign in with Discord" button visible
      3. Assert: "administrator permission required" subtitle visible
      4. Take screenshot: .sisyphus/evidence/task-10-auth-signed-out.png
    Expected Result: Sign in page shown with admin permission requirement
    Failure Indicators: Missing subtitle, broken layout, error on page
    Evidence: .sisyphus/evidence/task-10-auth-signed-out.png

  Scenario: Guild selector shows user's admin guilds
    Tool: Playwright
    Preconditions: User is authenticated with admin in 2+ guilds
    Steps:
      1. Navigate to http://localhost:3000 (authenticated)
      2. Assert: Guild selector grid visible with guild cards
      3. Assert: Each guild card shows guild icon, name, "Manage" button
      4. Assert: Global admin users see "All Servers" card
      5. Take screenshot: .sisyphus/evidence/task-10-guild-selector.png
    Expected Result: Guild selector with accessible guilds, "All Servers" for global admins
    Failure Indicators: Missing guilds, no icons, broken cards, error on page
    Evidence: .sisyphus/evidence/task-10-guild-selector.png

  Scenario: Non-admin user sees forbidden state
    Tool: Playwright
    Preconditions: Authenticated user with no admin guilds
    Steps:
      1. Navigate to http://localhost:3000 (authenticated, no admin guilds)
      2. Assert: "No admin access" message visible
      3. Assert: Explanation about Administrator/ManageGuild requirement
      4. Take screenshot: .sisyphus/evidence/task-10-forbidden.png
    Expected Result: Clear forbidden message with explanation
    Failure Indicators: Generic error, unintelligible message, redirect loop
    Evidence: .sisyphus/evidence/task-10-forbidden.png
  ```

  **Evidence to Capture**:
  - [ ] task-10-auth-signed-out.png — signed-out state screenshot
  - [ ] task-10-guild-selector.png — guild selector screenshot
  - [ ] task-10-forbidden.png — forbidden state screenshot

  **Commit**: YES
  - Message: `feat(hq): add per-guild auth flow with guild selector`
  - Files: `apps/hq/src/components/hq-dashboard.tsx`, `apps/hq/src/components/guild-selector.tsx`, `apps/hq/src/hooks/use-guild-access.ts`, `apps/hq/src/components/auth-guard.tsx`
  - Pre-commit: `bun run typecheck --filter=@parley/hq`

- [ ] 11. Leaderboard DO Broadcast + Reconnection Logic

  **What to do**:
  - Extend `apps/worker/src/leaderboard-do.ts` (from Task 5) with broadcast and reconnection logic:
    - **Broadcast on update**: When `fetch()` receives a POST from the Worker (match completion notification), query Postgres for top 500, update cache, broadcast `{ type: "LEADERBOARD_UPDATE", data: [...], timestamp }` to all connected clients
    - **Subscription ranges**: Track per-connection subscription range via `serializeAttachment()`. Client sends `{ type: "SUBSCRIBE", range: [1, 100] }`. Only send updates relevant to their range.
    - **Reconnection handling**: Client sends `{ type: "SUBSCRIBE" }` on connect. DO responds with current cache state in `{ type: "LEADERBOARD_SNAPSHOT", data: [...] }` message.
    - **Connection lifecycle**: Remove connections on `webSocketClose()` and `webSocketError()`. Use `ctx.getWebSockets()` to enumerate active connections.
    - **Alarm for periodic refresh**: Set `ctx.storage.setAlarm()` for 30-second intervals when clients are connected. On alarm, refresh cache from Postgres and broadcast to all clients.
    - **Hibernation**: After hibernation recovery, `ctx.getWebSockets()` returns reconnected clients. Re-send snapshot to each on reconnect.
  - Add notification endpoint to Worker: `POST /api/leaderboard/notify` that forwards to DO stub
  - Client-side WebSocket hook: Create `apps/web/src/hooks/use-leaderboard-ws.ts`:
    - Connects to `wss://parley.bot/ws/leaderboard` (or `ws://localhost:8787` in dev)
    - Handles reconnection with exponential backoff (1s → 2s → 4s → max 30s)
    - Maintains `LeaderboardEntry[]` state, updated on `LEADERBOARD_UPDATE` messages
    - Sends `SUBSCRIBE` message on connect/reconnect
    - Returns `{ entries, isConnected, lastUpdated }`

  **Must NOT do**:
  - Do NOT broadcast to all clients on every WebSocket message — only on leaderboard updates
  - Do NOT store per-client data in `ctx.storage` (expensive) — use `serializeAttachment()` for transient state
  - Do NOT query Postgres on every client connect — use cached data and re-send snapshot
  - Do NOT add the WebSocket hook to apps/hq — leaderboard is web-only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex WebSocket lifecycle management, DO hibernation, reconnection logic, and client-side hook
  - **Skills**: [`typescript-advanced-types`]
    - `typescript-advanced-types`: Discriminated unions for WebSocket message types, proper typing of DO state

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 14, 20
  - **Blocked By**: Tasks 5, 6 (needs DO class and REST API endpoint)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `apps/worker/src/leaderboard-do.ts` (Task 5) — DO class created in Wave 1. Extend with broadcast logic.
  - `apps/worker/src/index.ts` — Worker fetch handler. Add `/api/leaderboard/notify` POST route.
  - `apps/web/src/hooks/` — Create hooks directory if not exists. Follow TanStack Query patterns for state management.

  **API/Type References** (contracts to implement against):
  - `packages/core/src/leaderboard/types.ts` (Task 2) — `LeaderboardUpdate`, `LeaderboardConnected`, `LeaderboardSnapshot` message types
  - `packages/db/src/leaderboard.ts` — `listGlobalLeaderboardPage()` for cache refreshes

  **External References** (libraries and frameworks):
  - Cloudflare DO WebSocket Hibernation: https://developers.cloudflare.com/durable-objects/reference/websockets/
  - `serializeAttachment()` pattern: https://developers.cloudflare.com/durable-objects/best-practices/

  **WHY Each Reference Matters**:
  - DO class from Task 5 is the foundation — extend, don't rewrite
  - WebSocket messages must match types from Task 2 — client and server must agree
  - Hibernation pattern is critical for cost and correctness — wrong pattern causes memory leaks

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DO broadcasts update to connected clients
    Tool: interactive_bash (tmux)
    Preconditions: Worker running locally, DO deployed
    Steps:
      1. Open tmux session
      2. Connect a test WebSocket client to ws://localhost:8787/ws/leaderboard
      3. Send SUBSCRIBE message: {"type": "SUBSCRIBE", "range": [1, 100]}
      4. Verify: receive LEADERBOARD_SNAPSHOT response within 5 seconds
      5. From another terminal, send: curl -X POST http://localhost:8787/api/leaderboard/notify
      6. Verify: WebSocket client receives LEADERBOARD_UPDATE message within 5 seconds
    Expected Result: Snapshot on connect, update on notification
    Failure Indicators: No snapshot, no update, connection drops
    Evidence: .sisyphus/evidence/task-11-broadcast-test.txt

  Scenario: Client-side reconnection works
    Tool: Bash
    Preconditions: Web app running
    Steps:
      1. Run: bun test apps/web/tests/use-leaderboard-ws.test.ts (or equivalent)
      2. Test: WebSocket disconnects → reconnect within 30s → receive snapshot
      3. Test: Multiple reconnections → state stays consistent
    Expected Result: Reconnection with backoff, state remains consistent
    Failure Indicators: Infinite reconnect loop, state loss, missed updates
    Evidence: .sisyphus/evidence/task-11-reconnection-test.txt

  Scenario: Typecheck passes for DO and hook
    Tool: Bash
    Preconditions: Both packages compile
    Steps:
      1. Run: bun run typecheck --filter=@parley/worker
      2. Run: bun run typecheck --filter=@parley/web
    Expected Result: 0 type errors in both packages
    Failure Indicators: Type errors in DO or hook
    Evidence: .sisyphus/evidence/task-11-typecheck.txt
  ```

  **Evidence to Capture**:
  - [ ] task-11-broadcast-test.txt — WebSocket broadcast test output
  - [ ] task-11-reconnection-test.txt — reconnection test output
  - [ ] task-11-typecheck.txt — typecheck results

  **Commit**: YES
  - Message: `feat(worker): add leaderboard DO broadcast and reconnection`
  - Files: `apps/worker/src/leaderboard-do.ts`, `apps/worker/src/index.ts`, `apps/web/src/hooks/use-leaderboard-ws.ts`
  - Pre-commit: `bun run typecheck`

- [ ] 12. Dashboard Layout + Navigation Shell

  **What to do**:
  - Create sidebar navigation layout for `apps/hq`:
    - **Sidebar**: Dark depth panel (using Task 1 design tokens), collapsible, with Parley logo at top
    - **Navigation items**: Home (analytics), Settings, Players, Match History, Tournaments, Match Rules, Notifications
    - **Active state**: Highlighted nav item with gradient background
    - **Guild context**: Shows currently selected guild name + icon in sidebar header
    - **Global admin**: "All Servers" badge visible for global admins
  - Create `apps/hq/src/components/sidebar.tsx` — sidebar component with nav items
  - Create `apps/hq/src/components/dashboard-layout.tsx` — main layout wrapper with sidebar + content area
  - Create route structure in `apps/hq/src/routes/`:
    - `routes/__root.tsx` — Update to wrap with `DashboardLayout` for authenticated routes
    - `routes/index.tsx` — Keep as guild selector / dashboard home
    - `routes/guild/$guildId/` — Guild-specific routes (settings, players, matches, tournaments, rules, notifications)
  - Use TanStack Router's file-based routing with `createFileRoute` for nested guild routes
  - Mobile responsive: sidebar collapses to hamburger menu on mobile

  **Must NOT do**:
  - Do NOT create individual page content yet — this task is shell/layout only
  - Do NOT add data fetching to the layout — pages handle their own data
  - Do NOT use third-party layout libraries (Radix, shadcn/ui sidebar) — build with design system tokens
  - Do NOT remove the existing root route functionality (auth check, devtools)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard layout with sidebar navigation, responsive design, visual consistency
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]
    - `ui-ux-pro-max`: Dashboard layout patterns, sidebar navigation, dark theme styling
    - `frontend-design`: Responsive layout, route structure

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on auth flow and design tokens)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13, 16, 17, 18, 19
  - **Blocked By**: Task 1 (design tokens), Task 10 (auth flow for guild context)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `apps/hq/src/routes/__root.tsx` — Current root route with auth check, dark mode, devtools. Extend, don't replace.
  - `apps/hq/src/routes/index.tsx` — Current single-page dashboard. Will become guild selector/home.
  - `apps/hq/src/styles.css` — Design tokens from Task 1. Use `.depth-panel` for sidebar, tokens for spacing/colors.
  - `apps/hq/src/components/hq-dashboard.tsx` — Current dashboard UI. Understand how auth states are handled.
  - `apps/web/src/routes/__root.tsx` — Web app root route for reference on TanStack Router layout patterns.

  **API/Type References** (contracts to implement against):
  - `packages/core/src/dashboard/types.ts` (Task 2) — `GuildWithPermissions` for guild context in sidebar
  - TanStack Router: https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing — Route structure patterns

  **WHY Each Reference Matters**:
  - `__root.tsx` is the layout foundation — must understand how auth and routing work
  - Design tokens ensure visual consistency across sidebar and landing page
  - TanStack Router file-based routing determines how routes are structured

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard layout renders with sidebar
    Tool: Playwright
    Preconditions: HQ dashboard running at http://localhost:3000, user authenticated
    Steps:
      1. Navigate to http://localhost:3000 (authenticated with admin guild)
      2. Select a guild
      3. Assert: sidebar is visible with navigation items
      4. Assert: Parley logo/brand visible in sidebar header
      5. Assert: guild name/icon visible in sidebar
      6. Assert: nav items: Home, Settings, Players, Match History, Tournaments, Match Rules, Notifications
      7. Take screenshot: .sisyphus/evidence/task-12-dashboard-layout.png
    Expected Result: Sidebar with all nav items, guild context visible
    Failure Indicators: Missing sidebar, missing nav items, broken layout
    Evidence: .sisyphus/evidence/task-12-dashboard-layout.png

  Scenario: Sidebar is responsive on mobile
    Tool: Playwright
    Preconditions: HQ dashboard running
    Steps:
      1. Set viewport to 375px width
      2. Navigate to guild dashboard
      3. Assert: sidebar collapses to hamburger menu
      4. Click hamburger → Assert: sidebar slides in
      5. Take screenshot: .sisyphus/evidence/task-12-mobile-layout.png
    Expected Result: Collapsible sidebar on mobile with toggle
    Failure Indicators: Sidebar covers content, no toggle, horizontal scroll
    Evidence: .sisyphus/evidence/task-12-mobile-layout.png

  Scenario: Navigation routes work
    Tool: Playwright
    Preconditions: Authenticated in guild dashboard
    Steps:
      1. Click "Settings" nav item
      2. Assert: URL changes to /guild/{guildId}/settings
      3. Assert: "Settings" nav item shows active state
      4. Click "Match History" nav item
      5. Assert: URL changes to /guild/{guildId}/matches
    Expected Result: Navigation changes routes correctly with active state
    Failure Indicators: 404, no active state highlighting, route errors
    Evidence: .sisyphus/evidence/task-12-navigation.txt
  ```

  **Evidence to Capture**:
  - [ ] task-12-dashboard-layout.png — desktop sidebar screenshot
  - [ ] task-12-mobile-layout.png — mobile collapsed sidebar
  - [ ] task-12-navigation.txt — route navigation test output

  **Commit**: YES
  - Message: `feat(hq): add dashboard layout with sidebar navigation`
  - Files: `apps/hq/src/components/sidebar.tsx`, `apps/hq/src/components/dashboard-layout.tsx`, `apps/hq/src/routes/__root.tsx`, `apps/hq/src/routes/guild/`
  - Pre-commit: `bun run typecheck --filter=@parley/hq && oxfmt --check apps/hq/src/`

- [ ] 13. Dashboard Guild Settings + Player Roster

  **What to do**:
  - Create `apps/hq/src/routes/guild/$guildId/settings.tsx` — guild settings page:
    - Load guild settings via `getGuildSettings` server function
    - Auth guard: verify user has admin access via `validateGuildAdmin`
    - Settings form: daily match limit (from existing `guildLimits`), default team format, auto-balance toggle, cross-guild matchmaking toggle
    - Save via `upsertGuildSettings` server function with optimistic updates
    - Show success/error toast on save
  - Create `apps/hq/src/routes/guild/$guildId/players.tsx` — player roster page:
    - Load guild players via `getGuildPlayers` server function
    - Table showing: username, platform, ELO, matches played, wins, losses, win rate
    - Sort by ELO (default), matches, wins
    - Search/filter by username
    - Pagination for large rosters
  - Both pages use design system tokens from Task 1, sidebar navigation from Task 12

  **Must NOT do**:
  - Do NOT add player management (add/remove) — that stays as Discord bot commands
  - Do NOT modify the existing `/limit` Discord command — dashboard reads/writes same data
  - Do NOT bypass auth guards — every page must validate guild admin access

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`ui-ux-pro-max`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14-18)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 7, 12 (needs schema, server functions, layout)

  **References**:
  - `packages/db/src/schema.ts:122-135` — `guildLimits` table. Settings form reads/writes this.
  - `apps/hq/src/lib/server/guild-settings.ts` (Task 7) — Server functions to call
  - `apps/hq/src/lib/server/dashboard-auth.ts` (Task 7) — Auth guard for guild access
  - `apps/hq/src/components/dashboard-layout.tsx` (Task 12) — Layout wrapper to use
  - `apps/hq/src/components/hq-dashboard.tsx:395-470` — Existing data table pattern. Follow for player roster.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Settings page loads and saves correctly
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/settings (authenticated as guild admin)
      2. Assert: settings form visible with current values
      3. Change daily match limit to 50
      4. Click "Save"
      5. Assert: success toast visible
      6. Assert: value persists after page reload
    Expected Result: Settings load, edit, and save correctly
    Evidence: .sisyphus/evidence/task-13-settings.png

  Scenario: Player roster displays and sorts
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/players
      2. Assert: player table visible with columns (username, platform, ELO, matches, wins)
      3. Click "ELO" column header
      4. Assert: table sorted by ELO descending
      5. Type in search box → Assert: table filters
    Expected Result: Roster displays, sorts, and filters
    Evidence: .sisyphus/evidence/task-13-players.png

  Scenario: Non-admin user sees 403
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/settings (authenticated but NOT admin of this guild)
      2. Assert: 403 forbidden page visible
    Expected Result: Access denied with clear message
    Evidence: .sisyphus/evidence/task-13-forbidden.png
  ```

  **Commit**: YES
  - Message: `feat(hq): add guild settings and player roster`
  - Files: `apps/hq/src/routes/guild/$guildId/settings.tsx`, `apps/hq/src/routes/guild/$guildId/players.tsx`

- [ ] 14. /leaderboard Route — Full Page with WebSocket

  **What to do**:
  - Create `apps/web/src/routes/leaderboard.tsx` — dedicated leaderboard page with TanStack Router
  - Page structure:
    - **Header**: "Global Leaderboard" title with animated gradient, subtitle "Real-time R6 Siege Rankings"
    - **Filters**: Platform filter (All, PC, Xbox, PlayStation), search by username
    - **Leaderboard table**: Rank, Player name, Platform badge, ELO (with trend arrow ↑↓→), Matches, Wins, Losses, Win rate
    - **Each row**: Depth panel styling, hover glow effect, platform-specific icon/color
    - **Pagination**: "Previous/Next" buttons with page number, showing 50 players per page
    - **Live indicator**: Pulsing green dot + "LIVE" badge when WebSocket connected, "Connecting..." when reconnecting
    - **Real-time updates**: Use `useLeaderboardWs` hook (Task 11). On `LEADERBOARD_UPDATE`, smoothly animate row position changes with CSS transitions
  - SSR initial data: Call Worker `/api/leaderboard` endpoint on server-side for first paint, then switch to WebSocket for updates
  - Create TanStack Router route in `apps/web/src/routes/leaderboard.tsx` with `createFileRoute`

  **Must NOT do**:
  - Do NOT add Hyperdrive or DB bindings to apps/web — initial data via HTTP, updates via WebSocket
  - Do NOT implement infinite scroll — use standard pagination (50 per page)
  - Do NOT add caching layers in the web app — the Worker and DO handle caching

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Task 11 (needs WebSocket hook)

  **References**:
  - `apps/web/src/hooks/use-leaderboard-ws.ts` (Task 11) — WebSocket hook to use
  - `packages/core/src/leaderboard/types.ts` (Task 2) — `LeaderboardEntry`, `LeaderboardPage` types
  - `apps/web/src/styles.css` (Task 1) — Design tokens: `.depth-panel`, `.gradient-text`, `.glow-border`
  - `apps/web/src/routes/__root.tsx` — Route definition pattern
  - `apps/worker/src/index.ts` (Task 6) — `/api/leaderboard` endpoint for SSR data

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Leaderboard page renders with data
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:3001/leaderboard
      2. Assert: "Global Leaderboard" title visible
      3. Assert: Player rows visible (rank, name, ELO, matches)
      4. Assert: "LIVE" indicator visible when WebSocket connected
      5. Assert: platform filter buttons visible
      6. Take screenshot: .sisyphus/evidence/task-14-leaderboard.png
    Expected Result: Full leaderboard with data, filters, and live indicator
    Evidence: .sisyphus/evidence/task-14-leaderboard.png

  Scenario: Leaderboard updates in real-time
    Tool: interactive_bash (tmux)
    Steps:
      1. Open leaderboard page in browser
      2. From another terminal, trigger a match completion notification: curl -X POST http://localhost:8787/api/leaderboard/notify
      3. Assert: leaderboard rows update position within 5 seconds
      4. Assert: "LIVE" indicator stays connected
    Expected Result: Row positions animate smoothly after update
    Failure Indicators: No visible change, WebSocket disconnects, page crashes
    Evidence: .sisyphus/evidence/task-14-realtime.txt

  Scenario: Pagination works correctly
    Tool: Playwright
    Steps:
      1. Navigate to /leaderboard
      2. Click "Next" pagination button
      3. Assert: URL updates to /leaderboard?page=2
      4. Assert: Different players shown (not page 1)
      5. Click "Previous"
      6. Assert: Back to page 1
    Expected Result: Pagination navigates between pages smoothly
    Evidence: .sisyphus/evidence/task-14-pagination.png
  ```

  **Commit**: YES
  - Message: `feat(web): add /leaderboard route with WebSocket`
  - Files: `apps/web/src/routes/leaderboard.tsx`, `apps/web/src/routeTree.gen.ts`

- [ ] 15. Leaderboard Live Preview on Landing Page

  **What to do**:
  - Create `apps/web/src/components/leaderboard-preview.tsx` — mini leaderboard section for the landing page:
    - Shows top 10 players with rank, name, ELO, platform
    - "View Full Leaderboard →" link to `/leaderboard`
    - Live update indicator (pulsing dot + "LIVE")
    - Uses same `useLeaderboardWs` hook but only subscribes to top 10
    - Each row uses `.depth-panel` styling with subtle hover glow
    - Animated row position changes when ELO updates
  - Add section to `apps/web/src/routes/index.tsx` between Community Stats and Features sections:
    `Hero → How it Works → Community Stats → Leaderboard Preview → Features → FAQ → Footer`

  **Must NOT do**:
  - Do NOT duplicate leaderboard component code — extract shared parts into `apps/web/src/components/leaderboard-row.tsx`
  - Do NOT fetch data from anywhere other than the Worker API or WebSocket
  - Do NOT make this section overly large — it's a preview, the full page is at `/leaderboard`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`ui-ux-pro-max`, `frontend-design`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 8, 14 (needs hero section and leaderboard route)

  **References**:
  - `apps/web/src/routes/leaderboard.tsx` (Task 14) — Full leaderboard page. Extract shared row component.
  - `apps/web/src/hooks/use-leaderboard-ws.ts` (Task 11) — WebSocket hook for live data
  - `apps/web/src/components/hero.tsx` (Task 8) — Hero section for visual consistency reference
  - `apps/web/src/styles.css` (Task 1) — Design tokens

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Leaderboard preview section visible on landing page
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:3001
      2. Scroll to leaderboard preview section
      3. Assert: "Leaderboard" or equivalent heading visible
      4. Assert: Top 10 player rows visible
      5. Assert: "View Full Leaderboard" link present
      6. Assert: LIVE indicator visible
      7. Click "View Full Leaderboard" link
      8. Assert: navigated to /leaderboard
    Expected Result: Preview section with top 10, link to full page
    Evidence: .sisyphus/evidence/task-15-preview.png

  Scenario: Preview shows live updates
    Tool: interactive_bash
    Steps:
      1. View landing page with leaderboard preview
      2. Trigger leaderboard update via curl
      3. Assert: preview rows update within 5 seconds
    Expected Result: Live data updates are visible in preview
    Evidence: .sisyphus/evidence/task-15-live-preview.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add leaderboard live preview section`
  - Files: `apps/web/src/components/leaderboard-preview.tsx`, `apps/web/src/components/leaderboard-row.tsx`, `apps/web/src/routes/index.tsx`

- [ ] 16. Dashboard Match History & Analytics

  **What to do**:
  - Create `apps/hq/src/routes/guild/$guildId/matches.tsx` — match history and analytics page:
    - **Match history table**: Date, teams (A vs B), scores, ELO delta, resolution type, status
    - **Filters**: Date range, team, player, result (win/loss)
    - **Pagination**: 25 matches per page
    - **Analytics charts** (using Recharts already in HQ):
      - ELO trend line chart (last 30 days)
      - Win rate pie chart (wins vs losses)
      - Matches per day bar chart (last 30 days)
      - Top players by ELO gain (last 7 days)
    - Auth guard: `validateGuildAdmin(session, guildId)`
  - Use `getMatchHistory` and `getPlayerStats` server functions from Task 7

  **Must NOT do**:
  - Do NOT add new chart libraries — use Recharts (already in HQ)
  - Do NOT implement real-time updates on this page — load data on page load, refetch on filter change
  - Do NOT modify existing match data structures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`ui-ux-pro-max`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-15, 17-18)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 7, 12 (needs schema, server functions, layout)

  **References**:
  - `apps/hq/src/components/hq-dashboard.tsx:395-470` — Existing Recharts usage patterns. Follow for consistency.
  - `apps/hq/src/lib/server/match-history.ts` (Task 7) — Server functions for data
  - `packages/db/src/schema.ts` — `customMatches`, `customMatchPlayers` tables
  - `apps/hq/src/components/ui/chart.tsx` — Chart UI component already in HQ

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Match history page loads with data and charts
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/matches (authenticated)
      2. Assert: match history table visible
      3. Assert: ELO trend chart visible
      4. Assert: win rate chart visible
      5. Assert: date filter works
    Expected Result: Match history with analytics charts
    Evidence: .sisyphus/evidence/task-16-analytics.png

  Scenario: Filters and pagination work
    Tool: Playwright
    Steps:
      1. On match history page, set date filter to "Last 7 days"
      2. Assert: table updates to filtered results
      3. Click "Next" page
      4. Assert: pagination updates
    Expected Result: Filters and pagination function correctly
    Evidence: .sisyphus/evidence/task-16-filters.png
  ```

  **Commit**: YES
  - Message: `feat(hq): add match history and analytics`
  - Files: `apps/hq/src/routes/guild/$guildId/matches.tsx`

- [ ] 17. Dashboard Tournament Management

  **What to do**:
  - Create `apps/hq/src/routes/guild/$guildId/tournaments.tsx` — tournament management page:
    - **Active tournaments table**: Name, format, teams, status, actions (view, cancel)
    - **Create tournament form**: Name, format (single/double elimination), team cap, visibility
    - **Tournament detail view**: Bracket visualization, entries, seed numbers, status
    - Auth guard: `validateGuildAdmin(session, guildId)`
  - Use `getGuildTournaments` and `getTournamentDetail` server functions from Task 7
  - Create tournament via Discord bot (show command: `/tournament create ...`) — dashboard doesn't create directly

  **Must NOT do**:
  - Do NOT implement tournament creation from the dashboard — show the Discord command instead
  - Do NOT implement bracket rendering from scratch — use a simple tree/list layout
  - Do NOT modify the existing tournament Discord commands

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`ui-ux-pro-max`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-16, 18)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 3, 7, 12

  **References**:
  - `apps/hq/src/lib/server/tournaments.ts` (Task 7) — Server functions
  - `packages/db/src/schema.ts` — `tournaments`, `tournamentEntries`, `tournamentBracketMatches` tables
  - `apps/hq/src/components/ui/table.tsx` — Table component for tournaments list
  - `apps/hq/src/components/ui/tabs.tsx` — Tabs component for active/completed tournaments

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Tournament management page loads with tournaments
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/tournaments (authenticated)
      2. Assert: tournament list visible (or "No tournaments" empty state)
      3. Assert: "Create Tournament" section shows Discord command
      4. If tournament exists, click to view detail
      5. Assert: tournament detail shows bracket, entries, status
    Expected Result: Tournament list with detail view
    Evidence: .sisyphus/evidence/task-17-tournaments.png
  ```

  **Commit**: YES
  - Message: `feat(hq): add tournament management`
  - Files: `apps/hq/src/routes/guild/$guildId/tournaments.tsx`

- [ ] 18. Dashboard Advanced Match Rules

  **What to do**:
  - Create `apps/hq/src/routes/guild/$guildId/rules.tsx` — advanced match rules page:
    - **ELO range**: Min/max ELO for matchmaking (number inputs)
    - **Platform filtering**: Allowed platforms checkbox group (PC, Xbox, PlayStation)
    - **Require verified**: Toggle requiring verified players only
    - **Max ELO gap**: Maximum ELO difference between teams (number input)
    - Save button with optimistic update, success/error toast
    - Auth guard: `validateGuildAdmin(session, guildId)`
  - Create/modify `packages/db/src/guild-settings.ts` — add CRUD for `guildMatchRules` table

  **Must NOT do**:
  - Do NOT enforce these rules in the Discord bot yet — just the dashboard UI + DB storage
  - Do NOT create complex rule expressions — keep it to the 4 rule types above
  - Do NOT override existing bot behavior — rules are additive

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`ui-ux-pro-max`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-17, 19)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 7, 12

  **References**:
  - `packages/db/src/schema.ts` (Task 3) — `guildMatchRules` table structure
  - `apps/hq/src/lib/server/guild-settings.ts` (Task 7) — Server functions for settings
  - `apps/hq/src/routes/guild/$guildId/settings.tsx` (Task 13) — Settings form pattern to follow

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Match rules page loads and saves
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/rules (authenticated)
      2. Assert: rule form visible with current/default values
      3. Set max ELO gap to 500
      4. Toggle "Require Verified" on
      5. Click "Save Rules"
      6. Assert: success toast, values persist after reload
    Expected Result: Rules form loads, edits, and saves correctly
    Evidence: .sisyphus/evidence/task-18-rules.png

  Scenario: Invalid input shows validation errors
    Tool: Playwright
    Steps:
      1. Set min ELO higher than max ELO
      2. Assert: validation error message visible
      3. Set max ELO gap to negative number
      4. Assert: validation error visible
    Expected Result: Form validates before submission
    Evidence: .sisyphus/evidence/task-18-validation.png
  ```

  **Commit**: YES
  - Message: `feat(hq): add advanced match rules`
  - Files: `apps/hq/src/routes/guild/$guildId/rules.tsx`, `packages/db/src/guild-settings.ts`

- [ ] 19. Dashboard Notification Settings

  **What to do**:
  - Create `apps/hq/src/routes/guild/$guildId/notifications.tsx` — notification settings page:
    - **Match results channel**: Dropdown/input for Discord channel ID where match results are posted
    - **Tournament announcements channel**: Channel ID for tournament announcements
    - **Leaderboard updates toggle**: Enable/disable leaderboard update notifications
    - Save button with optimistic update
    - Auth guard: `validateGuildAdmin(session, guildId)`
  - Create/modify `packages/db/src/guild-settings.ts` — add CRUD for `guildNotificationSettings` table

  **Must NOT do**:
  - Do NOT implement Discord message sending yet — just the settings UI + DB storage
  - Do NOT add webhook creation — channels are selected by ID, user must have bot in the channel

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`ui-ux-pro-max`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 20-21)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 7, 12

  **References**:
  - `packages/db/src/schema.ts` (Task 3) — `guildNotificationSettings` table
  - `apps/hq/src/lib/server/guild-settings.ts` (Task 7) — Server functions
  - `apps/hq/src/routes/guild/$guildId/settings.tsx` (Task 13) — Settings form pattern

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Notification settings page loads and saves
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/notifications (authenticated)
      2. Assert: notification form visible
      3. Enter a channel ID for match results
      4. Toggle "Leaderboard Updates" on
      5. Click "Save"
      6. Assert: success toast, values persist
    Expected Result: Settings load, edit, and save correctly
    Evidence: .sisyphus/evidence/task-19-notifications.png
  ```

  **Commit**: YES
  - Message: `feat(hq): add notification settings`
  - Files: `apps/hq/src/routes/guild/$guildId/notifications.tsx`

- [ ] 20. Worker → DO Match Completion Notification

  **What to do**:
  - Modify `apps/worker/src/interactions/team.ts` — after `completeCustomMatch()` call, send notification to LeaderboardDO:
    1. Get DO stub: `env.LeaderboardDO.get(env.LeaderboardDO.idFromName("global"))`
    2. Send POST to stub: `stub.fetch(new Request("https://do/notify", { method: "POST", body: JSON.stringify({ type: "MATCH_COMPLETED", matchId }) }))`
    3. Fire-and-forget: don't await the response, don't block match completion
    4. Wrap in try/catch: notification failure shouldn't affect match completion
  - Add notification handler to `apps/worker/src/leaderboard-do.ts`:
    - On receiving POST to `/notify`, fetch fresh leaderboard from Postgres, update cache, broadcast to WebSocket clients
  - This is the critical real-time link: Discord interaction → Worker → DO → WebSocket → Web clients

  **Must NOT do**:
  - Do NOT make match completion synchronous with DO notification — fire and forget
  - Do NOT modify the match completion logic itself — just add notification after it
  - Do NOT add error handling that retries indefinitely — max 1 retry, then give up

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 22
  - **Blocked By**: Tasks 5, 11 (needs DO class and broadcast logic)

  **References**:
  - `packages/core/src/lib/matches.ts` — `completeCustomMatch()` function. Called after match completion.
  - `apps/worker/src/interactions/team.ts` — Where match completion happens. Add notification call here.
  - `apps/worker/src/leaderboard-do.ts` (Task 5) — DO class. Add `/notify` endpoint handler.
  - `apps/worker/src/env.ts` — WorkerEnv type. `LeaderboardDO` binding is already added.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Match completion triggers DO notification
    Tool: interactive_bash (tmux) + Bash
    Steps:
      1. Connect WebSocket client to ws://localhost:8787/ws/leaderboard
      2. In another terminal, simulate match completion (or use Discord bot command)
      3. Verify: WebSocket client receives LEADERBOARD_UPDATE message within 5 seconds
    Expected Result: Real-time leaderboard update after match completion
    Failure Indicators: No update received, connection drops, timeout
    Evidence: .sisyphus/evidence/task-20-notification.txt

  Scenario: Match completion succeeds even if DO notification fails
    Tool: Bash
    Steps:
      1. Temporarily make DO notification fail (e.g., invalid DO binding)
      2. Complete a match via Discord bot
      3. Verify: match still completes successfully in database
      4. Verify: no error is thrown to the Discord user
    Expected Result: Match completion is not affected by DO notification failure
    Failure Indicators: Match completion fails, error shown to user
    Evidence: .sisyphus/evidence/task-20-fire-and-forget.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): add match completion to DO notification`
  - Files: `apps/worker/src/interactions/team.ts`, `apps/worker/src/leaderboard-do.ts`

- [ ] 21. Dashboard Auto Tournament Scheduling

  **What to do**:
  - Create `apps/hq/src/routes/guild/$guildId/tournaments/schedule.tsx` — auto scheduling page:
    - **Schedule list**: Current auto-tournament schedules (cron, format, team cap, enabled/disabled toggle)
    - **Create schedule form**: Name, format (single/double), team cap, cron expression builder (simplified: every X day/time), channel, role to ping
    - **Edit/toggle schedules**: Enable/disable with toggle, edit schedule settings, delete
    - **Preview**: Show next 5 scheduled tournament dates based on cron expression
    - Auth guard: `validateGuildAdmin(session, guildId)`
  - Add server functions in `apps/hq/src/lib/server/tournaments.ts` for CRUD on `autoTournamentSchedules`
  - Add cron expression parser utility (use a small library or simple custom parser for common patterns)

  **Must NOT do**:
  - Do NOT implement the actual tournament creation from schedule — just the scheduling UI + DB storage
  - Do NOT use a full cron library — simple common patterns only (daily, weekly, monthly)
  - Do NOT add a Worker cron trigger yet — scheduling is config-only for now

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`ui-ux-pro-max`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19-20, 22)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 17 (needs tournament management page)

  **References**:
  - `packages/db/src/schema.ts` (Task 3) — `autoTournamentSchedules` table structure
  - `apps/hq/src/lib/server/tournaments.ts` (Task 7) — Server functions for tournaments
  - `apps/hq/src/routes/guild/$guildId/tournaments.tsx` (Task 17) — Parent tournaments page

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Auto scheduling page creates and shows schedules
    Tool: Playwright
    Steps:
      1. Navigate to /guild/{guildId}/tournaments/schedule (authenticated)
      2. Assert: schedule list visible (or "No schedules" empty state)
      3. Create a new schedule: weekly Friday 6pm, single elimination, 8 teams
      4. Assert: schedule appears in list with correct details
      5. Assert: next 5 dates preview visible
    Expected Result: Schedule CRUD works with date preview
    Evidence: .sisyphus/evidence/task-21-scheduling.png

  Scenario: Toggle schedule enable/disable
    Tool: Playwright
    Steps:
      1. Click enable/disable toggle on a schedule
      2. Assert: toggle updates visually
      3. Assert: status persists after page reload
    Expected Result: Toggle works and persists
    Evidence: .sisyphus/evidence/task-21-toggle.png
  ```

  **Commit**: YES
  - Message: `feat(hq): add auto tournament scheduling`
  - Files: `apps/hq/src/routes/guild/$guildId/tournaments/schedule.tsx`

- [ ] 22. Community Stats Live Data Integration

  **What to do**:
  - Add Worker `/api/stats` endpoint to `apps/worker/src/index.ts`:
    - Returns aggregate stats: total players, matches today, tournaments completed, servers using Parley
    - Queries Postgres for real counts, caches for 60 seconds in KV
  - Update `apps/web/src/components/community-stats.tsx` (from Task 9):
    - Replace static placeholder data with live data from `/api/stats`
    - Use `fetch` for initial load, then optionally refresh every 60 seconds
    - Keep loading skeleton state while data loads
    - Graceful degradation: show "—" for stats that fail to load

  **Must NOT do**:
  - Do NOT add real-time WebSocket for stats — 60-second polling is sufficient
  - Do NOT add data aggregation logic to the landing page — Worker handles it
  - Do NOT store stats in Durable Object — KV cache is sufficient

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19-21)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 9, 20 (needs Worker API, community stats component, real-time pipeline)

  **References**:
  - `apps/worker/src/index.ts` — Main fetch handler. Add `/api/stats` route after `/api/leaderboard`.
  - `apps/worker/src/runtime-db.ts` — Postgres connection for stat queries.
  - `apps/web/src/components/community-stats.tsx` (Task 9) — Community stats component to update with live data.

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Community stats show live data
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:3001
      2. Scroll to Community Stats section
      3. Assert: stat numbers are displayed (not "—" or skeleton)
      4. Assert: numbers are realistic (total players, matches, etc.)
    Expected Result: Live stats displayed correctly
    Evidence: .sisyphus/evidence/task-22-stats.png

  Scenario: Stats API returns correct data
    Tool: Bash (curl)
    Steps:
      1. Run: curl -s http://localhost:8787/api/stats | jq .
      2. Assert: response has totalPlayers, matchesToday, tournamentsCompleted, serverCount fields
    Expected Result: Valid JSON with stat fields
    Evidence: .sisyphus/evidence/task-22-api.txt

  Scenario: Stats gracefully degrade on API failure
    Tool: Playwright
    Steps:
      1. Stop the Worker API
      2. Navigate to http://localhost:3001
      3. Assert: Community Stats section shows "—" or loading state (not broken)
      4. Assert: rest of page loads normally
    Expected Result: Graceful degradation, no crashes
    Evidence: .sisyphus/evidence/task-22-degradation.png
  ```

  **Commit**: YES
  - Message: `feat(web): add community stats live data`
  - Files: `apps/web/src/components/community-stats.tsx`, `apps/worker/src/index.ts`

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `bun run typecheck`, `oxlint .`, and `oxfmt --check .`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Format [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(web): design system tokens for premium dark depth` — `apps/web/src/styles.css`, `apps/hq/src/styles.css`
- **Wave 1**: `feat(core): add shared types for leaderboard and dashboard` — `packages/core/src/leaderboard/types.ts`, `packages/core/src/dashboard/types.ts`
- **Wave 1**: `feat(db): add guild settings and tournament schedule schemas` — `packages/db/src/schema.ts`
- **Wave 1**: `feat(auth): add per-guild OAuth with guilds scope` — `packages/auth/src/index.ts`
- **Wave 1**: `feat(worker): add LeaderboardDurableObject` — `apps/worker/src/leaderboard-do.ts`
- **Wave 1**: `feat(worker): add leaderboard REST API endpoint` — `apps/worker/src/index.ts`
- **Wave 1**: `feat(hq): add dashboard API server functions` — `apps/hq/src/lib/server/`
- **Wave 2**: `feat(web): redesign hero section` — `apps/web/src/components/hero.tsx`
- **Wave 2**: `feat(web): add landing page sections` — `apps/web/src/components/`
- **Wave 2**: `feat(hq): add per-guild auth flow UI` — `apps/hq/src/components/`
- **Wave 2**: `feat(worker): add leaderboard DO broadcast logic` — `apps/worker/src/leaderboard-do.ts`
- **Wave 2**: `feat(hq): add dashboard layout and navigation` — `apps/hq/src/routes/`
- **Wave 3**: `feat(hq): add guild settings and player roster` — `apps/hq/src/routes/settings/`
- **Wave 3**: `feat(web): add /leaderboard route with WebSocket` — `apps/web/src/routes/leaderboard.tsx`
- **Wave 3**: `feat(web): add leaderboard live preview section` — `apps/web/src/components/leaderboard-preview.tsx`
- **Wave 3**: `feat(hq): add match history and analytics` — `apps/hq/src/routes/analytics/`
- **Wave 3**: `feat(hq): add tournament management` — `apps/hq/src/routes/tournaments/`
- **Wave 3**: `feat(hq): add advanced match rules` — `apps/hq/src/routes/rules/`
- **Wave 4**: `feat(hq): add notification settings` — `apps/hq/src/routes/notifications/`
- **Wave 4**: `feat(worker): add match completion → DO notification` — `apps/worker/src/interactions/team.ts`
- **Wave 4**: `feat(hq): add auto tournament scheduling` — `apps/hq/src/routes/tournaments/schedule.tsx`
- **Wave 4**: `feat(web): add community stats live data` — `apps/web/src/components/community-stats.tsx`

---

## Success Criteria

### Verification Commands

```bash
bun run typecheck        # Expected: 0 errors
oxlint .                 # Expected: 0 errors
oxfmt --check .          # Expected: 0 errors
bun run test             # Expected: all pass
curl -s http://localhost:3001/ | grep -q "Parley"  # Expected: 0 exit code (landing page loads)
curl -s http://localhost:3001/leaderboard           # Expected: 200 status
curl -s http://localhost:3000/ | grep -q "dashboard" # Expected: 0 exit code (dashboard loads)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Landing page renders with premium dark depth aesthetic
- [ ] /leaderboard route shows real-time data via WebSocket
- [ ] Dashboard per-guild auth works (admin sees their guilds, non-admin sees 403)
- [ ] Global admin can access all guilds
- [ ] All 6 dashboard pages functional
- [ ] LeaderboardDO broadcasts updates within 5 seconds of match completion

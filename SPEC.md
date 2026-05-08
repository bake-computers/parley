# Parley v2 Product & System Specification

## Overview

Parley v2 is a competitive Rainbow Six Siege operations platform built inside Discord. It manages player identity, matchmaking, tournaments, ranking, moderation, premium automation, localization, analytics, and internal operations tooling in one system.[cite:755]

The rewrite is justified because the current Parley codebase has grown large, buggy, and slow, while the product scope has expanded to include region-aware logic, custom rules, global bans, OCR scan monetization, per-user settings, and Axiom observability.[cite:755]

## Product Goals

Parley v2 should provide a reliable competitive experience for R6 communities inside Discord, not just a collection of slash commands. The system should support fair matchmaking, configurable tournaments, moderation and trust controls, premium OCR workflows, and strong operational visibility for administrators and maintainers.[cite:755]

The bot should be designed as a stable platform first. Product usefulness comes from how its systems connect: regions affect matchmaking quality, rules govern tournament eligibility, ranks shape progression, moderation protects integrity, and analytics plus HQ tooling make the platform operable at scale.[cite:755]

## Core Product Areas

| Area                        | Purpose                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Identity                    | Link users to game accounts and maintain player profiles.[cite:755]                                                           |
| Guild configuration         | Control server defaults such as language, regions, and queue policies.[cite:755][cite:1197]                                   |
| Matchmaking                 | Run queue-based team formation and match lifecycle handling with shared rating logic.[cite:755]                               |
| Ranking                     | Use hidden MMR/ELO internally while exposing understandable public ranks and Top 100 prestige.[cite:755]                      |
| Tournaments                 | Support tournaments with custom formats, settings, eligibility, and rule-driven behavior.[cite:755]                           |
| Rules engine                | Enforce configurable eligibility, policy, and moderation constraints using data-driven rules.[cite:755][cite:1340][cite:1503] |
| Moderation                  | Enforce global bans, underage restrictions, trust flags, evidence, and auditability.[cite:755]                                |
| Premium OCR                 | Parse scoreboard screenshots through slash command attachments with scan-credit logic.[cite:755][cite:1256]                   |
| Analytics and observability | Capture logs, latency, usage, errors, and operational signals via Axiom and Cloudflare observability.[cite:1377][cite:1378]   |
| Internal HQ tooling         | Operate the platform through a custom internal CLI/TUI rather than a web dashboard.[cite:1393][cite:1399]                     |

## Functional Specification

### Account and identity

Parley v2 must support user account linking and account inspection flows. The baseline commands include `/account register`, `/account unregister`, `/account me`, and `/account refresh`.[cite:755]

The identity layer should support linked game accounts, player-facing profiles, and the base data needed for matchmaking, ranking, tournaments, moderation, and premium eligibility.[cite:755]

### User settings

The bot should support per-user settings as first-class data, starting with language preferences. User language should override guild defaults, with Discord locale as fallback where no explicit setting exists.[cite:1392][cite:1197][cite:1368]

Additional user-level settings should include preferred regions, profile/privacy preferences, and notification preferences, because region and localization directly affect matchmaking and user experience quality.[cite:755][cite:1392]

### Guild settings

Each server should have configurable defaults for language, region, queue behavior, tournament behavior, premium status, and moderation or participation policy.[cite:755][cite:1197]

Guild settings should act as the local policy layer beneath the global safety layer. These settings must be stable, typed, and easy to inspect through internal tooling.[cite:755]

### Matchmaking and matches

Parley v2 should provide queue-based matchmaking with region-aware behavior and shared rating logic across servers.[cite:755]

The matchmaking system should support queue joins and leaves, team balancing, match creation, match result reporting, and the ability to record or validate matches using OCR screenshots where enabled.[cite:755]

Region must be treated as a first-class concept in matchmaking. Good matchmaking balances skill, latency, and queue health rather than only matching by one variable.[cite:1382][cite:1391]

### Ranking and leaderboards

Parley should keep a hidden numeric MMR/ELO value for internal matchmaking and evaluation while exposing public rank tiers such as Bronze, Silver, Diamond, or Master for users.[cite:755][cite:1354]

Top players should receive special prestige labeling through a Top 100 system. The Top 100 label should be treated as a leaderboard distinction rather than a normal rank tier, allowing profiles to show both a tier and a live leaderboard placement such as `#57 Global`.[cite:1348][cite:1353]

Leaderboards should support global and regional perspectives and should not rely only on an absolute global top list, because nearby-rank or cohort views improve motivation and usability for non-elite players.[cite:1348][cite:1350]

### Tournament system

Parley v2 should support tournament creation, brackets, team-size settings, custom formats, participation eligibility, whitelist or invite-only access, and prize-aware restrictions.[cite:755]

Tournament rules should support cases such as high-ELO-only tournaments, low-ELO or academy tournaments, allowlists or denylists, prize eligibility requirements, and global trust or ban exclusions.[cite:755][cite:1503]

### Rules engine

The rules engine should function as a policy evaluator rather than a set of hardcoded `if` chains. It should evaluate structured rules against an evaluation context and produce outcomes such as allow, deny, warn, or require override.[cite:1340][cite:1503]

A rule should contain a scope, a target, a priority, a condition tree, and an effect. Scopes should include global, guild, queue preset, and tournament scopes so that safety and policy can be layered deterministically.[cite:1340][cite:1498]

Rule conflict resolution must be deterministic. The engine should resolve matching rules by priority and preserve the principle that higher-priority safety or moderation rules cannot be bypassed by lower-level tournament or guild rules.[cite:1499][cite:1500]

Rule examples should include player allowlists, user denylists, minimum or maximum rating requirements, allowed rank tiers, region restrictions, prize eligibility constraints, and premium credit or entitlement checks.[cite:1503][cite:755]

### Moderation and trust

Parley v2 must include a global moderation layer. It should support global bans, trust flags, underage-user restrictions, evidence capture, staff audit logs, and an appeals state model.[cite:755]

Moderation records should never be represented as a single boolean such as `banned = true`. Moderation actions need reasons, actors, durations, timestamps, evidence references, and appeal state so the system remains explainable and operable.[cite:1344]

### OCR screenshot recording and premium access

Parley should support screenshot-based match recording using Discord slash command attachment inputs. Discord application commands support attachment option types, which makes `/record-screenshot image:<attachment>` a valid primary interaction flow.[cite:1256][cite:1253]

The monetization model should include a five-use trial per server, a vote-based one-scan path, a Discord-native premium subscription at €2.99 per month for 500 scans, and an extra 500-credit purchase at €2.49.[cite:755][cite:1265][cite:1287]

Premium and credit entitlements must be tracked explicitly through a credit ledger and entitlement checks. One-time purchases should be consumed and recorded properly because Discord consumable purchases require entitlement consumption logic in the app backend.[cite:1287][cite:1288]

### Localization

Parley v2 should support at least German and English, with user-level overrides and guild-level defaults.[cite:1197][cite:1392]

Localization should apply not only to user-facing text but also to command responses, setting flows, and any guided interaction surfaces. Consistent localization improves clarity and trust, especially when settings and moderation flows become more complex.[cite:1367][cite:1370]

## Technical Architecture

### Runtime and service structure

Parley v2 should be built as a modular system with a Discord interaction runtime, a Hono-based API surface, domain packages, a typed database layer, caching/read-model layers, and an internal HQ CLI.[cite:1318][cite:1319][cite:1393]

Hono is a sensible routing and middleware shell for Cloudflare Workers, and it also supports tRPC integration through dedicated adapters. tRPC can also run on fetch-based edge runtimes directly, so the main benefit of Hono here is structure and middleware ergonomics, not mere compatibility.[cite:1322][cite:1330]

A suitable package split is:

- `apps/bot` for Discord interactions and command handlin with Hono routes and future tRPC surfaces.
- `packages/domain` for ratings, matchmaking, tournaments, rules, moderation, and premium logic.
- `packages/db` for schema, migrations, and repositories.
- `packages/runtime` Custom Discord API wrapper.
- `packages/shared` for IDs, validation, errors, configuration, and localization support.[cite:1290][cite:1292]

### Database strategy

The database has been moved to an private dedicated server, which is cheaper than our Planetscale Postgres Database.

The existing schema should be wiped and redesigned from first principles because there is no user data worth preserving and the current schema is known to be messy. Even in a greenfield reset, the new schema should still be created through versioned migrations so the rebuild remains reproducible and controlled.[cite:755][cite:1323][cite:1326]

A future migration to a VPS-hosted Postgres setup should happen only after real user data and sustained operational need justify the move. A stronger single Postgres node is a saner first self-hosting step than jumping directly into a fully self-managed HA cluster.[cite:1418][cite:1419][cite:1420]

### Proposed data model

The schema should be built around clear domains rather than implementation leftovers. Core entities should include:

- `users`
- `user_settings`
- `linked_accounts`
- `guilds`
- `guild_settings`
- `guild_premium`
- `scan_credit_ledger`
- `queues`
- `queue_entries`
- `matches`
- `match_players`
- `match_results`
- `tournaments`
- `tournament_participants`
- `tournament_matches`
- `rule_sets`
- `rules`
- `global_flags`
- `global_actions`
- `moderation_evidence`
- `leaderboard_snapshots`
- `event_log`
- `audit_log`[cite:755][cite:1497]

This split supports durable core state, auditability, analytics projections, and cacheable read models without forcing all concerns into one schema area.[cite:1323][cite:1497]

### Caching and write strategy

Parley should not use a pure write-behind cache as the source of truth for important state. Write-behind caching reduces pressure on the database but introduces delayed consistency and possible data loss if the buffer fails before persistence.[cite:1483][cite:1487]

The safe strategy is:

- critical state writes go directly to durable storage,
- cache is used for hot reads and snapshots,
- analytics and derived counters are buffered and batched,
- queues handle grouped near-real-time flushes,
- cron jobs reconcile and rebuild aggregated views when needed.[cite:1492][cite:1489][cite:1497]

Critical state includes guild configuration, user settings, queue membership, match state, bans, subscriptions, and credits because losing any of those writes would damage trust in the system.[cite:755]

Derived or aggregate data such as analytics counters, leaderboard rollups, and usage summaries can be batched safely because they are rebuildable or can tolerate short delays.[cite:1491][cite:1497]

### Performance model

Parley’s current slowness is a sign that the request path and system boundaries need redesign. The fast path should acknowledge Discord interactions quickly and offload heavy or slow work into queues or background tasks.[cite:755][cite:1339][cite:1342]

Configuration and rule snapshots are strong candidates for fast-read storage because Workers KV improvements and cache-backed reads can reduce hot-path latency substantially for configuration-style access patterns.[cite:1345]

## Observability and operations

Parley v2 should ship structured observability from day one. Axiom supports Cloudflare Workers log and telemetry ingestion, and Cloudflare documents supported export paths for sending Workers observability data to Axiom.[cite:1377][cite:1378]

All logs should be structured JSON and should include identifiers and context that make debugging distributed flows possible. Core log fields should include event name, timestamp, trace ID, interaction ID, guild ID, user ID, region, command, duration, outcome, and error code.[cite:1383][cite:1389]

The internal HQ surface should be a CLI/TUI rather than a website. Bubble Tea and related Go tooling are suitable for building terminal-native operational tooling, and Axiom plus Cloudflare both provide APIs or tooling that make CLI integration realistic.[cite:1393][cite:1395][cite:1399][cite:1402]

HQ should support:

- log queries,
- analytics inspection,
- guild inspection,
- match and tournament inspection,
- moderation actions,
- premium and credit inspection,
- retrying failed jobs,
- cache purge or rebuild actions,
- rollout and feature-flag controls.[cite:1398][cite:1402][cite:1465]

## Release and rollout

Even though this is a full specification rather than a staged roadmap, the rewrite should still be released using feature flags and controlled rollout. Flags, phased exposure, and rollback paths are standard best practices for safer release management in rewrites and complex systems.[cite:1465][cite:1522][cite:1525]

The rewrite should run beside the old codebase until core flows are validated. Selected guilds should be used for early testing before broad rollout so that real interaction behavior can be compared safely and logged clearly.[cite:755][cite:1459]

## Product definition

Parley v2 should be understood as a competitive R6 operations platform that lives inside Discord. It combines identity, settings, matchmaking, rating, tournaments, configurable rules, moderation, OCR-driven premium automation, localization, observability, and internal operations into one system.[cite:755]

This specification reflects a product that is more than a simple Discord bot. It is a rule-driven, region-aware, premium-capable competitive infrastructure layer for Rainbow Six Siege communities running on Discord.[cite:755]

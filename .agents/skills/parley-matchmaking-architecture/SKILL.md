---
name: parley-matchmaking-architecture
description: Use when working on the Go matchmaking subsystem in the Parley engine — understanding CPR vs Glicko-2, the queue→match formation flow, the background sweeper lifecycle, eligibility rules, or how team balance is computed.
---

# Parley Matchmaking Architecture

## Overview
The matchmaking subsystem lives in `internal/matchmaking/`. Split cleanly into **pure-logic files** (no I/O, fully unit-testable) and **DB-aware files** (use `internal/repos` for Postgres). Mirrors the Rust `src/matchmaking/*` files 1:1.

## Quick reference

| File | Layer | Role |
| --- | --- | --- |
| `cpr.go` | Pure | `StatNorm` (z-score normalization), `GlickoQ`/`beta` constants, CPR computation |
| `glicko.go` | Pure | `TeamRoster`, `RosterMember` (mu/phi), Glicko-2 math, win-probability |
| `eligibility.go` | DB | `Service` struct, `LoadEligibility`, rank/quota gates |
| `players.go` | DB | `PlayerSeedData` (rank, KD, KOST, KPR, HSP, score), `LoadedPlayer` |
| `queue.go` | DB | `FormedMatch`, `FindMatchingStackIndices` — team formation |
| `sweeper.go` | DB | `Run(ctx, interval)` and `Tick(ctx)` — background loop |

## Critical patterns

**Two-layer split is the design contract.** Pure files (`cpr.go`, `glicko.go`) import nothing from `repos/`, `models/`, or `db/`. When you change a rating constant, that's a pure-file change. When you change a DB schema, that's a DB-file change. Don't mix them — it breaks the testability promise in README §6.

**The 5-step match lifecycle.** (1) `LoadEligibility` (link status, rank gate, quotas). (2) Stack entry into the queue. (3) `FindMatchingStackIndices` searches for a stack subset whose partition minimizes team balance gap. (4) `FormedMatch` returns partition + `ExpectedLobbyCPR`. (5) Persist via the match repo and clear consumed queue entries. All inside `SweepPool`.

**Sweeper is a 5s ticker, not request-driven.** Started in `cmd/parley/main.go:174` only when both `mmService != nil` and `bunDB != nil`. `Tick`: (1) `ExpireStale(nowMS())`, (2) `DistinctWaitingPools(ctx)` for `(game, guild, team_size)` triples, (3) per pool: `LoadEligibility` + `SweepPool`. Per-tick errors are logged; loop continues. Don't replace with request-time matching — concurrent requests on the same pool would form duplicates.

**Glicko-2 is in-house, not a library.** `glicko.go` implements it with `GlickoQ = 0.00575646273` and `beta = 200.0`. `TeamRoster.avgMu()` returns 1500.0 (Glicko-2 default) for empty rosters. Must stay in sync with the Rust `src/matchmaking/mod.rs`.

**CPR combines z-scored stats into one rating.** `StatNorm{Mean, StdDev}` per stat (KD, win rate, KPR, MMR, KOST, survival, HS%) — normalized against the guild roster population, then combined. `ExpectedLobbyCPR` is the lobby-level score returned with `FormedMatch`.

**Mirrors Rust.** Every file has `// Mirrors ... in src/matchmaking/...` comments. If you change Go behavior, the Rust service must change in lockstep until retirement.

## Common mistakes

- Importing `repos/`, `models/`, or `db/` from `cpr.go` or `glicko.go` — breaks the pure-logic contract
- Starting the sweeper without a DB — first `ExpireStale` fails; boot code already guards this
- Replacing the sweeper with request-time matching — duplicate matches on the same pool
- Treating `ExpectedLobbyCPR` as a measured outcome — it's a model output

## See also
- `README.md` §6 — matchmaking engine overview
- `parley-proto-contracts` skill — for the `MatchmakingService` RPC contract

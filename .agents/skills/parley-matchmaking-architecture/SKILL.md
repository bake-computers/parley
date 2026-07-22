---
name: parley-matchmaking-architecture
description: Use when working on the Go matchmaking subsystem in the Parley engine — understanding CPR vs Glicko-2, the BuildTeams/CreateCustomMatch flow, eligibility rules, or how team balance is computed.
---

# Parley Matchmaking Architecture

## Overview

The matchmaking subsystem lives in `internal/matchmaking/`. Split cleanly into **pure-logic files** (no I/O, fully unit-testable) and **DB-aware files** (use `internal/repos` for Postgres). RPC orchestration lives in `internal/services/match.go`.

## Quick reference

| File             | Layer | Role                                                                                               |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `cpr.go`         | Pure  | `StatNorm` (z-score normalization), `GlickoQ`/`beta` constants, CPR computation, `UpdateRating`    |
| `glicko.go`      | Pure  | `TeamRoster`, `RosterMember` (mu/phi), Glicko-2 math, `TeamWinProbability`, `PartitionTeams`       |
| `eligibility.go` | DB    | `Service` struct, `LoadEligibility`, `CheckEligibility` rank/quota gates, per-user opt-out         |
| `players.go`     | DB    | `LoadPlayers` (membership + snapshots + CPR), `PlayerSeedData`, `LoadedPlayer`, `ExpectedLobbyCPR` |

## Critical patterns

**Two-layer split is the design contract.** Pure files (`cpr.go`, `glicko.go`) import nothing from `repos/`, `models/`, or `db/`. When you change a rating constant, that's a pure-file change. When you change a DB schema, that's a DB-file change. Don't mix them — it breaks the testability promise in README §6.

**The BuildTeams flow.** (1) `LoadEligibility` + `CheckEligibility` (guild toggle, per-user opt-out, rank gates, quotas). (2) `LoadPlayers` does membership lookup, snapshot fetch, and CPR calculation. (3) `PartitionTeams` brute-forces the balanced split and returns the partition with `WinProbability`. (4) `ExpectedLobbyCPR` scores the lobby. All orchestrated by `MatchService.BuildTeams` in `internal/services/match.go`, which converts the partition into team assignments without persisting.

**Glicko-2 is in-house, not a library.** `glicko.go` implements it with `GlickoQ = 0.00575646273` and `beta = 200.0`. `TeamRoster.avgMu()` returns 1500.0 (Glicko-2 default) for empty rosters.

**CPR combines z-scored stats into one rating.** `StatNorm{Mean, StdDev}` per stat (KD, win rate, KPR, MMR, KOST, survival, HS%) — normalized against the guild roster population, then combined. `ExpectedLobbyCPR` is the lobby-level score.

**`CreateCustomMatch` persists; `BuildTeams` does not.** `CreateCustomMatch` runs the same balancer and writes the match through the match repo. `ReportMatchResult` closes the loop, applying Glicko-2 rating updates (`UpdateRating`) from outcomes.

**Provenance comments.** Several functions carry `// Mirrors ... in src/...` comments pointing at the original Rust engine-service they were ported from — historical context, not a sync contract.

## Common mistakes

- Importing `repos/`, `models/`, or `db/` from `cpr.go` or `glicko.go` — breaks the pure-logic contract
- Treating `ExpectedLobbyCPR` as a measured outcome — it's a model output
- Skipping `LoadEligibility` before team formation — produces teams with unlinked or opted-out players

## See also

- `README.md` §6 — matchmaking engine overview
- `parley-proto-contracts` skill — for the `MatchmakingService` RPC contract

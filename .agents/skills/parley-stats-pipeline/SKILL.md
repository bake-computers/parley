---
name: parley-stats-pipeline
description: Use when working on the Go stats subsystem in the Parley engine — adding a per-game backend, debugging cache hits/misses, tracing a fetch through cache→backend→HTTP→scrape→persist, or understanding the REDIS_URL vs direct-cache fallback.
---

# Parley Stats Pipeline

## Overview

Stats flow: `StatsService` → `CacheStore` (Redis or Direct) → `StatsBackendRegistry` → per-game `StatsBackend` (R6) → `fetch.Client` → `scrape` (pure parser) → optional async `persist` to Postgres. `proto/stats/v1/StatsService` sits on top.

## Quick reference

| Layer            | Location                                              | Role                                                           |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Service entry    | `internal/services/stats.go`                          | `FetchStats` / `FetchStatsCollection`                          |
| Cache facade     | `internal/stats/cache/cache.go`                       | `CacheStore` interface                                         |
| Cache impls      | `internal/stats/cache/{direct,redis,singleflight}.go` | Direct passthrough, Redis with `singleflight` de-dup           |
| Backend registry | `internal/stats/backends/backend.go`                  | Dispatches by `Game`                                           |
| R6 backend       | `internal/stats/backends/r6.go`                       | Only implemented game; uses `fetch.Client`                     |
| HTTP client      | `internal/stats/fetch/{client,errors}.go`             | Network I/O only                                               |
| HTML scraper     | `internal/stats/scrape/{scrape,nuxt,metrics}.go`      | Pure parsers; `__NUXT_DATA__` index resolver, `maxHops=64` cap |
| Persistence      | `internal/stats/persist/persisting.go`                | Async buffered channel → Postgres + guild invalidation         |

## Critical patterns

**Cache choice is config-driven.** `cmd/parley` constructs the cache from `REDIS_URL`: present → `RedisCacheStore` (with `singleflight.Group` de-dup); absent → `DirectCacheStore` (passthrough, `Degraded: false`). `StatsService` is constructed with whichever, possibly `nil` for fully degraded mode.

**`Degraded` is a contract, not a flag.** Carried from `CachedStats.Degraded` into the proto response. Redis sets it `true` for partial/stale results; Direct always `false`. Callers treat `Degraded: true` as "use with caution" — never a hard error.

**Scrape layer is pure and bounded.** No I/O in `scrape/*` — all network is in `fetch`. `NuxtResolver` chases index references in the flat payload array, capped at 64 hops. If stats.cc changes, only the `scrape` package needs to change.

**Persistence is async and best-effort.** Buffered channel (`defaultChannelCapacity=1024`) feeds a background goroutine writing to `player_stat_snapshots`. Hot path never blocks on Postgres; on full buffer the writer logs and drops (intentional). After a write, `GuildInvalidator` clears guild-scoped caches.

**Adding a game = implement + register.** Steps: (1) add value to `backends.Game` enum, (2) implement `StatsBackend` (R6Backend is the minimal template), (3) `registry.Register(...)` in `cmd/parley/main.go`, (4) extend `MapProtoGame` in `internal/services/stats.go`, (5) `ALTER TYPE games` Postgres migration, (6) `make proto` if you touched the proto enum.

## Common mistakes

- Forgetting `registry.Register(r6Backend)` at boot — returns `StatsFetchErrorGcUnavailable`
- Bypassing `CacheStore` with a direct backend call — skips Redis + singleflight, hammers stats.cc
- Doing I/O inside `scrape` — must stay pure; HTTP belongs in `fetch`
- Treating `Degraded: true` as a hard error — it's a "use with caution" signal
- Blocking the hot path on Postgres writes — that's why `persist` is async
- Editing `gen/parley/**` to add an enum value — auto-generated; edit the proto and regen

## See also

- `README.md` §5.2, §11 — stats pipeline and supported games
- `parley-proto-contracts` skill — for the RPC contract this package implements

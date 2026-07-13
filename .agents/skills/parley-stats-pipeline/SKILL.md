---
name: parley-stats-pipeline
description: Use when working on the Go stats subsystem in the Parley engine — adding a per-game backend, debugging cache hits/misses, tracing a fetch through cache→backend→HTTP→API map→persist, or understanding Redis cache behavior.
---

# Parley Stats Pipeline

## Overview

Stats flow: `StatsService` → `CacheStore` (Redis) → `StatsBackendRegistry` → per-game `StatsBackend` (R6) → `fetch.Client` (API) → `api.MapCollection` → domain types in `scrape` package → optional async `persist` to Postgres. `proto/stats/v1/StatsService` sits on top.

## Quick reference

| Layer            | Location                                              | Role                                                           |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Service entry    | `internal/services/stats.go`                          | `FetchStats` / `FetchStatsCollection`                          |
| Cache facade     | `internal/stats/cache/cache.go`                       | `CacheStore` interface                                         |
| Cache impl       | `internal/stats/cache/{redis,singleflight}.go`        | Redis with `singleflight` de-dup                               |
| Backend registry | `internal/stats/backends/backend.go`                  | Dispatches by `Game`                                           |
| R6 backend       | `internal/stats/backends/r6.go`                       | Only implemented game; uses `fetch.Client` (API-only)          |
| HTTP client      | `internal/stats/fetch/{client,errors}.go`             | Network I/O only; stats.cc API                                 |
| API mapping      | `internal/stats/api/{client,map,types}.go`            | Typed API client + map responses → domain types                |
| Domain types     | `internal/stats/scrape/{types,rounds,metrics}.go`     | Domain models (not HTML); KOST helpers, `ScrapedStats`, etc.   |
| Persistence      | `internal/stats/persist/persisting.go`                | Async buffered channel → Postgres + guild invalidation         |

## Critical patterns

**Redis is required.** `cmd/parley` constructs `RedisCacheStore` (with `singleflight.Group` de-dup) from `REDIS_URL`. Boot fails if Redis is missing.

**Live stats require the stats.cc API.** Set `STATS_CC_API_KEY` (and optional `STATS_CC_API_BASE_URL`). There is no HTML scraper fallback — missing/misconfigured API fails the fetch path.

**Domain types still live under `scrape`.** Package `internal/stats/scrape` holds domain models and pure helpers (`ScrapedStats`, rounds, KOST metrics). It is not an HTML network path; mapping from API JSON is in `internal/stats/api`.

**Persistence is async and best-effort.** Buffered channel (`defaultChannelCapacity=1024`) feeds a background goroutine writing to `player_stat_snapshots`. Hot path never blocks on Postgres; on full buffer the writer logs and drops (intentional). After a write, `GuildInvalidator` clears guild-scoped caches.

**Adding a game = implement + register.** Steps: (1) add value to `backends.Game` enum, (2) implement `StatsBackend` (R6Backend is the minimal template), (3) `registry.Register(...)` in `cmd/parley/main.go`, (4) extend `MapProtoGame` in `internal/services/stats.go`, (5) `ALTER TYPE games` Postgres migration, (6) `make proto` if you touched the proto enum.

## Common mistakes

- Forgetting `registry.Register(r6Backend)` at boot — returns `StatsFetchErrorGcUnavailable`
- Bypassing `CacheStore` with a direct backend call — skips Redis + singleflight, hammers stats.cc
- Assuming HTML scrape still exists — live path is API-only; domain types remain in `scrape`
- Blocking the hot path on Postgres writes — that's why `persist` is async
- Editing `gen/parley/**` to add an enum value — auto-generated; edit the proto and regen

## See also

- `README.md` §5.2, §11 — stats pipeline and supported games
- `parley-proto-contracts` skill — for the RPC contract this package implements

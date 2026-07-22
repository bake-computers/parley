---
name: parley-stats-pipeline
description: Use when working on the Go stats subsystem in the Parley engine — debugging cache hits/misses, tracing a fetch through cache→HTTP→API map→persist, or understanding snapshot cache behavior.
---

# Parley Stats Pipeline

## Overview

Stats flow: `StatsService` → `SnapshotCacheStore` (in-process, read-through from `player_stat_snapshots`) → `fetch.Client` (stats.cc API) → `api.MapCollection` → domain types in `scrape` package → async `persist` to Postgres. The current stats pipeline is explicitly R6-only.

## Quick reference

| Layer          | Location                                          | Role                                                             |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Service entry  | `internal/services/stats.go`                      | `FetchStats` / `FetchStatsCollection`                            |
| Cache facade   | `internal/stats/cache/cache.go`                   | `CacheStore` interface                                           |
| Snapshot cache | `internal/stats/cache/snapshot.go`                | `SnapshotCacheStore` — read-through from `player_stat_snapshots` |
| Singleflight   | `internal/stats/cache/singleflight.go`            | De-duplicates concurrent upstream fetches                        |
| Stats client   | `internal/stats/fetch`                            | R6 stats.cc API client and retry behavior                        |
| HTTP client    | `internal/stats/fetch/{client,errors}.go`         | Network I/O only; stats.cc API                                   |
| API mapping    | `internal/stats/api/{client,map,types}.go`        | Typed API client + map responses → domain types                  |
| Domain types   | `internal/stats/scrape/{types,rounds,metrics}.go` | Domain models (not HTML); KOST helpers, `ScrapedStats`, etc.     |
| Persistence    | `internal/stats/persist/persisting.go`            | Async buffered channel → Postgres                                |

## Critical patterns

**Snapshot cache is the read path.** `SnapshotCacheStore` resolves the player by normalized username, then loads the latest `player_stat_snapshots` row. If a snapshot exists and its age is under `STATS_TTL_R6_MS` (default 60 000 ms), the stored JSON payload is decoded and returned — no upstream call. Season-specific requests (snapshots carry no season marker) and stale or missing snapshots fall through to the stats.cc API, deduplicated by `singleflight.Group`.

**Config cache is in-process memory.** The stats.cc provider config is fetched once and held in a process-local cache. No external store is involved.

**Live stats require the stats.cc API.** Set `STATS_CC_API_KEY` (and optional `STATS_CC_API_BASE_URL`). There is no HTML scraper fallback — missing/misconfigured API fails the fetch path.

**Domain types still live under `scrape`.** Package `internal/stats/scrape` holds domain models and pure helpers (`ScrapedStats`, rounds, KOST metrics). It is not an HTML network path; mapping from API JSON is in `internal/stats/api`.

**Persistence is async and best-effort.** `persist.PersistingStatsCacheStore` wraps the snapshot cache. A buffered channel (`defaultChannelCapacity=1024`) feeds a background `StatsPersister` goroutine writing to `player_stat_snapshots`. Hot path never blocks on Postgres; on full buffer the writer logs and drops (intentional).

**Adding a stats-enabled game requires deliberate generalization.** Add the proto and Postgres game values, implement its upstream client and API mapping, then generalize the R6-only cache/service boundary. Do not add a registry until there is a second real stats provider.

## Common mistakes

- Bypassing `CacheStore` with a direct client call — skips snapshot read-through + singleflight, hammers stats.cc
- Assuming HTML scrape still exists — live path is API-only; domain types remain in `scrape`
- Blocking the hot path on Postgres writes — that's why `persist` is async
- Editing `gen/parley/**` to add an enum value — auto-generated; edit the proto and regen
- Treating `STATS_TTL_R6_MS` as a cache-expiry header — it gates whether a stored snapshot is fresh enough to serve without hitting upstream

## See also

- `README.md` §5.2, §11 — stats pipeline and supported games
- `parley-proto-contracts` skill — for the RPC contract this package implements

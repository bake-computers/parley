# stats.cc API Integration — Progress Log

**Branch:** `feat/api-impl`  
**Status:** Complete

## Summary

Engine now uses `https://r6.stats.cc/v2` as the primary R6 stats upstream when `STATS_CC_API_KEY` is set, with automatic fallback to the legacy HTML scraper on retryable failures.

## Completed

- [x] `STATS_CC_API_KEY`, `STATS_CC_API_BASE_URL`, `STATS_CC_CONFIG_CACHE_TTL_MS` in config + `.env.example`
- [x] `internal/stats/api` — client, config cache (Redis + memory), mapper, golden fixtures
- [x] API flow: config → search → profile → matches (paginated, max 20/page)
- [x] `fetch.StatsClient` API-primary + scraper fallback
- [x] Shared KOST round summarizer in `internal/stats/scrape/rounds.go`
- [x] Wired in `cmd/parley/main.go` with Redis config cache
- [x] Unit + integration tests; live probe against real API

## Verification

```bash
go test ./internal/stats/...
go test -tags=integration ./internal/stats/fetch/ -run TestLiveStatsCCAPI  # requires STATS_CC_API_KEY
curl http://127.0.0.1:51001/stats/Avqny?platform=pc  # engine without Redis cache
```

Live API result (2026-06-18): `profile_id=b833121d-...`, `rank_points=2563`, `kost=72.73`, `matches_in_cache=24`.

## Notes

- Match list API enforces `limit <= 20`; client uses 20/page × 3 pages max.
- Nil `*redis.Client` in `redis.Cmdable` caused warmup panic — fixed by passing `*redis.Client` to `NewConfigCache`.
- Stale Redis stats cache may serve pre-API snapshots until `STATS_TTL_R6_MS` expires.
# Task 23 — Stats Cache (Go) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Task directive:** Do **not** commit unless the user explicitly asks. Skip all "Commit" steps.
>
> **Notepad:** After each task, append a one-line completion note to the **Implementation notepad** section at the bottom of this file (do not use a separate file).

**Goal:** Port `src/cache_store.rs` and `src/cache_redis.rs` to Go as `internal/stats/cache/` — a `CacheStore` interface with `DirectCacheStore` (passthrough), `RedisCacheStore` (Redis-backed with stale-grace + singleflight dedup), and a standalone `SingleFlight` generic. Integrate with the existing `services.Store` (leaderboard) for `Touch()` on successful fetches.

**Architecture:** `CacheStore` interface mirrors the Rust `StatsCacheStore` trait: `Fetch` and `FetchCollection`. `DirectCacheStore` wraps `backends.StatsBackendRegistry` and always calls upstream. `RedisCacheStore` wraps the registry + Redis client, uses `golang.org/x/sync/singleflight` for request coalescing (string key `game:username:platform:season`), stores fresh + stale hashes in Redis, and falls back to stale on `GcUnavailable`. `CacheConfig` holds per-game TTLs + stale-grace from `config.Config`. Leaderboard integration is a callback (`OnFetch`) to avoid circular imports — the caller wires `lb.Touch` at construction time.

**Tech Stack:** Go 1.25, `github.com/redis/go-redis/v9`, `golang.org/x/sync/singleflight`, `github.com/alicebob/miniredis/v2` (tests).

**Rust references:**

| Rust                                                            | Go                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/cache_store.rs` — `StatsCacheStore` trait                  | `internal/stats/cache/cache.go` — `CacheStore` interface         |
| `src/cache_store.rs` — `DirectStatsCacheStore`                  | `internal/stats/cache/direct.go` — `DirectCacheStore`            |
| `src/cache_store.rs` — `SingleFlight<K,V>`                      | `internal/stats/cache/singleflight.go` — `SingleFlight[K,V]`     |
| `src/cache_redis.rs` — `RedisStatsCacheStore`                   | `internal/stats/cache/redis.go` — `RedisCacheStore`              |
| `src/cache_store.rs` — `StatsCacheConfigV2`                     | `internal/stats/cache/config.go` — `CacheConfig`                 |
| `StatsCacheStore.fetch()` → `CachedStats{stats, degraded}`      | `CacheStore.Fetch()` → `CachedStats{Stats, Degraded}`            |
| `StatsCacheStore.fetch_collection()` → `ScrapedStatsCollection` | `CacheStore.FetchCollection()` → `scrape.ScrapedStatsCollection` |
| `LeaderboardStore.touch()` called from `RedisStatsCacheStore`   | `OnFetch func(ctx, game, username, stats)` callback              |
| `src/guild_cache.rs`                                            | Not in T23 scope — separate matchmaking concern                  |

---

## File map

| Path                                        | Action | Responsibility                                                    |
| ------------------------------------------- | ------ | ----------------------------------------------------------------- |
| `internal/stats/cache/config.go`            | create | `CacheConfig` struct, `TTLFor(game)`, `NewCacheConfigFromEnv()`   |
| `internal/stats/cache/cache.go`             | create | `CachedStats`, `CacheStore` interface, key helpers                |
| `internal/stats/cache/direct.go`            | create | `DirectCacheStore` — passthrough, always calls backend            |
| `internal/stats/cache/singleflight.go`      | create | `SingleFlight[K comparable, V any]` — generic dedup               |
| `internal/stats/cache/singleflight_test.go` | create | Tests: coalesces concurrent, separate for different keys          |
| `internal/stats/cache/redis.go`             | create | `RedisCacheStore` — Redis hash cache + stale-grace + singleflight |
| `internal/stats/cache/redis_test.go`        | create | Tests: hit, miss, stale fallback, collection, singleflight dedup  |
| `internal/stats/cache/direct_test.go`       | create | Tests: passthrough behavior                                       |
| `internal/stats/cache/cache_test.go`        | create | Tests: key generation, config defaults                            |

---

## Task 1: CacheConfig + key helpers

**Files:**

- Create: `internal/stats/cache/config.go`
- Create: `internal/stats/cache/cache.go`
- Create: `internal/stats/cache/cache_test.go`

### Step 1: Write failing tests for config and key helpers

```go
// internal/stats/cache/cache_test.go
package cache

import (
	"testing"
	"time"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
)

func TestCacheConfig_DefaultTTL(t *testing.T) {
	cfg := CacheConfig{}
	if got := cfg.TTLFor(backends.GameR6); got != 60*time.Second {
		t.Errorf("default TTLFor(R6) = %v, want 60s", got)
	}
	if got := cfg.StaleGrace(); got != 24*time.Hour {
		t.Errorf("default StaleGrace() = %v, want 24h", got)
	}
}

func TestCacheConfig_CustomTTL(t *testing.T) {
	cfg := CacheConfig{
		TTLR6:      30 * time.Second,
		StaleGraceDuration: 12 * time.Hour,
	}
	if got := cfg.TTLFor(backends.GameR6); got != 30*time.Second {
		t.Errorf("TTLFor(R6) = %v, want 30s", got)
	}
}

func TestFreshKey(t *testing.T) {
	tests := []struct {
		game     backends.Game
		username string
		platform fetch.StatsPlatform
		season   *string
		want     string
	}{
		{backends.GameR6, "Player1", fetch.StatsPlatformPC, strPtr("y9s1"), "stats:r6:player1:pc:y9s1"},
		{backends.GameR6, "Player1", fetch.StatsPlatformAuto, nil, "stats:r6:player1:auto:"},
		{backends.GameR6, "  Spaced  ", fetch.StatsPlatformXbox, strPtr("y9s2"), "stats:r6:spaced:xbox:y9s2"},
	}
	for _, tt := range tests {
		got := FreshKey(tt.game, tt.username, tt.platform, tt.season)
		if got != tt.want {
			t.Errorf("FreshKey(%v, %q, %v, %v) = %q, want %q", tt.game, tt.username, tt.platform, tt.season, got, tt.want)
		}
	}
}

func TestStaleKey(t *testing.T) {
	got := StaleKey(backends.GameR6, "player1", fetch.StatsPlatformPC, strPtr("y9s1"))
	want := "stats:stale:r6:player1:pc:y9s1"
	if got != want {
		t.Errorf("StaleKey() = %q, want %q", got, want)
	}
}

func TestCollectionKey(t *testing.T) {
	got := CollectionKey(backends.GameR6, "player1", fetch.StatsPlatformAuto)
	want := "stats:collection:r6:player1:auto"
	if got != want {
		t.Errorf("CollectionKey() = %q, want %q", got, want)
	}
}

func strPtr(s string) *string { return &s }
```

### Step 2: Run tests to verify they fail

Run: `go test ./internal/stats/cache/... -v`
Expected: FAIL — package does not exist yet.

### Step 3: Implement CacheConfig, CachedStats, CacheStore interface, and key helpers

```go
// internal/stats/cache/config.go
package cache

import (
	"time"

	"github.com/pactum-computers/parley/internal/config"
	"github.com/pactum-computers/parley/internal/stats/backends"
)

// CacheConfig holds per-game TTLs and the stale-grace window.
// Mirrors Rust StatsCacheConfigV2.
type CacheConfig struct {
	TTLR6              time.Duration
	StaleGraceDuration time.Duration
}

// NewCacheConfigFromEnv builds CacheConfig from the global Config.
func NewCacheConfigFromEnv(cfg *config.Config) CacheConfig {
	return CacheConfig{
		TTLR6:              time.Duration(cfg.StatsTTLR6MS) * time.Millisecond,
		StaleGraceDuration: time.Duration(cfg.StatsStaleGraceMS) * time.Millisecond,
	}
}

// TTLFor returns the TTL for a given game.
func (c CacheConfig) TTLFor(game backends.Game) time.Duration {
	switch game {
	case backends.GameR6:
		if c.TTLR6 > 0 {
			return c.TTLR6
		}
		return 60 * time.Second
	default:
		return 60 * time.Second
	}
}

// StaleGrace returns the stale-grace window (default 24h).
func (c CacheConfig) StaleGrace() time.Duration {
	if c.StaleGraceDuration > 0 {
		return c.StaleGraceDuration
	}
	return 24 * time.Hour
}
```

```go
// internal/stats/cache/cache.go
package cache

import (
	"context"
	"fmt"
	"strings"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// CachedStats wraps a single-season stats result with a degraded flag.
// Mirrors Rust CachedStats.
type CachedStats struct {
	Stats     scrape.ScrapedStats
	Degraded  bool
}

// CacheStore is the game-aware cache-or-fetch facade.
// Mirrors Rust StatsCacheStore trait.
type CacheStore interface {
	Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (CachedStats, error)
	FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

// OnFetchFunc is called after a successful backend fetch (for leaderboard integration).
type OnFetchFunc func(ctx context.Context, game backends.Game, username string, stats *scrape.ScrapedStats)

// --- Redis key helpers (exported for tests) ---

func platformKey(p fetch.StatsPlatform) string {
	switch p {
	case fetch.StatsPlatformPC:
		return "pc"
	case fetch.StatsPlatformXbox:
		return "xbox"
	case fetch.StatsPlatformPlaystation:
		return "psn"
	default:
		return "auto"
	}
}

// FreshKey returns the Redis hash key for a fresh stats entry.
func FreshKey(game backends.Game, username string, platform fetch.StatsPlatform, season *string) string {
	s := ""
	if season != nil {
		s = *season
	}
	return fmt.Sprintf("stats:%s:%s:%s:%s", game, strings.ToLower(strings.TrimSpace(username)), platformKey(platform), s)
}

// StaleKey returns the Redis hash key for a stale-grace entry.
func StaleKey(game backends.Game, username string, platform fetch.StatsPlatform, season *string) string {
	s := ""
	if season != nil {
		s = *season
	}
	return fmt.Sprintf("stats:stale:%s:%s:%s:%s", game, strings.ToLower(strings.TrimSpace(username)), platformKey(platform), s)
}

// CollectionKey returns the Redis hash key for a collection entry.
func CollectionKey(game backends.Game, username string, platform fetch.StatsPlatform) string {
	return fmt.Sprintf("stats:collection:%s:%s:%s", game, strings.ToLower(strings.TrimSpace(username)), platformKey(platform))
}
```

### Step 4: Run tests to verify they pass

Run: `go test ./internal/stats/cache/... -v`
Expected: PASS.

---

## Task 2: SingleFlight generic

**Files:**

- Create: `internal/stats/cache/singleflight.go`
- Create: `internal/stats/cache/singleflight_test.go`

### Step 1: Write failing tests for SingleFlight

```go
// internal/stats/cache/singleflight_test.go
package cache

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSingleFlight_CoalescesConcurrentWork(t *testing.T) {
	sf := NewSingleFlight[string, int]()
	var counter atomic.Int64

	var wg sync.WaitGroup
	results := make([]int, 50)
	for i := range 50 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = sf.Do("k", func() int {
				time.Sleep(25 * time.Millisecond)
				counter.Add(1)
				return 42
			})
		}(i)
	}
	wg.Wait()

	for i, r := range results {
		if r != 42 {
			t.Errorf("results[%d] = %d, want 42", i, r)
		}
	}
	if got := counter.Load(); got != 1 {
		t.Errorf("closure ran %d times, want 1", got)
	}
}

func TestSingleFlight_DifferentKeysRunIndependently(t *testing.T) {
	sf := NewSingleFlight[string, int]()
	var counter atomic.Int64

	a := sf.Do("a", func() int {
		counter.Add(1)
		return 1
	})
	b := sf.Do("b", func() int {
		counter.Add(1)
		return 2
	})

	if a != 1 || b != 2 {
		t.Errorf("a=%d, b=%d, want 1, 2", a, b)
	}
	if got := counter.Load(); got != 2 {
		t.Errorf("closure ran %d times, want 2", got)
	}
}

func TestSingleFlight_LeaderErrorPropagates(t *testing.T) {
	sf := NewSingleFlight[string, int]()

	var wg sync.WaitGroup
	errs := make([]error, 10)
	for i := range 10 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = sf.DoErr("k", func() (int, error) {
				return 0, assertErr("backend down")
			})
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err == nil || err.Error() != "backend down" {
			t.Errorf("errs[%d] = %v, want 'backend down'", i, err)
		}
	}
}

type assertErr string

func (e assertErr) Error() string { return string(e) }
```

### Step 2: Run tests to verify they fail

Run: `go test ./internal/stats/cache/... -v -run TestSingleFlight`
Expected: FAIL — `NewSingleFlight`, `Do`, `DoErr` not defined.

### Step 3: Implement SingleFlight

```go
// internal/stats/cache/singleflight.go
package cache

import (
	"sync"

	"golang.org/x/sync/singleflight"
)

// SingleFlight coalesces concurrent calls for the same key so the
// underlying function runs exactly once. Unlike golang.org/x/sync/singleflight
// which returns shared results as interface{}, this is a generic wrapper
// that preserves type safety.
//
// Mirrors the Rust SingleFlight<K, V> in cache_store.rs but uses the
// standard library's singleflight under the hood (which uses channels
// internally, matching the Rust watch-channel approach).
type SingleFlight[K comparable, V any] struct {
	group singleflight.Group
}

// NewSingleFlight creates a new typed singleflight group.
func NewSingleFlight[K comparable, V any]() *SingleFlight[K, V] {
	return &SingleFlight[K, V]{}
}

// Do calls fn exactly once for concurrent calls with the same key.
// All callers receive the same result. The key must be a string
// (use fmt.Sprintf or a string-typed key type).
func (sf *SingleFlight[K, V]) Do(key K, fn func() V) V {
	result, _, _ := sf.DoErr(key, func() (V, error) {
		return fn(), nil
	})
	return result
}

// DoErr is like Do but supports an error return from fn.
// On error, all waiting callers receive the same error.
func (sf *SingleFlight[K, V]) DoErr(key K, fn func() (V, error)) (V, error, bool) {
	val, err, shared := sf.group.Do(fmtKey(key), func() (any, error) {
		v, err := fn()
		return v, err
	})
	if err != nil {
		var zero V
		return zero, err, shared
	}
	return val.(V), nil, shared
}

func fmtKey[K comparable](k K) string {
	// Most common case: K is already string.
	if s, ok := any(k).(string); ok {
		return s
	}
	return fmt.Sprintf("%v", k)
}
```

### Step 4: Run tests to verify they pass

Run: `go test ./internal/stats/cache/... -v -run TestSingleFlight`
Expected: PASS.

### Step 5: Verify `go vet` clean

Run: `go vet ./internal/stats/cache/...`
Expected: clean.

---

## Task 3: DirectCacheStore

**Files:**

- Create: `internal/stats/cache/direct.go`
- Create: `internal/stats/cache/direct_test.go`

### Step 1: Write failing tests for DirectCacheStore

```go
// internal/stats/cache/direct_test.go
package cache

import (
	"context"
	"testing"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// fakeBackend implements backends.StatsBackend for testing.
type fakeBackend struct {
	game        backends.Game
	fetchFn     func(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error)
	fetchCollFn func(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error)
}

func (f *fakeBackend) Game() backends.Game { return f.game }
func (f *fakeBackend) Fetch(ctx context.Context, username string, platform fetch.StatsPlatform, season *string) (scrape.ScrapedStats, error) {
	return f.fetchFn(ctx, username, platform, season)
}
func (f *fakeBackend) FetchCollection(ctx context.Context, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return f.fetchCollFn(ctx, username, platform)
}

func TestDirectCacheStore_Fetch_Passthrough(t *testing.T) {
	want := scrape.ScrapedStats{
		Profile:     scrape.StatsProfile{Username: "alice", Level: 100},
		RankedStats: scrape.RankedStats{RankPoints: 3200},
	}
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	store := NewDirectCacheStore(reg)
	got, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Degraded {
		t.Error("Degraded should be false for DirectCacheStore")
	}
	if got.Stats.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Stats.Profile.Username, "alice")
	}
}

func TestDirectCacheStore_Fetch_PropagatesError(t *testing.T) {
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "not found", false)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	store := NewDirectCacheStore(reg)
	_, err := store.Fetch(context.Background(), backends.GameR6, "nobody", fetch.StatsPlatformPC, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	ferr, ok := err.(*fetch.StatsFetchError)
	if !ok {
		t.Fatalf("error type = %T, want *fetch.StatsFetchError", err)
	}
	if ferr.Kind != fetch.StatsFetchErrorProfileNotFound {
		t.Errorf("kind = %v, want ProfileNotFound", ferr.Kind)
	}
}

func TestDirectCacheStore_FetchCollection_Passthrough(t *testing.T) {
	want := scrape.ScrapedStatsCollection{
		Latest: scrape.ScrapedStats{Profile: scrape.StatsProfile{Username: "alice"}},
		BySeason: map[string]scrape.ScrapedStats{
			"y9s1": {Profile: scrape.StatsProfile{Username: "alice"}},
		},
	}
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchCollFn: func(_ context.Context, _ string, _ fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return want, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	store := NewDirectCacheStore(reg)
	got, err := store.FetchCollection(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformAuto)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Latest.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Latest.Profile.Username, "alice")
	}
}
```

### Step 2: Run tests to verify they fail

Run: `go test ./internal/stats/cache/... -v -run TestDirect`
Expected: FAIL — `NewDirectCacheStore` not defined.

### Step 3: Implement DirectCacheStore

```go
// internal/stats/cache/direct.go
package cache

import (
	"context"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

// DirectCacheStore is a passthrough that always calls the backend registry.
// Used when REDIS_URL is not configured. Mirrors Rust DirectStatsCacheStore.
type DirectCacheStore struct {
	registry *backends.StatsBackendRegistry
}

// NewDirectCacheStore wraps a backend registry.
func NewDirectCacheStore(registry *backends.StatsBackendRegistry) *DirectCacheStore {
	return &DirectCacheStore{registry: registry}
}

// Fetch delegates to the backend registry. Degraded is always false.
func (d *DirectCacheStore) Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (CachedStats, error) {
	stats, err := d.registry.Fetch(ctx, game, username, platform, season)
	if err != nil {
		return CachedStats{}, err
	}
	return CachedStats{Stats: stats, Degraded: false}, nil
}

// FetchCollection delegates to the backend registry.
func (d *DirectCacheStore) FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	return d.registry.FetchCollection(ctx, game, username, platform)
}
```

### Step 4: Run tests to verify they pass

Run: `go test ./internal/stats/cache/... -v -run TestDirect`
Expected: PASS.

---

## Task 4: RedisCacheStore

**Files:**

- Create: `internal/stats/cache/redis.go`
- Create: `internal/stats/cache/redis_test.go`

### Step 1: Write failing tests for RedisCacheStore

```go
// internal/stats/cache/redis_test.go
package cache

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

func newTestRedis(t *testing.T) (*miniredis.Miniredis, redis.Cmdable) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	return mr, client
}

func sampleStats() scrape.ScrapedStats {
	return scrape.ScrapedStats{
		Profile:     scrape.StatsProfile{Username: "alice", Level: 100},
		RankedStats: scrape.RankedStats{Season: "y9s1", RankPoints: 3200, WinRate: 0.55},
		CalculatedMetrics: scrape.CalculatedMetrics{KOST: 0.72},
	}
}

func TestRedisCacheStore_Fetch_Hit(t *testing.T) {
	mr, client := newTestRedis(t)
	stats := sampleStats()

	// Pre-populate the fresh key.
	key := FreshKey(backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	pJSON, _ := json.Marshal(stats.Profile)
	rJSON, _ := json.Marshal(stats.RankedStats)
	mJSON, _ := json.Marshal(stats.CalculatedMetrics)
	mr.HSet(key, "p", string(pJSON))
	mr.HSet(key, "r", string(rJSON))
	mr.HSet(key, "m", string(mJSON))
	mr.SetTTL(key, 60*time.Second)

	reg := backends.NewStatsBackendRegistry()
	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	got, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Degraded {
		t.Error("Degraded should be false on cache hit")
	}
	if got.Stats.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Stats.Profile.Username, "alice")
	}
	if got.Stats.RankedStats.RankPoints != 3200 {
		t.Errorf("rank points = %d, want 3200", got.Stats.RankedStats.RankPoints)
	}
}

func TestRedisCacheStore_Fetch_Miss_ThenBackend(t *testing.T) {
	mr, client := newTestRedis(t)
	stats := sampleStats()

	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return stats, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	got, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Stats.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Stats.Profile.Username, "alice")
	}

	// Verify fresh key was written.
	freshKey := FreshKey(backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	exists := mr.Exists(freshKey)
	if !exists {
		t.Error("fresh key should exist after backend fetch")
	}

	// Verify stale key was written.
	staleKey := StaleKey(backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	exists = mr.Exists(staleKey)
	if !exists {
		t.Error("stale key should exist after backend fetch")
	}
}

func TestRedisCacheStore_Fetch_StaleFallback(t *testing.T) {
	mr, client := newTestRedis(t)
	stats := sampleStats()

	// Pre-populate the stale key only.
	staleKey := StaleKey(backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	pJSON, _ := json.Marshal(stats.Profile)
	rJSON, _ := json.Marshal(stats.RankedStats)
	mJSON, _ := json.Marshal(stats.CalculatedMetrics)
	mr.HSet(staleKey, "p", string(pJSON))
	mr.HSet(staleKey, "r", string(rJSON))
	mr.HSet(staleKey, "m", string(mJSON))
	mr.SetTTL(staleKey, 24*time.Hour)

	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorGcUnavailable, "upstream down", true)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	got, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Degraded {
		t.Error("Degraded should be true on stale fallback")
	}
	if got.Stats.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Stats.Profile.Username, "alice")
	}
}

func TestRedisCacheStore_Fetch_GcUnavailable_NoStale(t *testing.T) {
	_, client := newTestRedis(t)

	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorGcUnavailable, "upstream down", true)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	_, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, nil)
	if err == nil {
		t.Fatal("expected error when no stale data available")
	}
	ferr, ok := err.(*fetch.StatsFetchError)
	if !ok {
		t.Fatalf("error type = %T, want *fetch.StatsFetchError", err)
	}
	if ferr.Kind != fetch.StatsFetchErrorGcUnavailable {
		t.Errorf("kind = %v, want GcUnavailable", ferr.Kind)
	}
}

func TestRedisCacheStore_Fetch_NonGcError_Propagates(t *testing.T) {
	_, client := newTestRedis(t)

	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return scrape.ScrapedStats{}, fetch.NewStatsFetchError(fetch.StatsFetchErrorProfileNotFound, "not found", false)
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	_, err := store.Fetch(context.Background(), backends.GameR6, "nobody", fetch.StatsPlatformPC, nil)
	if err == nil {
		t.Fatal("expected error")
	}
	ferr := err.(*fetch.StatsFetchError)
	if ferr.Kind != fetch.StatsFetchErrorProfileNotFound {
		t.Errorf("kind = %v, want ProfileNotFound", ferr.Kind)
	}
}

func TestRedisCacheStore_FetchCollection_Hit(t *testing.T) {
	mr, client := newTestRedis(t)
	stats := sampleStats()
	coll := scrape.ScrapedStatsCollection{
		Latest:   stats,
		BySeason: map[string]scrape.ScrapedStats{"y9s1": stats},
		SeasonCatalog: []scrape.SeasonCatalogEntry{{Slug: "y9s1", Display: "Year 9 Season 1"}},
	}

	key := CollectionKey(backends.GameR6, "alice", fetch.StatsPlatformAuto)
	latestJSON, _ := json.Marshal(coll.Latest)
	bySeasonJSON, _ := json.Marshal(coll.BySeason)
	catalogJSON, _ := json.Marshal(coll.SeasonCatalog)
	mr.HSet(key, "latest", string(latestJSON))
	mr.HSet(key, "by_season", string(bySeasonJSON))
	mr.HSet(key, "catalog", string(catalogJSON))
	mr.SetTTL(key, 60*time.Second)

	reg := backends.NewStatsBackendRegistry()
	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	got, err := store.FetchCollection(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformAuto)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Latest.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Latest.Profile.Username, "alice")
	}
	if len(got.BySeason) != 1 {
		t.Errorf("BySeason length = %d, want 1", len(got.BySeason))
	}
}

func TestRedisCacheStore_FetchCollection_Miss(t *testing.T) {
	_, client := newTestRedis(t)
	coll := scrape.ScrapedStatsCollection{
		Latest:   sampleStats(),
		BySeason: map[string]scrape.ScrapedStats{"y9s1": sampleStats()},
	}

	backend := &fakeBackend{
		game: backends.GameR6,
		fetchCollFn: func(_ context.Context, _ string, _ fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
			return coll, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	got, err := store.FetchCollection(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformAuto)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Latest.Profile.Username != "alice" {
		t.Errorf("username = %q, want %q", got.Latest.Profile.Username, "alice")
	}
}

func TestRedisCacheStore_OnFetchCallback(t *testing.T) {
	_, client := newTestRedis(t)
	stats := sampleStats()

	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			return stats, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	var called bool
	var cbGame backends.Game
	var cbUsername string
	onFetch := func(_ context.Context, game backends.Game, username string, s *scrape.ScrapedStats) {
		called = true
		cbGame = game
		cbUsername = username
	}

	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, onFetch)

	_, err := store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !called {
		t.Error("OnFetch callback was not called")
	}
	if cbGame != backends.GameR6 {
		t.Errorf("callback game = %v, want GameR6", cbGame)
	}
	if cbUsername != "alice" {
		t.Errorf("callback username = %q, want %q", cbUsername, "alice")
	}
}
```

### Step 2: Run tests to verify they fail

Run: `go test ./internal/stats/cache/... -v -run TestRedis`
Expected: FAIL — `NewRedisCacheStore` not defined.

### Step 3: Implement RedisCacheStore

```go
// internal/stats/cache/redis.go
package cache

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/pactum-computers/parley/internal/stats/backends"
	"github.com/pactum-computers/parley/internal/stats/fetch"
	"github.com/pactum-computers/parley/internal/stats/scrape"
)

const (
	hProfile  = "p"
	hRanked   = "r"
	hMetrics  = "m"
	hLatest   = "latest"
	hBySeason = "by_season"
	hCatalog  = "catalog"
)

// RedisCacheStore implements CacheStore with Redis hash-backed caching,
// stale-grace fallback, and singleflight deduplication.
// Mirrors Rust RedisStatsCacheStore.
type RedisCacheStore struct {
	client  redis.Cmdable
	registry *backends.StatsBackendRegistry
	cfg      CacheConfig
	flight   *SingleFlight[string, fetchResult]
	onFetch  OnFetchFunc
}

// fetchResult wraps the backend fetch outcome for singleflight sharing.
type fetchResult struct {
	stats scrape.ScrapedStats
	err   error
}

// NewRedisCacheStore creates a Redis-backed cache store.
// onFetch may be nil; when set, it is called on every successful backend
// fetch (wire it to leaderboard.Touch at construction time).
func NewRedisCacheStore(
	client redis.Cmdable,
	registry *backends.StatsBackendRegistry,
	cfg CacheConfig,
	onFetch OnFetchFunc,
) *RedisCacheStore {
	return &RedisCacheStore{
		client:   client,
		registry: registry,
		cfg:      cfg,
		flight:   NewSingleFlight[string, fetchResult](),
		onFetch:  onFetch,
	}
}

func statsFromHash(fields map[string]string) *scrape.ScrapedStats {
	pRaw, ok := fields[hProfile]
	if !ok {
		return nil
	}
	rRaw, ok := fields[hRanked]
	if !ok {
		return nil
	}
	mRaw, ok := fields[hMetrics]
	if !ok {
		return nil
	}

	var profile scrape.StatsProfile
	var ranked scrape.RankedStats
	var metrics scrape.CalculatedMetrics
	if json.Unmarshal([]byte(pRaw), &profile) != nil ||
		json.Unmarshal([]byte(rRaw), &ranked) != nil ||
		json.Unmarshal([]byte(mRaw), &metrics) != nil {
		return nil
	}
	return &scrape.ScrapedStats{
		Profile:           profile,
		RankedStats:       ranked,
		CalculatedMetrics: metrics,
	}
}

func collectionFromHash(fields map[string]string) *scrape.ScrapedStatsCollection {
	latestRaw, ok := fields[hLatest]
	if !ok {
		return nil
	}
	bySeasonRaw, ok := fields[hBySeason]
	if !ok {
		return nil
	}
	catalogRaw, ok := fields[hCatalog]
	if !ok {
		return nil
	}

	var latest scrape.ScrapedStats
	var bySeason map[string]scrape.ScrapedStats
	var catalog []scrape.SeasonCatalogEntry
	if json.Unmarshal([]byte(latestRaw), &latest) != nil ||
		json.Unmarshal([]byte(bySeasonRaw), &bySeason) != nil ||
		json.Unmarshal([]byte(catalogRaw), &catalog) != nil {
		return nil
	}
	return &scrape.ScrapedStatsCollection{
		Latest:        latest,
		BySeason:      bySeason,
		SeasonCatalog: catalog,
	}
}

// Fetch looks up the fresh key in Redis. On miss, it coalesces concurrent
// callers via singleflight, calls the backend, writes both fresh and stale
// hashes, and returns. On GcUnavailable, it falls back to the stale key.
func (r *RedisCacheStore) Fetch(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform, season *string) (CachedStats, error) {
	fresh := FreshKey(game, username, platform, season)
	stale := StaleKey(game, username, platform, season)

	// Fast path: check fresh key.
	fields, err := r.client.HGetAll(ctx, fresh).Result()
	if err == nil {
		if stats := statsFromHash(fields); stats != nil {
			return CachedStats{Stats: *stats, Degraded: false}, nil
		}
	}

	// Miss — coalesce via singleflight.
	flightKey := strings.ToLower(strings.TrimSpace(username))
	seasonKey := ""
	if season != nil {
		seasonKey = *season
	}
	sfKey := FreshKey(game, flightKey, platform, &seasonKey)

	result := r.flight.Do(sfKey, func() fetchResult {
		stats, err := r.registry.Fetch(ctx, game, username, platform, season)
		return fetchResult{stats: stats, err: err}
	})

	if result.err != nil {
		// On GcUnavailable, try stale fallback.
		if ferr, ok := result.err.(*fetch.StatsFetchError); ok && ferr.Kind == fetch.StatsFetchErrorGcUnavailable {
			staleFields, sErr := r.client.HGetAll(ctx, stale).Result()
			if sErr == nil {
				if stats := statsFromHash(staleFields); stats != nil {
					return CachedStats{Stats: *stats, Degraded: true}, nil
				}
			}
		}
		return CachedStats{}, result.err
	}

	// Success — write fresh + stale hashes atomically via pipeline.
	ttlSecs := int64(r.cfg.TTLFor(game).Seconds())
	graceSecs := int64(r.cfg.StaleGrace().Seconds())

	pJSON, _ := json.Marshal(result.stats.Profile)
	rJSON, _ := json.Marshal(result.stats.RankedStats)
	mJSON, _ := json.Marshal(result.stats.CalculatedMetrics)

	pipe := r.client.Pipeline()
	pipe.HSet(ctx, fresh, hProfile, string(pJSON))
	pipe.HSet(ctx, fresh, hRanked, string(rJSON))
	pipe.HSet(ctx, fresh, hMetrics, string(mJSON))
	pipe.Expire(ctx, fresh, time.Duration(ttlSecs)*time.Second)
	pipe.HSet(ctx, stale, hProfile, string(pJSON))
	pipe.HSet(ctx, stale, hRanked, string(rJSON))
	pipe.HSet(ctx, stale, hMetrics, string(mJSON))
	pipe.Expire(ctx, stale, time.Duration(graceSecs)*time.Second)
	_, _ = pipe.Exec(ctx) // best-effort cache write

	// Fire callback (leaderboard integration).
	if r.onFetch != nil {
		r.onFetch(ctx, game, username, &result.stats)
	}

	return CachedStats{Stats: result.stats, Degraded: nil}, nil
}

// FetchCollection checks the collection key in Redis, then falls back to
// the backend. No singleflight for collections (matches Rust behavior).
func (r *RedisCacheStore) FetchCollection(ctx context.Context, game backends.Game, username string, platform fetch.StatsPlatform) (scrape.ScrapedStatsCollection, error) {
	key := CollectionKey(game, username, platform)

	fields, err := r.client.HGetAll(ctx, key).Result()
	if err == nil {
		if coll := collectionFromHash(fields); coll != nil {
			return *coll, nil
		}
	}

	result, err := r.registry.FetchCollection(ctx, game, username, platform)
	if err != nil {
		return scrape.ScrapedStatsCollection{}, err
	}

	ttlSecs := int64(r.cfg.TTLFor(game).Seconds())

	latestJSON, _ := json.Marshal(result.Latest)
	bySeasonJSON, _ := json.Marshal(result.BySeason)
	catalogJSON, _ := json.Marshal(result.SeasonCatalog)

	pipe := r.client.Pipeline()
	pipe.HSet(ctx, key, hLatest, string(latestJSON))
	pipe.HSet(ctx, key, hBySeason, string(bySeasonJSON))
	pipe.HSet(ctx, key, hCatalog, string(catalogJSON))
	pipe.Expire(ctx, key, time.Duration(ttlSecs)*time.Second)
	_, _ = pipe.Exec(ctx)

	return result, nil
}
```

### Step 4: Run tests to verify they pass

Run: `go test ./internal/stats/cache/... -v -run TestRedis`
Expected: PASS.

### Step 5: Run all cache tests

Run: `go test ./internal/stats/cache/... -v`
Expected: ALL PASS.

### Step 6: Verify `go vet` clean

Run: `go vet ./internal/stats/cache/...`
Expected: clean.

---

## Task 5: Full suite + edge cases

**Files:**

- Modify: `internal/stats/cache/redis_test.go` (append)
- Modify: `internal/stats/cache/singleflight_test.go` (append)

### Step 1: Add singleflight dedup integration test for RedisCacheStore

Append to `redis_test.go`:

```go
func TestRedisCacheStore_Fetch_SingleFlightDedup(t *testing.T) {
	_, client := newTestRedis(t)
	stats := sampleStats()

	var fetchCount int32
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			fetchCount++
			time.Sleep(50 * time.Millisecond) // simulate latency
			return stats, nil
		},
	}
	reg := backends.NewStatsBackendRegistry()
	reg.Register(backend)

	cfg := CacheConfig{TTLR6: 60 * time.Second, StaleGraceDuration: 24 * time.Hour}
	store := NewRedisCacheStore(client, reg, cfg, nil)

	var wg sync.WaitGroup
	errs := make([]error, 20)
	for i := range 20 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = store.Fetch(context.Background(), backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Errorf("goroutine %d: %v", i, err)
		}
	}
	if fetchCount != 1 {
		t.Errorf("backend called %d times, want 1 (singleflight)", fetchCount)
	}
}
```

### Step 2: Add concurrent different-key test for SingleFlight

Append to `singleflight_test.go`:

```go
func TestSingleFlight_ConcurrentDifferentKeys(t *testing.T) {
	sf := NewSingleFlight[string, int]()
	var counter atomic.Int64

	var wg sync.WaitGroup
	for i := range 10 {
		wg.Add(1)
		key := fmt.Sprintf("key-%d", i)
		go func() {
			defer wg.Done()
			sf.Do(key, func() int {
				counter.Add(1)
				return 1
			})
		}()
	}
	wg.Wait()

	if got := counter.Load(); got != 10 {
		t.Errorf("closure ran %d times, want 10 (10 distinct keys)", got)
	}
}
```

### Step 3: Run full test suite

Run: `go test ./internal/stats/cache/... -v -count=1`
Expected: ALL PASS.

### Step 4: Race detector

Run: `go test ./internal/stats/cache/... -race -count=1`
Expected: ALL PASS, no data races.

---

## Self-review (spec coverage)

| Requirement                                      | Task                                                |
| ------------------------------------------------ | --------------------------------------------------- |
| `CacheStore` interface (Fetch + FetchCollection) | Task 1                                              |
| `DirectCacheStore` passthrough                   | Task 3                                              |
| `RedisCacheStore` with Redis hash caching        | Task 4                                              |
| `SingleFlight` generic dedup                     | Task 2                                              |
| TTL from config (per-game)                       | Task 1 (CacheConfig)                                |
| Stale-grace from config                          | Task 4 (RedisCacheStore.Fetch fallback)             |
| `golang.org/x/sync/singleflight` usage           | Task 2                                              |
| String keys `game:username:platform:season`      | Task 1 (key helpers)                                |
| Leaderboard integration via OnFetch callback     | Task 4                                              |
| No raw SQL in cache package                      | File map — all files are in `internal/stats/cache/` |
| Miniredis tests for Redis paths                  | Tasks 4–5                                           |
| Race detector clean                              | Task 5                                              |
| Append notepad                                   | Task 6                                              |

---

## Implementation notepad

_(Implementer: append one line per completed task below.)_

- Plan written 2026-06-15 — Task 23 scope: `internal/stats/cache/` with CacheStore interface, DirectCacheStore, RedisCacheStore, SingleFlight generic.
- T23 complete 2026-06-15 — 8 files created: config.go, cache.go, direct.go, singleflight.go, redis.go + 3 test files. 21 tests pass, race-detector clean. `go mod tidy` promoted go-redis/v9 + x/sync to direct deps.
- T24 complete 2026-06-15 — `internal/stats/persist/` (persister.go, persisting.go, persisting_test.go); `PlayerStatSnapshotRepo.Insert`; 5 tests pass (`go test ./internal/stats/persist/...`).

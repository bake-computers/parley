package cache

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
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
	t.Cleanup(func() { _ = client.Close() })
	return mr, client
}

func sampleStats() scrape.ScrapedStats {
	return scrape.ScrapedStats{
		Profile:           scrape.StatsProfile{Username: "alice", Level: 100},
		RankedStats:       scrape.RankedStats{Season: "y9s1", RankPoints: 3200, WinRate: 0.55},
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
	if !mr.Exists(freshKey) {
		t.Error("fresh key should exist after backend fetch")
	}

	// Verify stale key was written.
	staleKey := StaleKey(backends.GameR6, "alice", fetch.StatsPlatformPC, strPtr("y9s1"))
	if !mr.Exists(staleKey) {
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
		Latest:        stats,
		BySeason:      map[string]scrape.ScrapedStats{"y9s1": stats},
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
	onFetch := func(_ context.Context, game backends.Game, username string, _ *scrape.ScrapedStats) {
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

func TestRedisCacheStore_Fetch_SingleFlightDedup(t *testing.T) {
	_, client := newTestRedis(t)
	stats := sampleStats()

	var fetchCount atomic.Int32
	backend := &fakeBackend{
		game: backends.GameR6,
		fetchFn: func(_ context.Context, _ string, _ fetch.StatsPlatform, _ *string) (scrape.ScrapedStats, error) {
			fetchCount.Add(1)
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
	if got := fetchCount.Load(); got != 1 {
		t.Errorf("backend called %d times, want 1 (singleflight)", got)
	}
}
